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


// Optional services and extra routes
import { ensureTempAccountAndInvite } from './services/users.js'; // OK if unused
import ocrRouter from './routes/ocr.js';
import ownerRoutes from './routes/owner.js';
import tenantAuthRouter from './routes/tenantAuth.js';
import {tenantGate} from './middleware/tenantAuth.js';

const app = express();

/* ------------------------------ Stripe ------------------------------ */
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY in environment (.env).');
const stripe = new Stripe(STRIPE_SECRET_KEY /*, { apiVersion: '2024-06-20' }*/);

/* ------------------------------- CORS -------------------------------- */
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowlist = new Set(['https://set-dec.com', 'https://www.set-dec.com', ORIGIN]);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowlist.has(origin)) return cb(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return cb(null, true); // dev convenience
      return cb(new Error(`CORS: origin not allowed: ${origin}`));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    // 🔑 allow ALL custom headers your frontend sends
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Production-Id',
      'X-Production-Slug',
      'X-API-Retried',
      'X-Skip-Pid',
    ],
    // (optional) expose anything you want the browser to read from responses
    exposedHeaders: ['Content-Type'],
    credentials: false,
    optionsSuccessStatus: 204,
  })
);
app.set('trust proxy', process.env.TRUST_PROXY ? 1 : 0);
app.use(cookieParser());
app.use(passport.initialize());

/* --------------------------- Static uploads --------------------------- */
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
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  tls: { minVersion: 'TLSv1.2' },
});

if (process.env.VERIFY_SMTP === 'true') {
  mailer
    .verify()
    .then(() => console.log('SMTP: ready'))
    .catch((err) => console.error('SMTP verify failed:', err.message));
}

async function sendMail({ to, subject, html, text, from = MAIL_FROM, headers }) {
  if (!to) throw new Error('sendMail: "to" is required');
  if (!subject) throw new Error('sendMail: "subject" is required');
  const info = await mailer.sendMail({ from, to, subject, html, text, headers });
  if (process.env.NODE_ENV !== 'production') {
    console.log('Mail sent:', info.messageId);
  }
  return info;
}

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

function genTempPassword(length = 12) {
  return crypto.randomBytes(Math.ceil((length * 3) / 4)).toString('base64url').slice(0, length);
}

/* -------------------------------- Utils -------------------------------- */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
async function findAvailableSlug(baseSlug) {
  const base = normalizeSlug(baseSlug);
  const rx = new RegExp(`^${escapeRegex(base)}(?:-(\\d+))?$`, 'i');
  const existing = await Production.find({ slug: { $regex: rx } }).select('slug').lean();
  if (!existing.length) return base;
  const used = new Set(existing.map(d => d.slug.toLowerCase()));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/* ---------------------------- Stripe webhook ---------------------------- */
/** Keep BEFORE express.json() – needs raw body */
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
      if ((session.payment_status || '').toLowerCase() !== 'paid') {
        return res.json({ received: true, skipped: 'not_paid' });
      }

      const meta = session.metadata || {};
      const title = (meta.title || 'Production').trim();
      const slug  = normalizeSlug(meta.desiredSlug || title);
      const currency = (session.currency ?? process.env.CURRENCY) || 'usd';

      // Idempotency: do we already have this production/session?
      let prod = await Production.findOne({
        $or: [
          { 'stripe.checkoutSessionId': session.id },
          { 'stripe.paymentIntentId': session.payment_intent },
          { slug },
        ],
      }).lean();

      // Purchaser email (owner)
      let email =
        session?.customer_details?.email ||
        session?.customer_email ||
        null;

      if (!email && session.customer) {
        try {
          const cust = await stripe.customers.retrieve(session.customer);
          email = cust?.email || null;
        } catch { /* ignore */ }
      }
      if (!email) {
        console.warn('checkout.session.completed: no customer email — skipping owner creation.');
        return res.json({ received: true, warning: 'no_email' });
      }
      const emailLC = String(email).toLowerCase();

      // Ensure/prepare owner User
      let user = await User.findOne({ email: emailLC });
      let isNewUser = false;
      let tempPassword = null;
      let ownerPasswordHash = null;

      if (!user) {
        isNewUser = true;
        tempPassword = genTempPassword(12);
        ownerPasswordHash = await bcrypt.hash(tempPassword, 12);

        user = await User.create({
          email: emailLC,
          role: 'user',
          passwordHash: ownerPasswordHash,
          mustChangePassword: true,
          isActive: true,
        });
      } else {
        if (!user.passwordHash) {
          isNewUser = true; // treat as new for emailing
          tempPassword = genTempPassword(12);
          ownerPasswordHash = await bcrypt.hash(tempPassword, 12);
          await User.updateOne(
            { _id: user._id },
            { passwordHash: ownerPasswordHash, mustChangePassword: true, isActive: true }
          );
        } else {
          ownerPasswordHash = user.passwordHash;
        }
      }

      // Create Production ONLY here (confirmed payment)
      if (!prod) {
        try {
          prod = await Production.create({
            title,
            slug,
            ownerUserId: user._id,
            owner: user._id,
            members: [
              {
                user: user._id,
                role: 'admin',
                siteAuthorized: true,
                addedAt: new Date(),
                email: emailLC,           // <-- email on member
                passwordHash: ownerPasswordHash, // <-- passwordHash on member
              },
            ],
            stripe: {
              checkoutSessionId: session.id,
              paymentIntentId: session.payment_intent,
              amount: session.amount_total ?? null,
              currency,
            },
            isActive: true,
          });
        } catch (e) {
          if (e?.code === 11000) {
            prod = await Production.findOne({ slug }).lean();
          } else {
            throw e;
          }
        }
      } else {
        // Ensure stripe & activation updated on an existing record
        await Production.updateOne(
          { _id: prod._id },
          {
            $set: {
              'stripe.checkoutSessionId': session.id,
              'stripe.paymentIntentId': session.payment_intent,
              'stripe.amount': session.amount_total ?? prod?.stripe?.amount ?? null,
              'stripe.currency': currency,
              isActive: true,
            },
          }
        );
      }

      // Ensure membership + owner pointers + user.productionIds are consistent
      await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prod._id } });
      await Production.updateOne(
        { _id: prod._id, 'members.user': { $ne: user._id } },
        {
          $addToSet: {
            members: {
              user: user._id,
              role: 'admin',
              siteAuthorized: true,
              email: emailLC,
              passwordHash: ownerPasswordHash,
            },
          },
        }
      );
      await Production.updateOne(
        { _id: prod._id, ownerUserId: { $ne: user._id } },
        { $set: { ownerUserId: user._id, owner: user._id } }
      );

      // If a member entry already existed, sync its email/passwordHash
      await Production.updateOne(
        { _id: prod._id, 'members.user': user._id },
        { $set: { 'members.$.email': emailLC, 'members.$.passwordHash': ownerPasswordHash } }
      );

      // Email temp password only when we actually created/updated a password for this owner
      if (isNewUser && tempPassword) {
        try {
          await sendTempPasswordEmail({
            to: user.email,
            name: user.name || '',
            tempPassword,
            productionTitle: title,
            loginPath: LOGIN_PATH,
          });
        } catch (mailErr) {
          console.error('Temp password email failed:', mailErr.message);
        }
      }

      return res.json({ received: true, created: true, productionId: String(prod._id) });
    } catch (err) {
      console.error('Error handling checkout.session.completed:', err);
      return res.json({ received: true, error: 'handler_failed' });
    }
  }

  // Other events: acknowledge without side-effects
  return res.json({ received: true });
});

/* ---------------------- JSON / logging (AFTER webhook) --------------------- */
app.use(express.json());             // <-- JSON parser for body routes
app.use(morgan('dev'));

/* -------------------------------- Mongo -------------------------------- */
await mongoose.connect(process.env.MONGODB_URI);

/* -------------------------------- Public routes --------------------------- */
app.use('/auth', authRouter);
app.use('/tenant/auth', authRouter);
app.use('/tenant/ocr', ocrRouter);
app.use('/tenant/runsheetsbyhand', runsheetHandRouter);
app.use('/owner/productions', ownerRoutes);
app.use('/tenant/tenantauth', tenantAuthRouter);

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

/* ---------------------- Create Checkout Session ---------------------- */
/**
 * Improvements:
 *  - uses express.json() (already registered above)
 *  - auto-finds an available slug (no 409 blocker)
 *  - includes title + desiredSlug in metadata
 */
app.post('/checkout/session', async (req, res) => {
  try {
    const { title, production } = req.body || {};
    const cleanTitle = String(title || production?.title || '').trim();
    if (!cleanTitle) return res.status(400).json({ error: 'Title required' });

    const baseSlug = normalizeSlug(production?.slug || cleanTitle);
    if (!baseSlug) return res.status(400).json({ error: 'Slug required' });

    const uniqueSlug = await findAvailableSlug(baseSlug);

    const price = parseInt(process.env.PRICE_CENTS || '9900', 10);
    const currency = (process.env.CURRENCY || 'usd').toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // payment_method_types: ['card'], // optional with modern Stripe; automatic selection works too
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
      metadata: { title: cleanTitle, desiredSlug: uniqueSlug },
    });

    // Return URL + the slug we reserved in metadata
    return res.json({ url: session.url, slug: uniqueSlug });
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
 * Thank-You resolver with PAID fallback.
 * - If webhook already created the production → return it.
 * - If not, but Stripe says the session is PAID → create it here (idempotent),
 *   ensure owner user + member with { email, passwordHash }, issue short-lived token.
 */
app.get('/checkout/sessions/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    const meta = session.metadata || {};
    const title = (meta.title || 'Production').trim();
    const slug  = normalizeSlug(meta.desiredSlug || title);
    const currency = (session.currency ?? process.env.CURRENCY) || 'usd';
    const isPaid = String(session.payment_status || '').toLowerCase() === 'paid';

    let prod = await Production.findOne({
      $or: [
        { 'stripe.checkoutSessionId': session.id },
        { 'stripe.paymentIntentId': session.payment_intent },
        { slug },
      ],
    }).lean();

    if (!prod && !isPaid) {
      return res.status(202).json({
        status: session.status,
        payment_status: session.payment_status,
        pending: true,
        message: 'Awaiting payment confirmation.',
      });
    }

    let email =
      session?.customer_details?.email ||
      session?.customer_email ||
      null;

    if (!email && session.customer) {
      try {
        const cust = await stripe.customers.retrieve(session.customer);
        email = cust?.email || null;
      } catch { /* ignore */ }
    }

    if (!prod && !email) {
      return res.status(202).json({
        status: session.status,
        payment_status: session.payment_status,
        pending: true,
        message: 'Payment confirmed but purchaser email missing; cannot finish provisioning yet.',
      });
    }

    const emailLC = email ? String(email).toLowerCase() : null;

    let user = null;
    let token = null;
    let me = null;

    if (!prod && isPaid) {
      // Ensure/prepare owner User
      user = await User.findOne({ email: emailLC });
      let isNewUser = false;
      let tempPassword = null;
      let ownerPasswordHash = null;

      if (!user) {
        isNewUser = true;
        tempPassword = crypto.randomBytes(9).toString('base64url');
        ownerPasswordHash = await bcrypt.hash(tempPassword, 12);

        user = await User.create({
          email: emailLC,
          role: 'user',
          passwordHash: ownerPasswordHash,
          mustChangePassword: true,
          isActive: true,
        });
      } else {
        if (!user.passwordHash) {
          isNewUser = true;
          tempPassword = crypto.randomBytes(9).toString('base64url');
          ownerPasswordHash = await bcrypt.hash(tempPassword, 12);
          await User.updateOne(
            { _id: user._id },
            { passwordHash: ownerPasswordHash, mustChangePassword: true, isActive: true }
          );
        } else {
          ownerPasswordHash = user.passwordHash;
        }
      }

      // Create production now (idempotent via duplicate slug handling)
      try {
        const created = await Production.create({
          title,
          slug,
          ownerUserId: user._id,
          owner: user._id,
          members: [
            {
              user: user._id,
              role: 'admin',
              siteAuthorized: true,
              addedAt: new Date(),
              email: emailLC,
              passwordHash: ownerPasswordHash,
            },
          ],
          stripe: {
            checkoutSessionId: session.id,
            paymentIntentId: session.payment_intent,
            amount: session.amount_total ?? null,
            currency,
          },
          isActive: true,
        });
        prod = created.toObject();
      } catch (e) {
        if (e?.code === 11000) {
          prod = await Production.findOne({ slug }).lean();
        } else {
          throw e;
        }
      }

      // Consistency updates (no-ops if already set)
      await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prod._id } });
      await Production.updateOne(
        { _id: prod._id, 'members.user': { $ne: user._id } },
        {
          $addToSet: {
            members: {
              user: user._id,
              role: 'admin',
              siteAuthorized: true,
              email: emailLC,
              passwordHash: user.passwordHash,
            },
          },
        }
      );
      await Production.updateOne(
        { _id: prod._id, 'members.user': user._id },
        { $set: { 'members.$.email': emailLC, 'members.$.passwordHash': user.passwordHash } }
      );

      if (isNewUser && user.passwordHash && tempPassword) {
        try {
          await sendTempPasswordEmail({
            to: user.email,
            name: user.name || '',
            tempPassword,
            productionTitle: title,
            loginPath: LOGIN_PATH,
          });
        } catch (mailErr) {
          console.error('Temp password email (fallback) failed:', mailErr.message);
        }
      }
    }

    if (!prod) {
      return res.status(202).json({
        status: session.status,
        payment_status: session.payment_status,
        pending: true,
        message: 'Provisioning delay detected; please retry in a moment.',
      });
    }

    if (!user && emailLC) {
      user = await User.findOne({ email: emailLC }).lean();
    }

    if (user) {
      await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prod._id } });
      await Production.updateOne(
        { _id: prod._id, 'members.user': { $ne: user._id } },
        { $addToSet: { members: { user: user._id, role: 'admin', siteAuthorized: true, email: emailLC } } }
      );
      await Production.updateOne(
        { _id: prod._id, 'members.user': user._id },
        { $set: { 'members.$.email': emailLC } }
      );

      token = issueJwt(user, { expiresIn: '12h' });
      me = await User.findById(user._id)
        .select('_id email firstName lastName role siteAuthorized isAdmin productionIds')
        .lean();
    }

    return res.json({
      status: session.status,
      payment_status: session.payment_status,
      pending: false,
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

// Public helper
app.get('/tenant/productions/by_slug/:slug', async (req, res) => {
  const prod = await Production.findOne({ slug: req.params.slug }).select('_id name slug').lean();
  if (!prod) return res.status(404).json({ error: 'Production not found' });
  res.json(prod);
});

/* ----------------------------- Tenant routes ------------------------------ */

app.use('/tenant/productions',tenantGate({ authorized: true, admin: false }), productionRoutes);
app.use('/tenant/users',tenantGate({ authorized: true, admin: true }), userRoutes);
app.use('/tenant/runsheets',tenantGate({ authorized: true, admin: false }),runsheetRoutes);
app.use('/tenant/items',tenantGate({ authorized: true, admin: false }), itemRoutes);
app.use('/tenant/places',tenantGate({ authorized: true, admin: false }),placeRoutes);
app.use('/tenant/suppliers',tenantGate({ authorized: true, admin: false }),supplierRoutes);
app.use('/tenant/people',tenantGate({ authorized: true, admin: false }), peopleRoutes);
app.use('/tenant/admin',tenantGate({ authorized: true, admin: true }), adminUsersRouter);
app.use('/tenant/sets', tenantGate({ authorized: true, admin: false }), setRoutes);

// Misc tenant endpoints
app.use('/tenant',tenantGate({ authorized: true, admin: true }), tenantRouter);

/* --------------------------------- Boot --------------------------------- */
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));


