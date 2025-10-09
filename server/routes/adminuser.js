// server/routes/adminUsers.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import User from '../models/User.js';
import Production from '../models/Production.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

const HEX24 = /^[a-f0-9]{24}$/i;
const isHex24 = (s) => HEX24.test(String(s || ''));
const lc = (s) => String(s || '').trim().toLowerCase();
const allowedRoles = new Set(['admin', 'editor', 'viewer', 'coordinator', 'driver', 'user']);

function toId(v) {
  if (!v) return '';
  if (typeof v === 'string') return isHex24(v) ? v : '';
  try { const s = v?.toString?.(); return isHex24(s) ? s : ''; } catch { return ''; }
}

function readProdIdFromReq(req) {
  return String(req?.headers?.['x-production-id'] ?? '').trim();
}

/** Accepts the req object OR a raw string id */
function getProdIdOrThrow(arg) {
  const v = typeof arg === 'string' ? String(arg).trim() : readProdIdFromReq(arg);
  if (!v) {
    const err = new Error('Missing X-Production-Id header');
    err.status = 400;
    throw err;
  }
  if (!mongoose.isValidObjectId(v)) {
    const err = new Error(`Invalid production id: ${v}`);
    err.status = 400;
    throw err;
  }
  return v;
}

/** IMPORTANT: project the FULL members array */
async function getProductionOrThrow(prodId) {
  const prod = await Production.findById(prodId)
    .select('_id slug title name ownerUserId owner members') // ⬅ include members entirely
    .lean();
  if (!prod) {
    const err = new Error(`Unknown production id: ${prodId}`);
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(prod.members)) prod.members = [];
  return prod;
}

function isOwnerUserId(prod, userId) {
  const owner = toId(prod.ownerUserId || prod.owner);
  return !!owner && owner === toId(userId);
}
function isOwnerOrAdminOf(prod, userId) {
  const me = toId(userId);
  if (!me || !prod) return false;
  if (isOwnerUserId(prod, me)) return true;
  return (prod.members || []).some(
    (m) => toId(m?.user) === me && String(m?.role || '').toLowerCase() === 'admin'
  );
}
function isOwnerMember(prod, member) {
  return member?.user && isOwnerUserId(prod, member.user);
}
function assertRoleValid(role) {
  const r = String(role || '').toLowerCase();
  return allowedRoles.has(r) ? r : null;
}
function findMemberByAnyId(prod, memberId) {
  const mid = toId(memberId);
  if (!mid) return null;
  const byMemberId = (prod.members || []).find(m => isHex24(m?._id) && String(m._id) === mid);
  if (byMemberId) return byMemberId;
  const byUserId = (prod.members || []).find(m => isHex24(m?.user) && String(m.user) === mid);
  return byUserId || null;
}

/* ---------------- requireTenantAdmin (owner or admin) ---------------- */
async function requireTenantAdmin(req, res, next) {
  try {
    if (!req.user) {
      const err = new Error('Unauthorized'); err.status = 401; throw err;
    }
    const prodId = getProdIdOrThrow(req);
    // Make sure this guard loads the FULL members array
    const prod = await getProductionOrThrow(prodId);

    if (!isOwnerOrAdminOf(prod, req.user?._id)) {
      const err = new Error('Admins only for this production');
      err.status = 403; throw err;
    }

    req.productionId = prodId;
    req.production = prod; // already includes members
    next();
  } catch (e) {
    const code = e.status || 500;
    if (code >= 500) console.error('[requireTenantAdmin]', e);
    res.status(code).json({ error: e.message || 'Forbidden' });
  }
}

/* =========================================================================
   GET /tenant/admin/users
   Returns { owner, members[] }
   ========================================================================= */
router.get(
  '/users',
  async (req, res) => {
    try {
      // Use the cached production, but re-fetch with full projection if needed
      let prod = req.production;
      if (!prod || !Array.isArray(prod.members)) {
        const pid = req.productionId || getProdIdOrThrow(req);
        prod = await getProductionOrThrow(pid);
      }

      // Owner (from User collection)
      let owner = null;
      const ownerId = toId(prod.ownerUserId || prod.owner);
      if (ownerId) {
        const u = await User.findById(ownerId).select('_id email name').lean();
        if (u) owner = { id: String(u._id), email: u.email, name: u.name || '' };
      }

      // Members from Production.members (no extra queries)
      const { q } = req.query || {};
      const needle = q && String(q).trim().toLowerCase();

      let members = (prod.members || []).map((m) => ({
        _id: m._id || m.id || null,
        user: m.user || null,                              // may be null if you didn’t store it
        email: m.email || '',
        role: m.role || 'user',
        siteAuthorized: !!m.siteAuthorized,
        addedAt: m.addedAt || null,
      }));

      if (needle) {
        members = members.filter(m => (m.email || '').toLowerCase().includes(needle));
      }

      members.sort((a, b) => (a.email || '').localeCompare(b.email || ''));

      return res.json({ owner, members });
    } catch (e) {
      const code = e.status || 500;
      if (code >= 500) console.error('[GET /tenant/admin/users]', e);
      res.status(code).json({ error: e.message || 'Failed to list users' });
    }
  }
);

/* =========================================================================
   POST /tenant/admin/users
   ========================================================================= */
router.post(
  '/users',
  async (req, res) => {
    try {
      const prod = req.production || await getProductionOrThrow(getProdIdOrThrow(req));
      const prodId = String(prod._id);

      const { userId, email, role, tempPassword, siteAuthorized } = req.body || {};
      const emailLC = lc(email || '');
      if (!emailLC) return res.status(400).json({ error: 'email is required' });

      // Owner email cannot be added as member
      const ownerId = toId(prod.ownerUserId || prod.owner);
      if (ownerId) {
        const ownerUser = await User.findById(ownerId).select('_id email').lean();
        if (ownerUser && lc(ownerUser.email) === emailLC) {
          return res.status(409).json({ error: 'Owner cannot be added as a member' });
        }
      }

      // Prevent duplicate emails in members
      const dup = (prod.members || []).find((m) => lc(m?.email) === emailLC);
      if (dup) return res.status(409).json({ error: 'Member with this email already exists' });

      // Ensure backing User doc (optional, if you store user ref)
      let backingUserId = '';
      if (userId && isHex24(userId)) {
        backingUserId = userId;
      } else {
        const existing = await User.findOne({ email: emailLC }).select('_id productionIds').lean();
        if (existing) {
          backingUserId = String(existing._id);
          if (!((existing.productionIds || []).map(String).includes(prodId))) {
            await User.updateOne({ _id: existing._id }, { $addToSet: { productionIds: prodId } });
          }
        } else {
          const created = await User.create({ email: emailLC, productionIds: [prodId] });
          backingUserId = String(created._id);
        }
      }

      const roleSafe = assertRoleValid(role) || 'user';
      const memberDoc = {
        user: backingUserId || undefined,
        role: roleSafe,
        siteAuthorized: !!siteAuthorized,
        email: emailLC,
        addedAt: new Date(),
      };

      if (tempPassword) {
        if (String(tempPassword).length < 8) {
          return res.status(400).json({ error: 'Temp password must be at least 8 characters' });
        }
        memberDoc.passwordHash = await bcrypt.hash(String(tempPassword), 10);
      }

      await Production.updateOne(
        { _id: prodId, 'members.email': { $ne: emailLC } },
        { $push: { members: memberDoc } },
        { strict: false }
      );

      const refreshed = await Production.findOne(
        { _id: prodId, 'members.email': emailLC },
        { 'members.$': 1 }
      ).lean();
      const createdMember = refreshed?.members?.[0];

      return res.status(201).json({
        ok: true,
        member: {
          _id: createdMember?._id || null,
          user: createdMember?.user || backingUserId || null,
          email: createdMember?.email || emailLC,
          role: createdMember?.role || roleSafe,
          siteAuthorized: !!createdMember?.siteAuthorized,
          addedAt: createdMember?.addedAt || null,
        },
      });
    } catch (e) {
      const code = e.status || 500;
      if (code >= 500) console.error('[POST /tenant/admin/users]', e);
      res.status(code).json({ error: e.message || 'Failed to add member' });
    }
  }
);

/* =========================================================================
   PATCH /tenant/admin/users/:id
   ========================================================================= */
router.patch(
  '/users/:id',
  async (req, res) => {
    try {
      const prod = req.production || await getProductionOrThrow(getProdIdOrThrow(req));
      const prodId = String(prod._id);

      const memberId = req.params.id;
      if (!isHex24(memberId)) return res.status(400).json({ error: 'Invalid member id' });

      const current = findMemberByAnyId(prod, memberId);
      if (!current || !current._id) return res.status(404).json({ error: 'Member not found' });

      if (isOwnerMember(prod, current)) {
        return res.status(403).json({ error: 'Owner cannot be modified' });
      }

      const updates = {};
      const { email, role, siteAuthorized, newPassword } = req.body || {};

      if (email !== undefined) {
        const emailLC = lc(email);
        if (!emailLC) return res.status(400).json({ error: 'email cannot be empty' });
        const dup = (prod.members || []).find(
          (m) => String(m._id) !== String(current._id) && lc(m?.email) === emailLC
        );
        if (dup) return res.status(409).json({ error: 'Another member already uses this email' });
        updates['members.$.email'] = emailLC;
      }

      if (role !== undefined) {
        const safe = assertRoleValid(role);
        if (!safe) return res.status(400).json({ error: 'Invalid role' });
        updates['members.$.role'] = safe;
      }

      if (siteAuthorized !== undefined) {
        updates['members.$.siteAuthorized'] = !!siteAuthorized;
      }

      if (newPassword) {
        if (String(newPassword).length < 8) {
          return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }
        updates['members.$.passwordHash'] = await bcrypt.hash(String(newPassword), 10);
      }

      if (!Object.keys(updates).length) {
        return res.json({ ok: true, unchanged: true });
      }

      await Production.updateOne(
        { _id: prodId, 'members._id': current._id },
        { $set: updates },
        { strict: false }
      );

      const fresh = await Production.findOne(
        { _id: prodId, 'members._id': current._id },
        { 'members.$': 1 }
      ).lean();
      const m = fresh?.members?.[0] || null;

      return res.json({
        ok: true,
        member: m
          ? {
              _id: m._id || null,
              user: m.user || null,
              email: m.email || '',
              role: m.role || 'user',
              siteAuthorized: !!m.siteAuthorized,
              addedAt: m.addedAt || null,
            }
          : null,
      });
    } catch (e) {
      const code = e.status || 500;
      if (code >= 500) console.error('[PATCH /tenant/admin/users/:id]', e);
      res.status(code).json({ error: e.message || 'Failed to update member' });
    }
  }
);

/* =========================================================================
   DELETE /tenant/admin/users/:id
   ========================================================================= */
router.delete(
  '/users/:id',
  async (req, res) => {
    try {
      const prod = req.production || await getProductionOrThrow(getProdIdOrThrow(req));
      const prodId = String(prod._id);

      const memberId = req.params.id;
      if (!isHex24(memberId)) return res.status(400).json({ error: 'Invalid member id' });

      const current = findMemberByAnyId(prod, memberId);
      if (!current || !current._id) return res.status(404).json({ error: 'Member not found' });

      if (isOwnerMember(prod, current)) {
        return res.status(403).json({ error: 'Owner cannot be deleted' });
      }

      await Production.updateOne(
        { _id: prodId },
        { $pull: { members: { _id: current._id } } }
      );

      if (current.user) {
        await User.updateOne({ _id: current.user }, { $pull: { productionIds: prodId } });
      }

      return res.json({ ok: true });
    } catch (e) {
      const code = e.status || 500;
      if (code >= 500) console.error('[DELETE /tenant/admin/users/:id]', e);
      res.status(code).json({ error: e.message || 'Failed to remove member' });
    }
  }
);

export default router;




