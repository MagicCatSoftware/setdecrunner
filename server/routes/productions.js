// server/routes/productions.js
import express from 'express';
import mongoose from 'mongoose';
import Production, { normalizeSlug } from '../models/Production.js';
import { authRequired } from '../middleware/auth.js';
import { requireMembership } from '../middleware/requireMembership.js';

const router = express.Router();

/* --------------------------- utils --------------------------- */
const HEX24 = /^[a-f0-9]{24}$/i;
const isObjectId = (v) => typeof v === 'string' && HEX24.test(v);

function toObjectIdOrNull(v) {
  try {
    if (!v) return null;
    if (typeof v === 'string' && isObjectId(v)) return new mongoose.Types.ObjectId(v);
    if (typeof v === 'object') {
      const cand =
        v._id ?? v.user ?? v.id ?? v.userId ?? v.$oid ??
        (typeof v.valueOf === 'function' ? v.valueOf() : null);
      if (typeof cand === 'string' && isObjectId(cand)) return new mongoose.Types.ObjectId(cand);
      if (isObjectId(String(cand))) return new mongoose.Types.ObjectId(String(cand));
    }
  } catch {}
  return null;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** Returns a Mongoose Query so callers can chain `.lean()` or await a doc. */
function getProductionQuery(idOrSlug) {
  return isObjectId(String(idOrSlug))
    ? Production.findById(idOrSlug)
    : Production.findOne({ slug: String(idOrSlug).toLowerCase().trim() });
}

/** Normalize members to [{ user:ObjectId, role:'admin'|'editor'|'viewer' }] and de-dupe by user. */
function normalizeMembers(arr) {
  if (!Array.isArray(arr)) return undefined; // "not provided"
  const map = new Map(); // userId(str) -> role
  for (const m of arr) {
    if (!m) continue;

    // Accept: "id", {_id}, {id}, {user}, {user:{_id}}, etc.
    const rawUser = typeof m === 'object' ? (m.user ?? m._id ?? m.id) : m;
    const oid = toObjectIdOrNull(rawUser);
    if (!oid) continue;

    let role = (typeof m === 'object' ? m.role : null) || 'editor';
    role = String(role).toLowerCase();
    role = ['admin', 'editor', 'viewer'].includes(role) ? role : 'editor';

    map.set(String(oid), role); // last one wins
  }
  return [...map.entries()].map(([id, role]) => ({ user: new mongoose.Types.ObjectId(id), role }));
}

/** Clean an existing document’s members in-place (drop invalids, de-dupe). */
function sanitizeExistingMembers(doc) {
  const current = Array.isArray(doc.members) ? doc.members : [];
  const normalized = normalizeMembers(
    current.map((m) => (m?.user ? { user: m.user, role: m.role } : m))
  );
  if (normalized !== undefined) doc.members = normalized;
}

/* --------------------------- AUTH ONLY (list) --------------------------- */


/**
 * GET /api/productions   (or /api/tenant/productions if mounted there)
 * Lists productions where the current user is owner or member.
 * ?q= search (title/slug/company), ?limit= (default 200, max 500)
 */


/* --------------------------- MEMBERSHIP-SCOPED --------------------------- */

/** GET /api/productions/:id  (id or slug) */
router.get('/:id', async (req, res, next) => {
  
  try {

    const prod = await getProductionQuery(req.params.id).lean();
    
    if (!prod) return res.status(404).json({ error: 'Not found' });
    res.json(prod);
  } catch (e) { console.log(e); next(e); }
});
router.use(authRequired);
router.use(requireMembership);

router.get('/', async (req, res, next) => {
  
  try {
    
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);

    const meStr = String(req.user?._id || req.user?.id || '').trim();
    const meId  = toObjectIdOrNull(meStr) ?? meStr;

    const membershipFilter = { $or: [{ ownerUserId: meId }, { 'members.user': meId }] };

    const textFilter = q
      ? {
          $or: [
            { title: { $regex: q, $options: 'i' } },
            { slug: { $regex: q, $options: 'i' } },
            { productioncompany: { $regex: q, $options: 'i' } },
            { company: { $regex: q, $options: 'i' } },
          ],
        }
      : {};

    const filter = { ...membershipFilter, ...textFilter };

    const prods = await Production.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('_id title slug productioncompany productionaddress productionphone isActive ownerUserId members createdAt updatedAt')
      .lean();

    

    res.json(prods);
  } catch (e) { next(e); }
});

/** PATCH /api/productions/:id  (id or slug) */
router.patch('/:id', async (req, res, next) => {
  try {
    const prod = await getProductionQuery(req.params.id); // doc (not lean)
    if (!prod) return res.status(404).json({ error: 'Not found' });

    // 1) Always sanitize whatever is currently stored to avoid legacy bad rows.
    sanitizeExistingMembers(prod);

    // 2) Apply allowed top-level fields.
    const allowed = pick(req.body, [
      'title',
      'slug',
      'isActive',
      'productionphone',
      'productionaddress',
      'productioncompany',
      // legacy fallbacks (optional)
      'phone', 'address', 'company',
      'ownerUserId',
    ]);
    if (allowed.slug) allowed.slug = normalizeSlug(allowed.slug);
    if (allowed.ownerUserId) {
      const ownerOid = toObjectIdOrNull(allowed.ownerUserId);
      if (ownerOid) allowed.ownerUserId = ownerOid;
      else delete allowed.ownerUserId;
    }
    Object.assign(prod, allowed);

    // 3) Members (only if provided) — robust normalization.
    if (Array.isArray(req.body?.members)) {
      const normalized = normalizeMembers(req.body.members);
      // If client sent an empty array, that legitimately clears memberships.
      if (normalized !== undefined) prod.members = normalized;
    }

    // 4) Save
    await prod.save();
    res.json(prod.toObject());
  } catch (e) { next(e); }
});

export default router;

