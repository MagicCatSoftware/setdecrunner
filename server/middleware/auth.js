// server/middleware/auth.js (ESM)
import jwt from 'jsonwebtoken';
import Production from '../models/Production.js';
import User from '../models/User.js';

const SECRET = process.env.JWT_SECRET || 'devsecret';

/**
 * Issue a signed JWT for a user.
 * Encodes minimal, non-sensitive claims; always check DB on requests.
 */
export function issueJwt(user, { expiresIn = '12h' } = {}) {
  const payload = {
    id: String(user._id),
    email: user.email,
    role: user.role || 'user',
    isAdmin: user.role === 'admin' || user.isAdmin === true,
  };
  return jwt.sign(payload, SECRET, { expiresIn });
}

/**
 * Auth middleware:
 *  - Reads Bearer token (or cookie "token" as fallback)
 *  - Verifies JWT
 *  - Loads fresh user from DB (so role/flags reflect latest)
 *  - Blocks banned users
 */
export async function authRequired(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token =
      hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : (req.cookies?.token || '').trim();

  
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    let decoded;
    try {
      decoded = jwt.verify(token, SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await User.findById(decoded.id)
      .select('_id email name productionIds')
      .lean();

    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.banned) return res.status(403).json({ error: 'Account disabled' });

    req.user = {
      id: String(user._id),
      _id: user._id,
      email: user.email,
      name: user.name,
      
      productionIds: user.productionIds || [],
    };

    console.log(req.user);
 
    next();
  } catch (e) {

    next(e);
  }
}

/**
 * Site-level authorization gate (used across SetDec Runner app).
 * Global admins bypass. Otherwise requires user.siteAuthorized = true.
 */
export function requireSiteAuthorized(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.isAdmin) return next(); // global admin bypass
  if (req.user.siteAuthorized) return next();
  return res.status(403).json({ error: 'Not site-authorized' });
}

/**
 * Tenant membership check.
 * Expects production/tenant via header: x-production-id
 * Attaches req.productionId for downstream use.
 */
export function requireMembership(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const prodId = String(req.headers['x-production-id'] || req.productionId || '').trim();
  if (!prodId) return res.status(400).json({ error: 'Missing x-production-id' });

  req.productionId = prodId;

  const ids = (req.user.productionIds || []).map(String);
  if (!ids.includes(prodId)) {
    return res.status(403).json({ error: 'Not a member of this production' });
  }
  next();
}

/**
 * Helper: determine if the current user is the owner (tenant admin) of the
 * current production indicated by x-production-id / req.productionId.
 */
async function isTenantOwner(req) {
  const prodId = String(req.productionId || req.headers['x-production-id'] || '').trim();
  if (!prodId) return false;

  // per-request tiny cache to avoid re-querying
  if (req._tenantOwnerChecked) return !!req._tenantOwnerIsOwner;

  const prod = await Production.findById(prodId).select('ownerUserId').lean();
  const ok = !!(prod && String(prod.ownerUserId) === String(req.user._id));

  req._tenantOwnerChecked = true;
  req._tenantOwnerIsOwner = ok;
  return ok;
}

/**
 * Role gate. Examples:
 *   requireRole('any')     -> allow any authenticated user
 *   requireRole('admin')   -> global admin OR production owner (tenant admin)
 *   requireRole('manager') -> exact role match (custom)
 *
 * NOTE: For tenant admin resolution, ensure the route also sets/has
 * req.productionId (use requireMembership before this) OR sends x-production-id.
 */
export function requireRole(required = 'any') {
  return async function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    if (required === 'any') return next();

    if (required === 'admin') {
      // global admin?
      if (req.user.isAdmin) return next();

      // tenant admin (production owner)?
      try {
        if (await isTenantOwner(req)) return next();
      } catch (e) {
        // fall through to 403 on DB errors as well
      }
      return res.status(403).json({ error: 'Admin required' });
    }

    // Generic role check for custom roles
    if ((req.user.role || '').toLowerCase() === String(required).toLowerCase()) {
      return next();
    }

    return res.status(403).json({ error: 'Forbidden' });
  };
}


