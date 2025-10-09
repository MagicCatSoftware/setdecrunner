import mongoose from 'mongoose';
import Production, { normalizeSlug } from '../models/Production.js';

function toId(v) {
  if (!v) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  const maybe =
    v._id ?? v.user ?? v.id ?? v.userId ?? v.uid ??
    (typeof v.valueOf === 'function' ? v.valueOf() : null);
  if (maybe) return String(maybe).trim();
  try {
    const s = v.toString?.();
    return s && /^[a-f0-9]{24}$/i.test(s) ? s : '';
  } catch { return ''; }
}

export async function requireMembership(req, res, next) {
  try {
    // 1) Try explicit production id (header/query/body)
    let prodId =
      req.headers['x-production-id'] ||
      req.headers['X-Production-Id'] ||
      req.query.productionId ||
      req.body?.productionId ||
      '';

    let prod = null;

    if (prodId && mongoose.isValidObjectId(prodId)) {
      prod = await Production.findById(prodId)
        .select('_id ownerUserId owner members title slug isActive')
        .lean();
      if (!prod) return res.status(404).json({ error: 'Production not found' });
    } else {
      // 2) Fallback: resolve by slug (from route params or query)
      const slugRaw = (req.params && req.params.slug) || req.query?.slug;
      if (!slugRaw) {
        // No header and no slug → truly missing context
        return res.status(400).json({ error: 'Missing production context (no x-production-id or slug)' });
      }

      const slug = normalizeSlug(String(slugRaw));
      prod = await Production.findOne({ slug, isActive: true })
        .select('_id ownerUserId owner members title slug isActive')
        .lean();

      if (!prod) return res.status(404).json({ error: 'Production not found' });

      prodId = String(prod._id);
      // reflect the resolved id so downstream middleware/handlers can read it if they rely on the header
      req.headers['x-production-id'] = prodId;
    }
    
    // 3) Must be authenticated (authRequired should run before this)
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 4) Membership/role check
    const meId = toId(req.user._id);
    const ownerId = toId(prod.ownerUserId ?? prod.owner);
    const isOwner = !!ownerId && ownerId === meId;
    const isSiteAdmin = !!req.user.isAdmin;

    // members can be [ObjectId] or [{ user, role }]
    let memberRole = null;
    if (Array.isArray(prod.members) && prod.members.length) {
      for (const m of prod.members) {
        const mid = toId(m?.user ?? m);
        if (mid && mid === meId) {
          memberRole = (m && typeof m === 'object' && m.role) ? String(m.role) : 'member';
          break;
        }
      }
    }

    if (!isOwner && !memberRole && !isSiteAdmin) {
      return res.status(403).json({ error: 'Not a member of this production' });
    }

    // 5) Attach context for downstream
    req.production = prod;
    req.membership = {
      role: isOwner ? 'admin' : (memberRole || 'member'),
      productionId: prodId,
    };
    req.isProductionAdmin = isOwner || memberRole === 'admin' || isSiteAdmin;

    return next();
  } catch (e) {
    return next(e);
  }
}

// Optional helper if you have routes that need admin-only after membership:
export function requireProductionAdmin(req, res, next) {
  if (req.isProductionAdmin) return next();
  return res.status(403).json({ error: 'Production admin only' });
}

