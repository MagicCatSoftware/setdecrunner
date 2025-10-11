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

import { sendMail, sendTempPasswordEmail } from './utils/mailer.js';

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

import { issueJwt } from './middleware/auth.js';
import { tenantGate } from './middleware/tenantAuth.js';
import ocrRouter from './routes/ocr.js';
import ownerRoutes from './routes/owner.js';
import tenantAuthRouter from './routes/tenantAuth.js';
import passwordResetRoutes from './routes/passwordReset.js';
import {bearerAuth} from './middleware/bearerAuth.js';
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
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin not allowed: ${origin}`));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Production-Id',
      'X-Production-Slug',
      'X-API-Retried',
      'X-Skip-Pid',
    ],
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

/* --------------------------- App constants --------------------------- */
const MAIL_FROM = process.env.MAIL_FROM || 'setdecrunner@gmail.com';
const APP_BASE_URL = process.env.APP_BASE_URL || FRONTEND_URL;
const LOGIN_PATH = process.env.LOGIN_PATH || '/login';

/* ------------------- Helpers for temp password email ------------------ */
function genTempPassword(length = 12) {
  return crypto.randomBytes(Math.ceil((length * 3) / 4)).toString('base64url').slice(0, length);
}

/**
 * ALWAYS issue a per-production temp password for the owner.
 * - Generates a fresh temp password EVERY TIME (per production activation),
 *   hashes it, and stores it on the production member's `passwordHash`.
 * - Does NOT rotate the global User.passwordHash (unless the user has none).
 * - Ensures owner/admin member exists and is wired to the user & email.
 * Returns: { user, emailLC, tempPassword, ownerPasswordHash }
 */
async function ensureOwnerFromProduction(prod, fallbackEmailLC) {
  if (!prod) throw new Error('ensureOwnerFromProduction: production doc required');

  const toId = v => (v && typeof v === 'object' && v.toString) ? v.toString() : String(v || '');
  const eqId = (a, b) => toId(a) === toId(b);
  const norm = s => String(s || '').trim().toLowerCase();

  const prodId = toId(prod._id);
  const ownerId = toId(prod.ownerUserId || prod.owner || '');

  // 1) Resolve target email we’ll use for the owner member.
  // Prefer an existing owner/admin member email; else fallback.
  let candidate =
    (prod.members || []).find(m => ownerId && eqId(m?.user, ownerId)) ||
    (prod.members || []).find(m => norm(m?.role) === 'admin') ||
    null;

  const emailLC = norm(candidate?.email) || norm(fallbackEmailLC);
  if (!emailLC) {
    return { user: null, emailLC: null, tempPassword: null, ownerPasswordHash: null };
  }

  // 2) Ensure backing User exists and is linked to the production
  let user = await User.findOne({ email: emailLC });
  if (!user) {
    user = await User.create({
      email: emailLC,
      role: 'user',
      isActive: true,
      productionIds: [prodId],
    });
  } else {
    await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prodId } });
  }

  // If the global user has NO password, set one so they can still use non-tenant routes.
  let setGlobalNow = false;
  if (!user.passwordHash) setGlobalNow = true;

  // 3) Find the *exact* member we will update for this user:
  //    priority: (user match) > (email match) > (existing candidate) > (create)
  let member =
    (prod.members || []).find(m => eqId(m?.user, user._id)) ||
    (prod.members || []).find(m => norm(m?.email) === emailLC) ||
    candidate ||
    null;

  // 4) Generate per-production temp password + hash
  const tempPassword = genTempPassword(12);
  const ownerPasswordHash = await bcrypt.hash(tempPassword, 12);

  // Optionally stamp the global user hash if they had none
  if (setGlobalNow) {
    await User.updateOne(
      { _id: user._id },
      { passwordHash: ownerPasswordHash, mustChangePassword: true, isActive: true }
    );
  }

  // 5) Create or update the *exact* member row so user + hash stay in sync
  if (!member) {
    // Insert a new admin member for this user/email
    await Production.updateOne(
      { _id: prodId, 'members.email': { $ne: emailLC } },
      {
        $push: {
          members: {
            user: user._id,
            role: 'admin',
            siteAuthorized: true,
            email: emailLC,
            passwordHash: ownerPasswordHash,
            addedAt: new Date(),
          },
        },
      }
    );
  } else if (member._id) {
    // Update the existing member by its _id (most precise)
    await Production.updateOne(
      { _id: prodId, 'members._id': member._id },
      {
        $set: {
          'members.$.user': user._id,
          'members.$.email': emailLC,
          'members.$.passwordHash': ownerPasswordHash,
          'members.$.role': member.role || 'admin',
          'members.$.siteAuthorized': member.siteAuthorized ?? true,
        },
      }
    );
  } else {
    // Fallback: use arrayFilters to target by user or by email deterministically
    const filters = [];
    const setOps = { 'members.$[t].passwordHash': ownerPasswordHash, 'members.$[t].user': user._id, 'members.$[t].email': emailLC };
    if (member.user) {
      filters.push({ 't.user': user._id });
    } else {
      filters.push({ 't.email': emailLC });
    }
    await Production.updateOne(
      { _id: prodId },
      { $set: setOps },
      { arrayFilters: filters }
    );
  }

  // 6) Ensure top-level owner pointers match this user
  if (!ownerId || !eqId(ownerId, user._id)) {
    await Production.updateOne(
      { _id: prodId },
      { $set: { ownerUserId: user._id, owner: user._id } }
    );
  }

  return { user, emailLC, tempPassword, ownerPasswordHash };
}

/**
 * Fallback: ensure/prepare owner by email only (no production context).
 * Used only when we create a production in the legacy path.
 * Still issues a NEW per-production temp password after the production is created.
 */
async function ensureOwnerByEmail(emailLC) {
  if (!emailLC) return { user: null, tempPassword: null, ownerPasswordHash: null };

  let user = await User.findOne({ email: emailLC });
  if (!user) {
    user = await User.create({
      email: emailLC,
      role: 'user',
      isActive: true,
    });
  }

  // Note: per-production temp password will be generated AFTER the production is created,
  // using ensureOwnerFromProduction for that new production.
  return { user, tempPassword: null, ownerPasswordHash: user.passwordHash || null };
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
      const currency = (session.currency ?? process.env.CURRENCY) || 'usd';

      const productionId = meta.productionId || session.client_reference_id || null;

      // Purchaser email
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
      const emailLC = email ? String(email).toLowerCase() : null;

      if (productionId) {
        const prod = await Production.findById(productionId).lean();
        if (prod) {
          // Derive owner + ALWAYS issue per-production temp password
          const ensured = await ensureOwnerFromProduction(prod, emailLC);
          const user = ensured.user;
          const tempPassword = ensured.tempPassword;
          const ownerPasswordHash = ensured.ownerPasswordHash;

          // Activate & stamp stripe
          await Production.updateOne(
            { _id: prod._id },
            {
              $set: {
                isActive: true,
                'stripe.status': 'active',
                'stripe.checkoutSessionId': session.id,
                'stripe.paymentIntentId': session.payment_intent,
                'stripe.amount': session.amount_total ?? prod?.stripe?.amount ?? null,
                'stripe.currency': currency,
              },
            }
          );

          if (user) {
            const emailLC2 = user.email.toLowerCase();
            await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prod._id } });
            await Production.updateOne(
              { _id: prod._id, 'members.user': { $ne: user._id } },
              {
                $addToSet: {
                  members: {
                    user: user._id,
                    role: 'admin',
                    siteAuthorized: true,
                    email: emailLC2,
                    passwordHash: ownerPasswordHash,
                    addedAt: new Date(),
                  },
                },
              }
            );
          }

          // Email the per-production temp password
          if (user && tempPassword) {
            try {
              await sendTempPasswordEmail({
                to: user.email,
                name: user.name || '',
                tempPassword,
                productionTitle: prod.title,
                loginPath: LOGIN_PATH,
              });
            } catch (mailErr) {
              console.error('Temp password email failed:', mailErr.message);
            }
          }

          return res.json({ received: true, activated: true, productionId: String(prod._id) });
        }
      }

      // Legacy fallback: provision now (no temp prod found)
      const title = (meta.title || 'Production').trim();
      const slug = normalizeSlug(meta.desiredSlug || title) || normalizeSlug(title) || `prod-${Date.now()}`;

      // Ensure owner user record exists (no temp here yet)
      const ensuredUser = await ensureOwnerByEmail(emailLC);
      const user = ensuredUser.user;

      // Create or update production
      let prod = await Production.findOne({
        $or: [
          { 'stripe.checkoutSessionId': session.id },
          { 'stripe.paymentIntentId': session.payment_intent },
          { slug },
        ],
      }).lean();

      if (!prod) {
        const created = await Production.create({
          title,
          slug,
          ownerUserId: user?._id || null,
          owner: user?._id || null,
          members: user
            ? [{
                user: user._id,
                role: 'admin',
                siteAuthorized: true,
                addedAt: new Date(),
                email: (user.email || '').toLowerCase(),
                // member.passwordHash will be set right after via ensureOwnerFromProduction
              }]
            : [],
          stripe: {
            checkoutSessionId: session.id,
            paymentIntentId: session.payment_intent,
            amount: session.amount_total ?? null,
            currency,
            status: 'active',
          },
          isActive: true,
        });
        prod = created.toObject();
      } else {
        await Production.updateOne(
          { _id: prod._id },
          {
            $set: {
              'stripe.checkoutSessionId': session.id,
              'stripe.paymentIntentId': session.payment_intent,
              'stripe.amount': session.amount_total ?? prod?.stripe?.amount ?? null,
              'stripe.currency': currency,
              'stripe.status': 'active',
              isActive: true,
              ...(user ? { ownerUserId: user._id, owner: user._id } : {}),
            },
          }
        );
        prod = await Production.findById(prod._id).lean();
      }

      if (user) {
        await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prod._id } });
      }

      // NOW: issue per-production temp password for the new prod and email it
      const ensuredTenant = await ensureOwnerFromProduction(prod, emailLC);
      const tempPassword = ensuredTenant.tempPassword;

      if (user && tempPassword) {
        try {
          await sendTempPasswordEmail({
            to: user.email,
            name: user.name || '',
            tempPassword,
            productionTitle: prod.title || title || 'your production',
          });
        } catch (mailErr) {
          console.error('Temp password email (fallback) failed:', mailErr.message);
        }
      }

      return res.json({ received: true, created: true, productionId: String(prod._id) });
    } catch (err) {
      console.error('Error handling checkout.session.completed:', err);
      return res.json({ received: true, error: 'handler_failed' });
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
app.use('/tenant/ocr', bearerAuth, tenantGate({ authorized: true, admin: false }), ocrRouter);
app.use('/tenant/runsheetsbyhand',bearerAuth, tenantGate({ authorized: true, admin: false }), runsheetHandRouter);
app.use('/owner/productions', ownerRoutes);
app.use('/tenant/tenantauth', tenantAuthRouter);
app.use('/pwr', passwordResetRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Debug SMTP using the SAME transport as the app (utils/mailer.js)
app.get('/debug/smtp', async (_req, res) => {
  try {
    const to = process.env.SMTP_TEST_TO || process.env.SMTP_USER || process.env.MAIL_FROM;
    const info = await sendMail({
      to,
      subject: 'SMTP test from server/index.js',
      text: 'If you see this, SMTP works via utils/mailer.js transport.'
    });
    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error('[SMTP DEBUG] send failed:', {
      code: err.code,
      command: err.command,
      response: err.response,
      message: err.message,
    });
    res.status(500).json({
      ok: false,
      code: err.code,
      command: err.command,
      response: err.response,
      message: err.message
    });
  }
});

// Public: resolve by slug
app.get('/productions/by-slug/:slug', async (req, res) => {
  const slug = normalizeSlug(req.params.slug || '');
  const prod = await Production.findOne({ slug, isActive: true }).select('_id title slug').lean();
  if (!prod) return res.status(404).json({ error: 'Production not found' });
  res.json(prod);
});

// Public: resolve production by slug with contact fields
app.get('/tenant/getproductions/by_slug/:slug',bearerAuth,tenantGate({ authorized: true, admin: false }), async (req, res) => {
  const slug = normalizeSlug(req.params.slug || '');
  const prod = await Production.findOne({ slug }).select(
    '_id slug title name company address phone productioncompany productionaddress productionphone'
  ).lean();

  if (!prod) return res.status(404).json({ error: 'Production not found' });

  // Normalize to stable keys the client can rely on
  const name    = prod.name    || prod.title || '';
  const company = prod.company || prod.productioncompany || '';
  const phone   = prod.phone   || prod.productionphone   || '';
  const address = prod.address || prod.productionaddress || '';

  res.json({
    _id: prod._id,
    slug: prod.slug,
    name,
    company,
    phone,
    address
  });
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
app.post('/checkout/session', async (req, res) => {
  try {
    const { contact, production } = req.body || {};
    const cleanTitle = String(production?.title || '').trim();
    if (!cleanTitle) return res.status(400).json({ error: 'production.title required' });

    const baseSlug = normalizeSlug(production?.slug || cleanTitle);
    if (!baseSlug) return res.status(400).json({ error: 'production.slug required' });

    const uniqueSlug = await findAvailableSlug(baseSlug);

    let ownerUserId = null;
    const contactEmail = String(contact?.email || '').trim().toLowerCase();
    if (contactEmail) {
      const existing = await User.findOne({ email: contactEmail }).select('_id').lean();
      ownerUserId = existing?._id || null;
    }

    const tempProd = await Production.create({
      title: cleanTitle,
      slug: uniqueSlug,
      ownerUserId,
      members: [],
      stripe: { status: 'pending' },
      isActive: false,
      // canonical new fields
      productionphone:   production?.phone || '',
      productionaddress: production?.address || '',
      productioncompany: production?.company || '',
      // legacy aliases
      name:    cleanTitle,
      phone:   production?.phone || '',
      address: production?.address || '',
      company: production?.company || '',
    });

    const priceCents = parseInt(process.env.PRICE_CENTS || '9900', 10);
    const currency = (process.env.CURRENCY || 'usd').toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${ORIGIN}/thank-you?slug=${encodeURIComponent(uniqueSlug)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${ORIGIN}/pricing?canceled=1`,
      customer_email: contactEmail || undefined,
      client_reference_id: String(tempProd._id),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            product_data: { name: `Set-Dec Production: ${cleanTitle}` },
            unit_amount: priceCents,
          },
        },
      ],
      metadata: {
        productionId: String(tempProd._id),
        title: cleanTitle,
        desiredSlug: uniqueSlug,
      },
    });

    await Production.updateOne(
      { _id: tempProd._id },
      { $set: { 'stripe.checkoutSessionId': session.id } }
    );

    return res.json({ url: session.url, slug: uniqueSlug, productionId: String(tempProd._id) });
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
 * If webhook missed, we finish provisioning here and ALWAYS send a per-production temp password.
 */
app.get('/checkout/sessions/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    const meta = session.metadata || {};
    const slug  = normalizeSlug(meta.desiredSlug || meta.title || '') || null;
    const currency = (session.currency ?? process.env.CURRENCY) || 'usd';
    const isPaid = String(session.payment_status || '').toLowerCase() === 'paid';
    const prodId = meta.productionId || session.client_reference_id || null;

    let prod = null;
    if (prodId) prod = await Production.findById(prodId).lean();
    if (!prod && slug) prod = await Production.findOne({ slug }).lean();

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
    const emailLC = email ? String(email).toLowerCase() : null;

    if ((!prod || prod?.isActive !== true) && !isPaid) {
      return res.status(202).json({
        status: session.status,
        payment_status: session.payment_status,
        pending: true,
        message: 'Awaiting payment confirmation.',
      });
    }

    let user = null;
    let tempPassword = null;
    let ownerPasswordHash = null;

    if (isPaid && prod && prod.isActive !== true) {
      // Issue per-production temp password + wire owner/admin member
      const ensured = await ensureOwnerFromProduction(prod, emailLC);
      user = ensured.user;
      tempPassword = ensured.tempPassword;
      ownerPasswordHash = ensured.ownerPasswordHash;

      await Production.updateOne(
        { _id: prod._id },
        {
          $set: {
            isActive: true,
            ...(user ? { ownerUserId: user._id, owner: user._id } : {}),
            'stripe.status': 'active',
            'stripe.checkoutSessionId': session.id,
            'stripe.paymentIntentId': session.payment_intent,
            'stripe.amount': session.amount_total ?? prod?.stripe?.amount ?? null,
            'stripe.currency': currency,
          },
        }
      );

      if (user) {
        await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prod._id } });
        await Production.updateOne(
          { _id: prod._id, 'members.user': { $ne: user._id } },
          {
            $addToSet: {
              members: {
                user: user._id,
                role: 'admin',
                siteAuthorized: true,
                email: (user.email || '').toLowerCase(),
                passwordHash: ownerPasswordHash,
                addedAt: new Date(),
              },
            },
          }
        );
      }

      prod = await Production.findById(prod._id).lean();
    }

    // Always email the per-production temp password we generated
    if (user && tempPassword) {
      try {
        await sendTempPasswordEmail({
          to: user.email,
          name: user.name || '',
          tempPassword,
          productionTitle: prod?.title || 'your production',
          loginPath: LOGIN_PATH,
        });
      } catch (mailErr) {
        console.error('Temp password email (fallback) failed:', mailErr.message);
      }
    }

    if (!prod) return res.status(404).json({ error: 'Production not found' });

    const token = user ? issueJwt(user, { expiresIn: '12h' }) : null;
    const me = user
      ? await User.findById(user._id)
          .select('_id email firstName lastName role siteAuthorized isAdmin productionIds')
          .lean()
      : null;

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
app.use('/tenant/productions',bearerAuth, tenantGate({ authorized: true, admin: false }), productionRoutes);
app.use('/tenant/users',bearerAuth, tenantGate({ authorized: true, admin: true }), userRoutes);
app.use('/tenant/runsheets',bearerAuth, tenantGate({ authorized: true, admin: false }), runsheetRoutes);
app.use('/tenant/items',bearerAuth, tenantGate({ authorized: true, admin: false }), itemRoutes);
app.use('/tenant/places',bearerAuth, tenantGate({ authorized: true, admin: false }), placeRoutes);
app.use('/tenant/suppliers',bearerAuth, tenantGate({ authorized: true, admin: false }), supplierRoutes);
app.use('/tenant/people',bearerAuth, tenantGate({ authorized: true, admin: false }), peopleRoutes);
app.use('/tenant/admin',bearerAuth, tenantGate({ authorized: true, admin: true }), adminUsersRouter);
app.use('/tenant/sets',bearerAuth, tenantGate({ authorized: true, admin: false }), setRoutes);

// Misc tenant endpoints
app.use('/tenant', tenantGate({ authorized: true, admin: true }), tenantRouter);

/* --------------------------------- Boot --------------------------------- */
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));





