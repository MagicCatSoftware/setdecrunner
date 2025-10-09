// server/middleware/tenantAuth.js
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Production from '../models/Production.js';

const TENANT_JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

/* ---------------- helpers ---------------- */
const HEX24 = /^[a-f0-9]{24}$/i;
const isHex24 = (s) => HEX24.test(String(s || ''));
const lc = (s) => String(s || '').trim().toLowerCase();
const readBearer = (req) => {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return '';
};
const readPid = (req) => String(req.headers['x-production-id'] || req.productionId || '').trim();
const toId = (v) => {
  if (!v) return '';
  if (typeof v === 'string' && isHex24(v)) return v;
  try { const s = v?.toString?.(); return isHex24(s) ? s : ''; } catch { return ''; }
};

/* ------------------------------------------------------------------
 * 1) Verify tenant JWT and attach req.tenant
 *    (token payload convention: { pid, mid, uid, email, role, owner })
 * ------------------------------------------------------------------ */
export function tenantAuthRequired(req, res, next) {
  try {
    const token = readBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const dec = jwt.verify(token, TENANT_JWT_SECRET);
    req.tenant = dec;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

/* ------------------------------------------------------------------
 * 2) Ensure X-Production-Id is present/valid and (optionally) matches
 *    the pid in the tenant token.
 *    Attaches req.productionId.
 * ------------------------------------------------------------------ */
export function requireTenantHeader({ mustMatchToken = true } = {}) {
  return (req, res, next) => {
    const pid = readPid(req);
    if (!pid) return res.status(400).json({ error: 'Missing X-Production-Id header' });
    if (!mongoose.isValidObjectId(pid)) {
      return res.status(400).json({ error: `Invalid production id: ${pid}` });
    }
    if (mustMatchToken && req.tenant?.pid && String(req.tenant.pid) !== String(pid)) {
      return res.status(403).json({ error: 'Production header does not match token' });
    }
    req.productionId = pid;
    next();
  };
}

/* ------------------------------------------------------------------
 * 3) Load production and resolve membership.
 *    Attaches:
 *      - req.production (lean subset)
 *      - req.tenantMember (member object or null)
 *      - req.tenantAccess = { isOwner, role, authorized, isMember }
 * ------------------------------------------------------------------ */
export async function loadTenantContext(req, res, next) {
  try {
    const pid = readPid(req);
    if (!pid) return res.status(400).json({ error: 'Missing X-Production-Id header' });

    const prod = await Production.findById(pid)
      .select('_id slug ownerUserId owner members._id members.user members.email members.role members.siteAuthorized')
      .lean();

    if (!prod) return res.status(404).json({ error: 'Production not found' });

    const ownerId = toId(prod.ownerUserId ?? prod.owner);
    const { mid, uid, email } = req.tenant || {};

    // Find the member by (priority): member _id, user _id, or email
    let member = null;
    const targetMid = toId(mid);
    const targetUid = toId(uid);
    const targetEmail = lc(email || '');

    if (Array.isArray(prod.members)) {
      member = prod.members.find((m) =>
        (m?._id && String(m._id) === targetMid) ||
        (m?.user && String(m.user) === targetUid) ||
        (m?.email && lc(m.email) === targetEmail)
      ) || null;
    }

    const isOwner = !!(ownerId && targetUid && ownerId === String(targetUid));
    const role = isOwner ? 'admin' : String(member?.role || 'user').toLowerCase();
    const authorized = isOwner ? true : !!member?.siteAuthorized;

    req.production = prod;
    req.tenantMember = member;
    req.tenantAccess = {
      isOwner,
      role,
      authorized,
      isMember: !!(isOwner || member),
    };

    next();
  } catch (e) {
    next(e);
  }
}

/* ------------------------------------------------------------------
 * 4) Gates you can compose per-route
 * ------------------------------------------------------------------ */

// Must be a member (or owner) of the production.
export function requireTenantMember(req, res, next) {
  const acc = req.tenantAccess;
  if (!acc?.isMember) return res.status(403).json({ error: 'Not a member of this production' });
  next();
}

// Must be authorized (siteAuthorized) or owner.
export function requireTenantAuthorized(req, res, next) {
  const acc = req.tenantAccess;
  if (!acc?.isMember) return res.status(403).json({ error: 'Not a member of this production' });
  if (acc.isOwner || acc.authorized) return next();
  return res.status(403).json({ error: 'Member not yet site-authorized' });
}

// Must be owner or member with role=admin.
export function requireTenantAdmin(req, res, next) {
  const acc = req.tenantAccess;
  if (!acc?.isMember) return res.status(403).json({ error: 'Not a member of this production' });
  if (acc.isOwner || String(acc.role).toLowerCase() === 'admin') return next();
  return res.status(403).json({ error: 'Admins only for this production' });
}

// Require a specific tenant role (owner passes).
export function requireTenantRole(requiredRole) {
  const wanted = String(requiredRole || '').toLowerCase();
  return (req, res, next) => {
    const acc = req.tenantAccess;
    if (!acc?.isMember) return res.status(403).json({ error: 'Not a member of this production' });
    if (acc.isOwner) return next();
    if (String(acc.role).toLowerCase() === wanted) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

/* ------------------------------------------------------------------
 * 5) One-liner: combine them in sensible defaults
 *    Options:
 *      - authorized: boolean (default false)
 *      - admin: boolean (default false)
 *      - role: string (exact match; owner always allowed)
 * ------------------------------------------------------------------ */
export function tenantGate({ authorized = false, admin = false, role = '' } = {}) {
  return [
    tenantAuthRequired,
    requireTenantHeader({ mustMatchToken: true }),
    loadTenantContext,
    (req, res, next) => {
      // Always require membership at least
      if (!req.tenantAccess?.isMember) {
        return res.status(403).json({ error: 'Not a member of this production' });
      }
      if (authorized && !(req.tenantAccess.isOwner || req.tenantAccess.authorized)) {
        return res.status(403).json({ error: 'Member not yet site-authorized' });
      }
      if (admin && !(req.tenantAccess.isOwner || req.tenantAccess.role === 'admin')) {
        return res.status(403).json({ error: 'Admins only for this production' });
      }
      if (role && !(req.tenantAccess.isOwner || req.tenantAccess.role === String(role).toLowerCase())) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    },
  ];
}

export default {
  tenantAuthRequired,
  requireTenantHeader,
  loadTenantContext,
  requireTenantMember,
  requireTenantAuthorized,
  requireTenantAdmin,
  requireTenantRole,
  tenantGate,
};
