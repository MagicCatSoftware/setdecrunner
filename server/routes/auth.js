import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import User from '../models/User.js';
import Production, { normalizeSlug } from '../models/Production.js';
import { issueJwt, authRequired } from '../middleware/auth.js';
import {
  passport,
  encodeState,
  decodeState,
  GOOGLE_ENABLED,
  FACEBOOK_ENABLED,
} from '../passport.js';
import { signToken } from '../utils/jwt.js';

const router = Router();
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

/* ----------------------------- helpers ----------------------------- */
function sendError(res, code, msg) {
  return res.status(code).json({ error: msg });
}

// Normalize many ID shapes into a comparable string
function toId(v) {
  if (!v) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  const maybe =
    v._id ?? v.user ?? v.id ?? v.uid ?? v.userId ??
    (typeof v.valueOf === 'function' ? v.valueOf() : null);
  if (maybe) return String(maybe).trim();
  try {
    const s = v.toString?.();
    if (s && /^[a-f0-9]{24}$/i.test(s)) return s;
  } catch {}
  return '';
}
function idsEqual(a, b) {
  const A = toId(a);
  const B = toId(b);
  return !!A && !!B && A === B;
}

/* --------------------------- providers probe --------------------------- */
router.get('/providers', (_req, res) => {
  res.json({ google: GOOGLE_ENABLED, facebook: FACEBOOK_ENABLED });
});

/* -------------------------------- local -------------------------------- */
// Register (local) — does NOT auto-join a production here
router.post('/local/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) return sendError(res, 400, 'Email and password required');

    const emailLC = String(email).toLowerCase().trim();
    const exists = await User.findOne({ email: emailLC });
    if (exists) return sendError(res, 409, 'Email already in use');

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({ email: emailLC, name, passwordHash, productionIds: [] });

    const token = issueJwt(user);
    return res.json({
      token,
      user: { id: user._id, email: user.email, productionIds: user.productionIds, role: user.role },
    });
  } catch (e) {
    return sendError(res, 500, e.message || 'Registration failed');
  }
});

// Login (local) — user must already be a member of the slug’s production
router.post('/local/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return sendError(res, 400, 'Email, password, and slug required');
    }

    const emailLC = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: emailLC });
    if (!user || !user.passwordHash) return sendError(res, 401, 'Invalid credentials');

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return sendError(res, 401, 'Invalid credentials');

    const token = issueJwt(user);
    return res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        productionIds: user.productionIds,
        role: user.role,
      },
    });
  } catch (e) {
    return sendError(res, 500, e.message || 'Login failed');
  }
});

/* ------------------------------ Google OAuth ------------------------------ */
router.get('/google', (req, res, next) => {
  if (!GOOGLE_ENABLED) return sendError(res, 501, 'Google OAuth not configured');

  const slug = normalizeSlug(String(req.query.slug || ''));
  const r = String(req.query.r || '');
  const state = encodeState({ slug, r });

  passport.authenticate('google', {
    scope: ['email', 'profile'],
    state,
  })(req, res, next);
});

router.get(
  '/google/callback',
  (req, res, next) => {
    if (!GOOGLE_ENABLED) return res.redirect(`${ORIGIN}/?err=google-disabled`);
    next();
  },
  passport.authenticate('google', { session: false, failureRedirect: `${ORIGIN}/?err=google-failed` }),
  async (req, res) => {
    try {
      const { slug, r } = decodeState(String(req.query.state || '')) || {};
      const token = issueJwt(req.user);
      const dest = `${ORIGIN}/${encodeURIComponent(slug || '')}/login?token=${encodeURIComponent(token)}${
        r ? `&r=${encodeURIComponent(r)}` : ''
      }`;
      return res.redirect(dest);
    } catch {
      return res.redirect(`${ORIGIN}/?err=oauth-failed`);
    }
  }
);

/* ----------------------------- Facebook OAuth ----------------------------- */
router.get('/facebook', (req, res, next) => {
  if (!FACEBOOK_ENABLED) return sendError(res, 501, 'Facebook OAuth not configured');

  const slug = normalizeSlug(String(req.query.slug || ''));
  const r = String(req.query.r || '');
  const state = encodeState({ slug, r });

  passport.authenticate('facebook', {
    scope: ['email'],
    state,
  })(req, res, next);
});

router.get(
  '/facebook/callback',
  (req, res, next) => {
    if (!FACEBOOK_ENABLED) return res.redirect(`${ORIGIN}/?err=facebook-disabled`);
    next();
  },
  passport.authenticate('facebook', { session: false, failureRedirect: `${ORIGIN}/?err=facebook-failed` }),
  async (req, res) => {
    try {
      const { slug, r } = decodeState(String(req.query.state || '')) || {};
      const token = issueJwt(req.user);
      const dest = `${ORIGIN}/${encodeURIComponent(slug || '')}/login?token=${encodeURIComponent(token)}${
        r ? `&r=${encodeURIComponent(r)}` : ''
      }`;
      return res.redirect(dest);
    } catch {
      return res.redirect(`${ORIGIN}/?err=oauth-failed`);
    }
  }
);

/* ------------------------------ LOGOUT ------------------------------ */
/**
 * Stateless JWT logout.
 * - If you use sessions, req.logout?.() is safe (no-op when session: false).
 * - If you add a token denylist later, you can mark the incoming token here.
 */
router.post('/logout', authRequired, async (req, res) => {
  try {
    // For Passport sessions (not used here): try to end session gracefully.
    try { req.logout?.(); } catch {}

    // Optionally hint the client to clear storage/cookies (cookies not used here).
    res.setHeader('Clear-Site-Data', '"storage"');

    return res.status(200).json({ ok: true });
  } catch (e) {
    return sendError(res, 500, e.message || 'Logout failed');
  }
});

// (Optional convenience: allow GET /auth/logout too)
router.get('/logout', authRequired, async (req, res) => {
  try {
    try { req.logout?.(); } catch {}
    res.setHeader('Clear-Site-Data', '"storage"');
    return res.status(200).json({ ok: true });
  } catch (e) {
    return sendError(res, 500, e.message || 'Logout failed');
  }
});

/* ------------------------------ /auth/me ------------------------------ */
router.get('/me', authRequired, async (req, res) => {
  try {
    const prodId = req.header('x-production-id');
    let prodRole = null;
    let isOwner = false;
    let isMember = false;

    if (prodId) {
      const p = await Production.findById(prodId)
        .select('_id ownerUserId owner members')
        .lean();

      if (p) {
        const meId = toId(req.user._id);
        const ownerId = p.ownerUserId ?? p.owner ?? null;
        isOwner = !!ownerId && idsEqual(ownerId, meId);

        // Inspect members whether ObjectIds or objects { user, role }
        let foundRole = null;
        if (Array.isArray(p.members) && p.members.length) {
          for (const m of p.members) {
            const memberId = toId(m?.user ?? m?._id ?? m?.id ?? m);
            if (memberId && idsEqual(memberId, meId)) {
              isMember = true;
              if (m && typeof m === 'object' && m.role) foundRole = m.role;
              break;
            }
          }
        }

        // Fallback membership via user's own productionIds (fetch if needed)
        if (!isMember) {
          let userProdIds = req.user.productionIds;
          if (!Array.isArray(userProdIds)) {
            const fresh = await User.findById(meId).select('_id productionIds').lean();
            userProdIds = fresh?.productionIds || [];
          }
          isMember = (userProdIds || []).some((pid) => idsEqual(pid, p._id));
        }

        prodRole = isOwner ? 'admin' : (foundRole || (isMember ? 'member' : null));
      }
    }

    return res.json({
      _id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      siteAuthorized: req.user.siteAuthorized,
      productionIds: req.user.productionIds || [],
      productionRole: prodRole,
      productionAccess: { isOwner, isMember },
    });
  } catch (e) {
    return sendError(res, 500, e.message || 'Failed to load profile');
  }
});

export default router;



