// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import cookieParser from 'cookie-parser';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';

import Production, { normalizeSlug } from './models/Production.js';
import User from './models/User.js';

import { passport } from './passport.js';

// Routers
import authRouter from './routes/auth.js';
import tenantRouter from './routes/tenant.js';
import userRoutes from './routes/users.js';
import runsheetRoutes from './routes/runsheets.js';
import itemRoutes from './routes/items.js';
import placeRoutes from './routes/places.js';
import supplierRoutes from './routes/suppliers.js';
import peopleRoutes from './routes/people.js';
import adminUsersRouter from './routes/adminuser.js';
import setRoutes from './routes/sets.js';
import productionRoutes from './routes/productions.js';
import runsheetHandRouter from './routes/runsheetHand.js';

import { authRequired, issueJwt } from './middleware/auth.js';
import { requireMembership } from './middleware/requireMembership.js';

// If you already have this service, we'll use it; otherwise the fallback below handles it.
import { ensureTempAccountAndInvite } from './services/users.js';
import ocrRouter from './routes/ocr.js';
import ownerRoutes from './routes/owner.js';


const app = express();

/* ------------------------------ Stripe ------------------------------ */
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY in environment (.env).');
const stripe = new Stripe(STRIPE_SECRET_KEY); // optionally: { apiVersion: '2024-06-20' }

/* ------------------------------- CORS -------------------------------- */
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowlist = ['https://set-dec.com', 'https://www.set-dec.com', ORIGIN];
app.use(
  cors({
    origin: (origin, cb) => (!origin || allowlist.includes(origin) ? cb(null, true) : cb(new Error('CORS'))),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-production-id', 'X-Production-Id'],
    credentials: false,
  })
);

app.set('trust proxy', process.env.TRUST_PROXY ? 1 : 0);
app.use(cookieParser());
app.use(passport.initialize());

/* --------------------------- Static uploads --------------------------- */
// Prefer a project-relative uploads dir (avoid "/uploads" root which causes EACCES)
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
app.use(
  '/uploads',
  express.static(UPLOAD_ROOT, {
    fallthrough: true,
    index: false,
    dotfiles: 'ignore',
    setHeaders(res) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    },
  })
);

const FRONTEND_URL = process.env.FRONTEND_URL || ORIGIN;

/* --------------------------- Mailer (inline) --------------------------- */
const MAIL_FROM = process.env.MAIL_FROM || 'no-reply@magiccatsoftware.ca';
const APP_BASE_URL = process.env.APP_BASE_URL || FRONTEND_URL;
const LOGIN_PATH = process.env.LOGIN_PATH || '/login';

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,                                  // e.g. smtp.gmail.com
  port: Number(process.env.SMTP_PORT || 587),                   // 465 for SSL, 587 for STARTTLS
  secure: process.env.SMTP_SECURE === 'true',                   // true => port 465
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  tls: { minVersion: 'TLSv1.2' },
});

// Optional SMTP verify on boot
if (process.env.VERIFY_SMTP === 'true') {
  mailer
    .verify()
    .then(() => console.log('SMTP: ready'))
    .catch((err) => console.error('SMTP verify failed:', err.message));
}

/** Generic email sender */
async function sendMail({ to, subject, html, text, from = MAIL_FROM, headers }) {
  if (!to) throw new Error('sendMail: "to" is required');
  if (!subject) throw new Error('sendMail: "subject" is required');
  const info = await mailer.sendMail({ from, to, subject, html, text, headers });
  if (process.env.NODE_ENV !== 'production') {
    console.log('Mail sent:', info.messageId);
  }
  return info;
}

/** Temporary password email */
async function sendTempPasswordEmail({
  to,
  name = '',
  tempPassword,
  productionTitle = 'your account',
  loginPath = LOGIN_PATH,
}) {
  if (!to) throw new Error('sendTempPasswordEmail: "to" is required');
  if (!tempPassword) throw new Error('sendTempPasswordEmail: "tempPassword" is required');

  const loginUrl = `${APP_BASE_URL}${loginPath}`;
  const subject = `Your ${productionTitle} is ready — temporary password inside`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Welcome${name ? `, ${name}` : ''}!</h2>
      <p>We've set up your account${productionTitle ? ` for <strong>${productionTitle}</strong>` : ''}.</p>
      <p><strong>Temporary password:</strong></p>
      <pre style="background:#f5f5f7;padding:12px;border-radius:8px;display:inline-block;">${tempPassword}</pre>
      <p>Please sign in and change it right away:</p>
      <p><a href="${loginUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111;color:#fff;text-decoration:none;">Sign in</a></p>
      <p style="color:#666;font-size:13px;margin-top:18px;">If you didn’t expect this email, you can ignore it.</p>
    </div>
  `;
  const text = `Welcome${name ? `, ${name}` : ''}!
Temporary password: ${tempPassword}
Sign in: ${loginUrl}
For security, please change it right away.`;

  return sendMail({ to, subject, html, text });
}

/* ----------------- Helpers: membership + temp password ----------------- */
async function attachMembership(prod, user) {
  await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prod._id } });
  const hasMembers = await Production.exists({ _id: prod._id, 'members.0': { $exists: true } });
  const role = hasMembers ? 'editor' : 'admin';
  await Production.updateOne(
    { _id: prod._id, 'members.user': { $ne: user._id } },
    {
      $push: { members: { user: user._id, role, addedAt: new Date() } },
      ...(hasMembers ? {} : { $set: { ownerUserId: user._id } }),
    }
  );
  return role;
}

// Crypto-strong, URL-safe temporary password (12 chars by default)
function genTempPassword(length = 12) {
  return crypto.randomBytes(Math.ceil((length * 3) / 4)).toString('base64url').slice(0, length);
}

/* ---------------------------- Stripe webhook ---------------------------- */
/** IMPORTANT: keep this BEFORE express.json() — it needs the raw body */
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let evt;

  try {
    evt = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verify failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (evt.type === 'checkout.session.completed') {
    try {
      const session = evt.data.object;
      const meta = session.metadata || {};
      const title = meta.title || 'Production';
      const slug = normalizeSlug(meta.desiredSlug || title);
      const currency = (session.currency ?? process.env.CURRENCY) || 'usd';

      // Ensure production exists (idempotent)
      const prod = await Production.findOneAndUpdate(
        { slug },
        {
          $setOnInsert: {
            title,
            slug,
            stripe: {
              checkoutSessionId: session.id,
              paymentIntentId: session.payment_intent,
              amount: session.amount_total ?? null,
              currency,
            },
            isActive: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Resolve purchaser email
      let email = session?.customer_details?.email || session?.customer_email || null;
      if (!email && session.customer) {
        try {
          const cust = await stripe.customers.retrieve(session.customer);
          email = cust?.email || null;
        } catch {
          /* ignore */
        }
      }

      if (email) {
        const firstName = session?.customer_details?.name?.split(' ')?.[0] || '';
        // Prefer your service if present; otherwise fallback to inline creation
        let user, created, tempPassword;

        if (typeof ensureTempAccountAndInvite === 'function') {
          ({ user, created, tempPassword } =
            (await ensureTempAccountAndInvite(String(email).toLowerCase(), { firstName })) || {});
        }

        // Fallback if service didn't return what we need
        if (!user) {
          const emailLC = String(email).toLowerCase();
          user = await User.findOne({ email: emailLC });
          if (!user) {
            created = true;
            tempPassword = genTempPassword();
            const passwordHash = await bcrypt.hash(tempPassword, 12);
            user = await User.create({
              email: emailLC,
              firstName,
              role: 'user',
              passwordHash,
              mustChangePassword: true,
              isActive: true,
            });
          } else {
            created = false;
          }
        }


        // Attach membership
        await attachMembership(prod, user);

        // Email temp password ONLY for brand new users
        
      } else {
        console.warn('Checkout completed but no customer email found; cannot attach user membership.');
      }
    } catch (err) {
      // Log but still acknowledge to prevent endless Stripe retries for non-retryable errors
      console.error('Error handling checkout.session.completed:', err);
    }
  }

  return res.json({ received: true });
});

/* ---------------------- JSON / logging (AFTER webhook) --------------------- */
app.use(express.json());
app.use(morgan('dev'));

/* -------------------------------- Mongo -------------------------------- */
await mongoose.connect(process.env.MONGODB_URI);

/* -------------------------------- Public routes --------------------------- */
app.use('/auth', authRouter);
app.use('/tenant/auth', authRouter);
app.use('/tenant/ocr', ocrRouter);
app.use('/tenant/runsheetsbyhand', runsheetHandRouter);
app.use('/owner/productions',ownerRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Public: resolve by slug
app.get('/productions/by-slug/:slug', async (req, res) => {
  const slug = normalizeSlug(req.params.slug || '');
  const prod = await Production.findOne({ slug, isActive: true }).select('_id title slug').lean();
  if (!prod) return res.status(404).json({ error: 'Production not found' });
  res.json(prod);
});

// Stripe account probe (dev helper)
app.get('/stripe/check', async (_req, res) => {
  try {
    const account = await stripe.accounts.retrieve();
    res.json({ ok: true, account: account.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Create Checkout Session
app.post('/checkout/session', async (req, res) => {
  try {
    const { title, production } = req.body || {};
    const cleanTitle = String(title || '').trim();
    const slug = normalizeSlug(production?.slug || cleanTitle);

    if (!cleanTitle) return res.status(400).json({ error: 'Title required' });
    if (!slug) return res.status(400).json({ error: 'Slug required' });

    // Ensure slug not already taken
    const exists = await Production.exists({ slug });
    if (exists) return res.status(409).json({ error: 'Slug already in use' });

    const price = parseInt(process.env.PRICE_CENTS || '9900', 10);
    const currency = (process.env.CURRENCY || 'usd').toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      success_url: `${ORIGIN}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${ORIGIN}/?canceled=1`,
      customer_creation: 'always',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            product_data: { name: `Set-Dec Production: ${cleanTitle}` },
            unit_amount: price,
          },
        },
      ],
      metadata: { title: cleanTitle, desiredSlug: slug },
    });

    return res.json({ url: session.url });
  } catch (e) {
    const detail = e?.raw || e;
    console.error('Create Checkout Session error:', {
      type: detail?.type,
      code: detail?.code,
      message: detail?.message || e?.message,
    });
    return res
      .status(e?.statusCode || 500)
      .json({
        error: detail?.message || 'Failed to create checkout session',
        code: detail?.code || undefined,
      });
  }
});

/**
 * Fallback “Thank You” resolver.
 * If webhook hasn’t run yet, we attach membership here so UI can proceed.
 */
app.get('/checkout/sessions/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    const meta = session.metadata || {};
    const title = meta.title || 'Production';
    const slug = normalizeSlug(meta.desiredSlug || title);

    // Ensure Production exists (idempotent)
    const currency = (session.currency ?? process.env.CURRENCY) || 'usd';
    const prod = await Production.findOneAndUpdate(
      { slug },
      {
        $setOnInsert: {
          title,
          slug,
          stripe: {
            checkoutSessionId: session.id,
            paymentIntentId: session.payment_intent,
            amount: session.amount_total ?? null,
            currency,
          },
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Resolve purchaser email
    const email = session?.customer_details?.email || session?.customer_email || null;

    let user = null;
    if (email) {
      const emailLC = String(email).toLowerCase();

      // Create/find user (temp account if new)
      user = await User.findOne({ email: emailLC });
      if (!user) {
        // Create a minimal account; webhook path will send temp password email
        user = await User.create({ email: emailLC, role: 'user', isActive: true });
      }

      // Keep legacy array in sync (optional)
      await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prod._id } });

      // Insert membership (first member becomes admin + owner)
      const hasMembers = await Production.exists({ _id: prod._id, 'members.0': { $exists: true } });
      const role = hasMembers ? 'editor' : 'admin';
      await Production.updateOne(
        { _id: prod._id, 'members.user': { $ne: user._id } },
        {
          $push: { members: { user: user._id, role, addedAt: new Date() } },
          ...(hasMembers ? {} : { $set: { ownerUserId: user._id } }),
        }
      );
    }

    // Short-lived token so client can auto-login
    let token = null;
    let me = null;
    if (user) {
      token = issueJwt(user, { expiresIn: '12h' });
      me = await User.findById(user._id)
        .select('_id email firstName lastName role siteAuthorized isAdmin productionIds')
        .lean();
    }

    const tempPassword = genTempPassword(12);
          const passwordHash = await bcrypt.hash(tempPassword, 12);
          await User.updateOne(
            { _id: user._id },
            { passwordHash, mustChangePassword: true, isActive: true }
          );

           try {
           const send = await sendTempPasswordEmail({
              to: user.email,
              name: user.name,
              tempPassword,
              productionTitle: prod.name,
              loginPath: LOGIN_PATH,
            });
            console.log(send);
          } catch (mailErr) {
            console.error('Temp password email failed:', mailErr.message);
          }

    res.json({
      status: session.status,
      payment_status: session.payment_status,
      slug: prod.slug,
      title: prod.title,
      productionId: String(prod._id),
      token,
      user: me,
    });
  } catch (e) {
    console.error('checkout session lookup failed:', e.message);
    res.status(404).json({ error: 'Session not found' });
  }
});

// Good: no requireMembership here
app.get('/tenant/productions/by_slug/:slug', async (req, res) => {
  const prod = await Production.findOne({ slug: req.params.slug }).select('_id name slug').lean();
  if (!prod) return res.status(404).json({ error: 'Production not found' });
  res.json(prod);
});


/* ----------------------------- Tenant routes ------------------------------ */
const tenantMw = [authRequired, requireMembership];
app.use('/tenant/productions', tenantMw, productionRoutes);
app.use('/tenant/users', tenantMw, userRoutes);
app.use('/tenant/runsheets', tenantMw, runsheetRoutes);
app.use('/tenant/items', tenantMw, itemRoutes);
app.use('/tenant/places', tenantMw, placeRoutes);
app.use('/tenant/suppliers', tenantMw, supplierRoutes);
app.use('/tenant/people', tenantMw, peopleRoutes);
app.use('/tenant/admin', tenantMw, adminUsersRouter);
app.use('/tenant/sets', tenantMw, setRoutes);

// If you still have miscellaneous tenant endpoints collected in tenantRouter
app.use('/tenant', tenantMw, tenantRouter);

/* --------------------------------- Boot --------------------------------- */
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));


