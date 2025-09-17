// server/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import cookieParser from 'cookie-parser';
import path from 'path';
import crypto from 'crypto';

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
import productionRoutes from './routes/productions.js'

import { authRequired, issueJwt } from './middleware/auth.js';
import { requireMembership } from './middleware/requireMembership.js';
import { sendMail } from './utils/mailer.js';

const app = express();

/* ------------------------------ Stripe ------------------------------ */
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY in environment (.env).');
const stripe = new Stripe(STRIPE_SECRET_KEY); // optional: { apiVersion: '2024-06-20' }

/* ------------------------------- CORS -------------------------------- */
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowlist = ['https://set-dec.com', 'https://www.set-dec.com'];
app.use(
  cors({
    origin: (origin, cb) => (!origin || allowlist.includes(origin) ? cb(null, true) : cb(new Error('CORS'))),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    // allow both header casings, some clients vary
    allowedHeaders: ['Content-Type', 'Authorization', 'x-production-id', 'X-Production-Id'],
    credentials: false,
  })
);

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.resolve(process.cwd(), '/uploads');
// serve public URLs like /uploads/abc/xyz.jpg
app.use('/uploads', express.static(UPLOAD_ROOT, {
  fallthrough: true,
  index: false,
  dotfiles: 'ignore',
  setHeaders(res) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

app.set('trust proxy', process.env.TRUST_PROXY ? 1 : 0);

app.use(cookieParser());
app.use(passport.initialize());

/* --------------------------- Static uploads --------------------------- */


const FRONTEND_URL = process.env.FRONTEND_URL || ORIGIN;

/* ----------------- Helpers: temp user + invite email ----------------- */
async function ensureTempAccountAndInvite(emailLC, { firstName = '', lastName = '' } = {}) {
  let user = await User.findOne({ email: emailLC });

  if (!user) {
    user = new User({
      provider: 'local',
      email: emailLC,
      firstName,
      lastName,
      siteAuthorized: true,
      role: 'user',
      mustChangePassword: true,
    });
  } else {
    user.siteAuthorized = user.siteAuthorized ?? true;
    user.mustChangePassword = true;
  }

  // Invite / reset token (24h)
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  user.passwordResetToken = hash;
  user.passwordResetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  // Fire-and-forget email
  const link = `${FRONTEND_URL}/set-password?token=${encodeURIComponent(raw)}&email=${encodeURIComponent(user.email)}`;
  try {
    await sendMail({
      to: user.email,
      subject: 'You have been invited to Set-Dec Runner',
      text: `Hi ${firstName || ''},

Click the link to set your password:
${link}

This link expires in 24 hours.`,
      html: `<p>Hi ${firstName || ''},</p>
<p>Click the link below to set your password:</p>
<p><a href="${link}">${link}</a></p>
<p><small>This link expires in 24 hours.</small></p>`,
    });
  } catch (e) {
    console.warn('[mailer] invite send failed:', e?.message || e);
  }

  return { user, created: true };
}

async function attachMembership(prod, user) {
  // Keep legacy user.productionIds in sync (optional)
  await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prod._id } });

  // First member gets admin + becomes owner; others default to editor
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

/* ------------- Stripe webhook (raw body, BEFORE express.json) ------------- */
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
    const session = evt.data.object;
    const meta = session.metadata || {};
    const title = meta.title || 'Production';
    const slug = normalizeSlug(meta.desiredSlug || title);
    const currency = (session.currency ?? process.env.CURRENCY) || 'usd';

    // Ensure production exists
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

    if (email) {
      const emailLC = String(email).toLowerCase();
      const { user } = await ensureTempAccountAndInvite(emailLC, {
        firstName: session?.customer_details?.name?.split(' ')?.[0] || '',
      });
      await attachMembership(prod, user);
    } else {
      console.warn('Checkout completed but no customer email found; cannot attach user membership.');
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
// Public auth (login/register/me)
app.use('/auth', authRouter);

// Also expose auth under tenant prefix if your client expects it
app.use('/tenant/auth', authRouter);

// Health
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
  console.log(req.body);
  try {
    const { title,production} = req.body || {};
    const cleanTitle = String(title || '').trim();
    const slug = normalizeSlug(production.slug || cleanTitle);

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
      .json({ error: detail?.message || 'Failed to create checkout session', code: detail?.code || undefined });
  }
});

/**
 * Fallback “Thank You” resolver.
 * Client calls this with ?session_id=... (from Stripe) after redirect.
 * We attach membership (if webhook didn’t run yet), then
 * return a JWT + production info so the UI can log the user into the correct production.
 */
app.get('/checkout/sessions/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    const meta = session.metadata || {};
    const title = meta.title || 'Production';
    const slug  = normalizeSlug(meta.desiredSlug || title);

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
    const email =
      session?.customer_details?.email ||
      session?.customer_email ||
      null;

    let user = null;
    if (email) {
      const emailLC = String(email).toLowerCase();

      // Create/find user (temp account if new)
      user = await User.findOneAndUpdate(
        { email: emailLC },
        { $setOnInsert: { email: emailLC } },
        { upsert: true, new: true }
      );

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

    // Issue a short-lived token so client can auto-login and jump into the tenant
    let token = null;
    let me = null;
    if (user) {
      token = issueJwt(user, { expiresIn: '12h' });
      me = await User.findById(user._id)
        .select('_id email name role siteAuthorized isAdmin productionIds')
        .lean();
    }

    res.json({
      status:         session.status,
      payment_status: session.payment_status,
      slug:           prod.slug,
      title:          prod.title,
      productionId:   String(prod._id),
      token,
      user:           me,
    });
  } catch (e) {
    console.error('checkout session lookup failed:', e.message);
    res.status(404).json({ error: 'Session not found' });
  }
});


/* ----------------------------- Tenant routes ------------------------------ */
// Apply auth + membership to each tenant resource router explicitly
const tenantMw = [authRequired, requireMembership];
app.use('/tenant/productions', tenantMw, productionRoutes)
app.use('/tenant/users',      tenantMw, userRoutes);
app.use('/tenant/runsheets',  tenantMw, runsheetRoutes);
app.use('/tenant/items',      tenantMw, itemRoutes);
app.use('/tenant/places',     tenantMw, placeRoutes);
app.use('/tenant/suppliers',  tenantMw, supplierRoutes);
app.use('/tenant/people',     tenantMw, peopleRoutes);
app.use('/tenant/admin',      tenantMw, adminUsersRouter);
app.use('/tenant/sets',       tenantMw, setRoutes);

// If you still have miscellaneous tenant endpoints collected in tenantRouter
app.use('/tenant', tenantMw, tenantRouter);

/* --------------------------------- Boot --------------------------------- */
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

