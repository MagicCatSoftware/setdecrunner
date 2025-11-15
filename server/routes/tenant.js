// server/routes/tenantRoutes.js
import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Production from '../models/Production.js';

const router = Router();

/* ------------------------------- helpers -------------------------------- */

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

const HEX24 = /^[a-f0-9]{24}$/i;

/**
 * Normalize many possible ID shapes into a string:
 * - string/number
 * - raw ObjectId
 * - documents or payloads with _id / id / user
 *
 * IMPORTANT: for member docs, prefer .user over subdoc _id.
 */
export function toId(v) {
  if (!v) return '';

  if (typeof v === 'string') {
    return HEX24.test(v) ? v : '';
  }

  if (Array.isArray(v)) return toId(v[0]);

  // Raw ObjectId
  if (v instanceof mongoose.Types.ObjectId) return v.toString();

  // For member subdocs, prefer the backing user
  if (v.user) return toId(v.user);

  // Normal docs
  if (v._id) return toId(v._id);
  if (v.id)  return toId(v.id);

  // Last resort
  try {
    const s = v.toString?.();
    return HEX24.test(s) ? s : '';
  } catch {
    return '';
  }
}

export const idsEqual = (a, b) => {
  const A = toId(a), B = toId(b);
  return A && B && A === B;
};

const getProductionId = (req) => {
  const pid = req.headers['x-production-id'];
  return pid ? String(pid).trim() : '';
};

function requireContext(req, res) {
  const uid = toId(req.user);
  const productionId = getProductionId(req);

  if (!uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  if (!productionId || !isObjectId(productionId)) {
    res.status(400).json({ error: 'Missing or invalid x-production-id header' });
    return false;
  }
  return true;
}

/* ----------------------------- owner guard ------------------------------ */
/**
 * requireOwner:
 * - Uses x-production-id header **only**.
 * - If owner exists (in `ownerUserId` or `owner`), it must match current user.
 * - If NO owner, only an existing member can claim; claim sets both `ownerUserId` and `owner`.
 * - Keeps membership in sync:
 *   - owner ∈ Production.members
 *   - productionId ∈ User.productionIds
 */
export async function requireOwner(req, res, next) {
  try {
    if (!requireContext(req, res)) return;

    const userId = toId(req.user);
    const productionId = getProductionId(req);

    const prod = await Production.findById(productionId)
      .select('_id ownerUserId owner members')
      .lean();

    if (!prod) return res.status(404).json({ error: 'Production not found' });

    const ownerId = prod.ownerUserId || prod.owner || null;

    // If already owned, verify and sync
    if (ownerId) {
      if (!idsEqual(ownerId, userId)) {
        return res.status(403).json({ error: 'Owner permissions required' });
      }

      // Ensure bidirectional membership
      const upserts = [];

      const isMember =
        Array.isArray(prod.members) &&
        prod.members.some((m) => idsEqual(m.user, userId));

      if (!isMember) {
        upserts.push(
          Production.updateOne(
            { _id: prod._id },
            { $addToSet: { 'members': { user: userId } } }
          )
        );
      }

      upserts.push(
        User.updateOne(
          { _id: userId },
          { $addToSet: { productionIds: prod._id } }
        )
      );

      if (upserts.length) await Promise.all(upserts);
      return next();
    }

    // No owner yet — only a current member may claim ownership.
    let isMember =
      Array.isArray(prod.members) &&
      prod.members.some((m) => idsEqual(m.user, userId));

    if (!isMember) {
      // OR: user.productionIds contains this production
      const userHasProd = await User.exists({ _id: userId, productionIds: prod._id });
      isMember = !!userHasProd;
    }

    if (!isMember) {
      return res.status(403).json({ error: 'Only an existing member can claim ownership' });
    }

    // Atomically claim ownership (set BOTH fields for compatibility) and ensure membership
    const claimed = await Production.findOneAndUpdate(
      {
        _id: prod._id,
        $or: [
          { ownerUserId: { $exists: false } },
          { ownerUserId: null }
        ],
      },
      {
        $set: { ownerUserId: userId, owner: userId },
        $addToSet: { members: { user: userId } }
      },
      { new: true }
    ).lean();

    if (!claimed) {
      const latest = await Production.findById(prod._id)
        .select('_id ownerUserId owner')
        .lean();
      const nowOwner = latest?.ownerUserId || latest?.owner;
      if (!nowOwner || !idsEqual(nowOwner, userId)) {
        return res.status(403).json({ error: 'Owner permissions required' });
      }
    }

    // Keep user's side in sync
    await User.updateOne(
      { _id: userId },
      { $addToSet: { productionIds: prod._id } }
    );

    return next();
  } catch (e) {
    console.error('requireOwner error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

/* -------------------------------- routes -------------------------------- */
/**
 * GET /members
 * Returns members for this production.
 * Source of truth: Production.members[]
 * (we no longer pull in all global users; only members of this production)
 */
// tenantRoutes.js

router.get('/members', async (req, res) => {
  try {
    // Same guard as before: must have user + x-production-id
    if (!requireContext(req, res)) return;

    // Get production id from header
    const productionId = getProductionId(req);
    if (!productionId) {
      return res.status(400).json({ error: 'Missing production id' });
    }

    // Optional search query (?q=foo)
    const { q } = req.query || {};
    const needle = q && String(q).trim().toLowerCase();

    // Load production with members only (no extra populate)
    const prod = await Production.findById(productionId)
      .select('members ownerUserId owner')
      .lean();

    if (!prod) {
      return res.status(404).json({ error: 'Production not found' });
    }

    // ----- Owner (from User collection) -----
    let owner = null;
    const ownerId = toId(prod.ownerUserId || prod.owner);

    if (ownerId) {
      const u = await User.findById(ownerId)
        .select('_id email name')
        .lean();
      if (u) {
        owner = {
          id: String(u._id),
          email: u.email,
          name: u.name || '',
        };
      }
    }

    // ----- Members from Production.members -----
    // NOTE: this mirrors your working route:
    //   _id      -> member subdocument id
    //   user     -> backing User ObjectId (may be null)
    //   email    -> member email
    //   role     -> member role
    //   siteAuthorized, addedAt

    let members = (prod.members || []).map((m) => ({
      _id: m._id || m.id || null,
      user: m.user || null,
      email: m.email || '',
      role: m.role || 'user',
      siteAuthorized: !!m.siteAuthorized,
      addedAt: m.addedAt || null,
    }));

    // Optional filter by email substring
    if (needle) {
      members = members.filter((m) =>
        (m.email || '').toLowerCase().includes(needle)
      );
    }

    // Sort alphabetically by email
    members.sort((a, b) =>
      (a.email || '').localeCompare(b.email || '')
    );

    return res.json({ owner, members });
  } catch (e) {
    const code = e.status || 500;
    if (code >= 500) {
      console.error('[GET /tenant/tenantauth/members]', e);
    }
    res.status(code).json({ error: e.message || 'Failed to list members' });
  }
});


/**
 * POST /members
 * Body: { email }
 * Owner-only. Upserts user and links both sides.
 */
router.post('/members', requireOwner, async (req, res) => {
  try {
    if (!requireContext(req, res)) return;

    const productionId = getProductionId(req);
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Upsert/find user
    const user = await User.findOneAndUpdate(
      { email },
      { $setOnInsert: { email } },
      { upsert: true, new: true }
    ).lean();

    // Ensure membership on the Production side
    const prod = await Production.findById(productionId)
      .select('_id members')
      .lean();
    if (!prod) return res.status(404).json({ error: 'Production not found' });

    const userIdStr = String(user._id);
    const hasMember = (prod.members || []).some((m) =>
      String(m?.user || m) === userIdStr
    );

    if (!hasMember) {
      // members: [{ user: ObjectId, ... }]
      await Production.updateOne(
        { _id: productionId, 'members.user': { $ne: user._id } },
        {
          $push: {
            members: {
              user: user._id,
              email,
              role: 'editor',
              siteAuthorized: true,
            },
          },
        }
      );
    }

    // Ensure membership on the User side
    await User.updateOne(
      { _id: user._id },
      { $addToSet: { productionIds: productionId } }
    );

    return res.json({
      ok: true,
      user: { id: user._id, email: user.email },
    });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error('POST /members error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /members/:userId
 * Owner-only. Removes membership on both sides. Owner cannot remove self.
 */
const toOid = (v) => {
  const s = String(v || '').trim();
  return mongoose.Types.ObjectId.isValid(s)
    ? new mongoose.Types.ObjectId(s)
    : null;
};

router.delete('/members/:userId', requireOwner, async (req, res) => {
  try {
    if (!requireContext(req, res)) return;

    const productionId = getProductionId(req);
    const { userId } = req.params;

    const prodOid = toOid(productionId);
    const userOid = toOid(userId);
    if (!prodOid) return res.status(400).json({ error: 'Invalid production id' });
    if (!userOid) return res.status(400).json({ error: 'Invalid userId' });

    // Owner guard
    const prod = await Production.findById(prodOid)
      .select('ownerUserId owner')
      .lean();
    if (!prod) return res.status(404).json({ error: 'Production not found' });

    const ownerId =
      prod.ownerUserId ?? prod.owner
        ? String(prod.ownerUserId ?? prod.owner)
        : null;
    if (ownerId && String(userOid) === ownerId) {
      return res.status(400).json({ error: 'Owner cannot be removed' });
    }

    const userIdStr = String(userOid);

    const [
      pullObjectOid,
      pullObjectStr,
      pullUserSide,
    ] = await Promise.all([
      // members: [{ user: ObjectId, ... }]
      Production.updateOne(
        { _id: prodOid },
        { $pull: { members: { user: userOid } } }
      ),
      Production.updateOne(
        { _id: prodOid },
        { $pull: { members: { user: userIdStr } } }
      ),
      User.updateOne(
        { _id: userOid },
        { $pull: { productionIds: prodOid } }
      ),
    ]);

    const modified =
      (pullObjectOid.modifiedCount ?? pullObjectOid.nModified ?? 0) +
      (pullObjectStr.modifiedCount ?? pullObjectStr.nModified ?? 0);

    return res.json({ ok: true, removedFromProduction: modified > 0 });
  } catch (e) {
    console.error('DELETE /members/:userId error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;


