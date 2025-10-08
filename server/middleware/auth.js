// server/middleware/auth.js (ESM)
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Production from '../models/Production.js';
import User from '../models/User.js';

const SECRET = process.env.JWT_SECRET || 'devsecret';

/* ------------------------------ helpers ------------------------------ */
const HEX24 = /^[a-f0-9]{24}$/i;
const isHex24 = (s) => HEX24.test(String(s || ''));
const lc = (s) => String(s || '').trim().toLowerCase();
const toId = (v) => {
  if (!v) return '';
  if (typeof v === 'string' && isHex24(v)) return v;
  try { const s = v?.toString?.(); return isHex24(s) ? s : ''; } catch { return ''; }
};
const readBearer = (req) => {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  const cookieTok = (req.cookies?.token || '').trim();
  return cookieTok || '';
};
const readPid = (req) =>
  String(req.headers['x-production-id'] || req.productionId || '').trim();

/* ------------------------------ JWT mint ------------------------------ */
/** Issue a signed JWT for a user. Keep claims minimal; always load from DB. */
export function issueJwt(user, { expiresIn = '12h' } = {}) {
  const payload = {
    id: String(user._id),
    email: user.email,
    role: user.role || 'user',
    // keep isAdmin for legacy site-wide gates; NOT used for tenant admin anymore
    isAdmin: user.isAdmin === true || String(user.role || '').toLowerCase() === 'admin',
  };
  return jwt.sign(payload, SECRET, { expiresIn });
}

/* --------------------------- authRequired --------------------------- */
/**
 * - Reads Bearer token (cookie "token" fallback)
 * - Verifies JWT
 * - Loads fresh user from DB (role/flags current)
 * - Blocks banned users
 */
export async function authRequired(req, res, next) {
  try {
    const token = readBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    let decoded;
    try {
      decoded = jwt.verify(token, SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await User.findById(decoded.id)
      .select('_id email name role isAdmin siteAuthorized banned productionIds')
      .lean();

    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.banned) return res.status(403).json({ error: 'Account disabled' });

    req.user = {
      id: String(user._id),
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      isAdmin: user.isAdmin === true || String(user.role || '').toLowerCase() === 'admin',
      siteAuthorized: !!user.siteAuthorized,
      productionIds: user.productionIds || [],
    };

    next();
  } catch (e) {
    next(e);
  }
}

/* ----------------------- requireSiteAuthorized ----------------------- */
/** Site-level gate: global admins bypass; otherwise requires user.siteAuthorized = true. */
export function requireSiteAuthorized(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.isAdmin) return next(); // site-global admin bypass (not tenant admin)
  if (req.user.siteAuthorized) return next();
  return res.status(403).json({ error: 'Not site-authorized' });
}

/* -------------------------- tenant helpers --------------------------- */
async function loadProduction(prodId) {
  return Production.findById(prodId)
    .select('_id ownerUserId owner members.user members.role members.email')
    .lean();
}

/** Compute tenant access based purely on the Production doc. */
async function computeTenantAccess(req, prodOpt) {
  const prodId = readPid(req);
  if (!prodId) throw Object.assign(new Error('Missing x-production-id'), { status: 400 });
  if (!mongoose.isValidObjectId(prodId)) {
    throw Object.assign(new Error(`Invalid production id: ${prodId}`), { status: 400 });
  }

  const prod = prodOpt || (await loadProduction(prodId));
  if (!prod) throw Object.assign(new Error('Production not found'), { status: 404 });

  const me = toId(req.user?._id);
  const ownerId = toId(prod.ownerUserId || prod.owner);
  const isOwner = !!me && ownerId === me;

  let memberRole = null;
  let isMember = false;

  if (Array.isArray(prod.members)) {
    for (const m of prod.members) {
      const mUser = toId(m?.user);
      const mEmail = lc(m?.email);
      if ((mUser && mUser === me) || (mEmail && mEmail === lc(req.user?.email))) {
        isMember = true;
        if (m?.role) memberRole = String(m.role).toLowerCase();
        break;
      }
    }
  }

  return {
    prodId,
    prod,
    isOwner,
    isMember: !!(isOwner || isMember),
    role: isOwner ? 'admin' : (memberRole || null), // owner counts as admin in-tenant
  };
}

/* -------------------------- requireMembership -------------------------- */
/**
 * Tenant membership check.
 * Accepts if:
 *   - user is production owner, OR
 *   - user appears in Production.members by user _id OR members.email, OR
 *   - user.productionIds includes pid
 * Attaches:
 *   req.productionId, req.production, req.productionAccess
 */
// server/middleware/auth.js (ESM) — only the requireMembership function changed

export async function requireMembership(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const isProbe = String(req.query?.probe || '') === '1';
    const prodId = readPid(req);

    // If it's just a probe and we don't have a PID yet, don't error—return 204 so the UI can continue.
    if (!prodId) {
      return isProbe
        ? res.status(204).end()
        : res.status(400).json({ error: 'Missing x-production-id' });
    }

    if (!mongoose.isValidObjectId(prodId)) {
      return isProbe
        ? res.status(204).end()
        : res.status(400).json({ error: `Invalid production id: ${prodId}` });
    }

    // Fast path: if user's list says yes, still attach production lightweight later
    const inList = (req.user.productionIds || []).map(String).includes(prodId);

    // Load production once; reuse later
    const prod = await Production.findById(prodId)
      .select('_id ownerUserId owner members.user members.role members.email')
      .lean();

    if (!prod) {
      return isProbe
        ? res.status(204).end()
        : res.status(404).json({ error: 'Production not found' });
    }

    const me = toId(req.user._id);
    const isOwner =
      !!me && (toId(prod.ownerUserId) === me || toId(prod.owner) === me);

    // Look for membership either by referenced user id OR by email
    let memberRole = null;
    let isMember = false;

    if (Array.isArray(prod.members)) {
      for (const m of prod.members) {
        const mUser = toId(m?.user);
        const mEmail = lc(m?.email);
        if ((mUser && mUser === me) || (mEmail && mEmail === lc(req.user.email))) {
          isMember = true;
          memberRole = (m?.role && String(m.role).toLowerCase()) || memberRole;
          break;
        }
      }
    }

    const allowed = inList || isOwner || isMember;
    if (!allowed) {
      return isProbe
        ? res.status(204).end()
        : res.status(403).json({ error: 'Not a member of this production' });
    }

    // Attach context for downstream
    req.productionId = prodId;
    req.production = prod;
    req.productionAccess = {
      isOwner: !!isOwner,
      isMember: !!(isOwner || isMember),
      role: isOwner ? 'admin' : (memberRole || null),
    };

    next();
  } catch (e) {
    next(e);
  }
}


/* ----------------------------- requireRole ----------------------------- */
/**
 * Tenant role gate (NO global user-admin bypass here).
 * - 'any'    → any authenticated user
 * - 'admin'  → production owner OR production member with role=admin
 * - other    → production member whose role matches exactly (e.g., 'editor')
 *
 * Put `requireMembership` before this to avoid re-loading the production;
 * if not present, we'll compute access on demand using X-Production-Id.
 */
export function requireRole(required = 'any') {
  return async function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const wanted = String(required || 'any').toLowerCase();
    if (wanted === 'any') return next();

    try {
      // Use existing context if available; else compute from Production
      const access = req.productionAccess || (await computeTenantAccess(req));

      if (wanted === 'admin') {
        if (access.isOwner) return next();
        if ((access.role || '') === 'admin') return next();
        return res.status(403).json({ error: 'Admins only for this production' });
      }

      // exact tenant role match (editor, viewer, etc.)
      if ((access.role || '') === wanted) return next();

      return res.status(403).json({ error: 'Forbidden' });
    } catch (e) {
      const code = e.status || 500;
      return res.status(code).json({ error: e.message || 'Role check failed' });
    }
  };
}

/* -------------------------- requireTenantAdmin -------------------------- */
/** Alias for tenant admin (owner OR member with role=admin) */
export function requireTenantAdmin(req, res, next) {
  return requireRole('admin')(req, res, next);
}



