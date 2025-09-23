// server/routes/adminUsers.js
import { Router } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Production from '../models/Production.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { requireMembership } from '../middleware/requireMembership.js';
import mailer from '../utils/mailer.js';

const router = Router();
const CLIENT_BASE = process.env.CLIENT_URL || 'http://localhost:5173';

const allowedRoles = new Set(['admin', 'coordinator', 'driver', 'user']);

function getProdIdOrThrow(req) {
  const v = String(req.headers['x-production-id'] || '').trim();
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

async function getProductionOrThrow(prodId) {
  const prod = await Production.findById(prodId)
    .select('_id name slug owner ownerUserId members')
    .lean();
  if (!prod) {
    const err = new Error(`Unknown production id: ${prodId}`);
    err.status = 400;
    throw err;
  }
  return prod;
}

function toId(v) {
  if (!v) return '';
  if (typeof v === 'string') return mongoose.isValidObjectId(v) ? v : '';
  try { const s = v?.toString?.(); return mongoose.isValidObjectId(s) ? s : ''; } catch { return ''; }
}

function isOwnerOrAdminOf(prod, userId) {
  const me = toId(userId);
  if (!me || !prod) return false;
  const owner = toId(prod.ownerUserId || prod.owner);
  if (owner && owner === me) return true;
  return (prod.members || []).some(m => toId(m?.user) === me && String(m?.role).toLowerCase() === 'admin');
}

async function assertAdminForProduction(req, prodId) {
  const prod = await getProductionOrThrow(prodId);
  if (!isOwnerOrAdminOf(prod, req.user?._id)) {
    const err = new Error('Not authorized for this production');
    err.status = 403;
    throw err;
  }
  return prod;
}

/* =========================================================================
   GET /tenant/admin/users
   Returns ONLY members of this production (role from Production.members).
   Supports ?q= for name/email filtering.
   ========================================================================= */
router.get(
  '/users',
  authRequired,
  requireMembership,
  async (req, res, next) => {
    try {
      const prodId = getProdIdOrThrow(req);
      const prod = await assertAdminForProduction(req, prodId);

      const { q } = req.query || {};
      const memberDocs = Array.isArray(prod.members) ? prod.members : [];
      const memberIds = memberDocs.map(m => m?.user).filter(Boolean);
      if (!memberIds.length) return res.json([]);

      const users = await User.find({ _id: { $in: memberIds } })
        .select('_id email name provider oauthProvider siteAuthorized banned createdAt updatedAt photo productionIds')
        .lean();

      const roleMap = new Map(memberDocs.map(m => [String(m.user), m.role]));
      let out = users.map(u => ({ ...u, role: roleMap.get(String(u._id)) || 'user' }));

      if (q && String(q).trim()) {
        const needle = String(q).trim().toLowerCase();
        out = out.filter(u => (u.name || '').toLowerCase().includes(needle) || (u.email || '').toLowerCase().includes(needle));
      }

      out.sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
      res.json(out);
    } catch (e) {
      const code = e.status || 500;
      if (code >= 500) console.error('[GET /tenant/admin/users]', e);
      res.status(code).json({ error: e.message || 'Failed to list users' });
    }
  }
);

/* =========================================================================
   POST /tenant/admin/users
   Upsert user + ensure membership (role), set flags, issue reset token, email.
   Body: { email, firstName?, lastName?, name?, username?, role?, siteAuthorized?, banned? }
   ========================================================================= */
router.post(
  '/users',
  authRequired,
  requireMembership,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const prodId = getProdIdOrThrow(req);
      const prod = await assertAdminForProduction(req, prodId);

      const {
        email,
        firstName,
        lastName,
        name,
        username,
        role = 'user',
        siteAuthorized,
        banned,
      } = req.body || {};

      if (!email) return res.status(400).json({ error: 'Email is required' });

      const emailLC = String(email).toLowerCase().trim();
      const displayName =
        (name && String(name).trim()) ||
        [firstName, lastName].filter(Boolean).join(' ').trim() ||
        undefined;

      const roleSafe = allowedRoles.has(String(role)) ? String(role) : 'user';

      // Upsert user
      let user = await User.findOne({ email: emailLC });
      if (!user) {
        user = new User({
          provider: 'local',
          email: emailLC,
          name: displayName,
          username: username ? String(username).toLowerCase().trim() : undefined,
          mustChangePassword: true,
          verified: false,
        });
      } else {
        if (displayName !== undefined) user.name = displayName;
        if (username !== undefined) {
          const u = String(username || '').trim();
          if (u) user.username = u.toLowerCase();
        }
        if (!user.passwordHash) user.mustChangePassword = true;
      }

      if (siteAuthorized !== undefined) user.siteAuthorized = !!siteAuthorized;
      if (banned !== undefined) user.banned = !!banned;

      // Ensure user.productionIds contains prodId
      const set = new Set([...(user.productionIds || []).map(String), String(prodId)]);
      user.productionIds = Array.from(set);

      // Ensure membership exists with the right role
      const matched = await Production.updateOne(
        { _id: prodId, 'members.user': user._id },
        { $set: { 'members.$.role': roleSafe } }
      );
      if (matched.matchedCount === 0) {
        await Production.updateOne(
          { _id: prodId, 'members.user': { $ne: user._id } },
          { $addToSet: { members: { user: user._id, role: roleSafe } } }
        );
      }

      // Issue one-time reset token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      user.resetTokenHash = tokenHash;
      user.resetExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await user.save();

      const link = `${CLIENT_BASE}/set-password?token=${encodeURIComponent(rawToken)}`;

      try {
        await mailer.sendMail({
          to: user.email,
          from: process.env.MAIL_FROM || process.env.MAIL_USER,
          subject: 'You have been invited to Set-Dec Runner',
          text: `Hi ${displayName || ''},

You've been granted access to ${prod.name || 'Set-Dec Runner'}.
Click the link below to set your password:
${link}

This link expires in 24 hours.`,
          html: `
            <div style="font-family:Arial,sans-serif">
              <p>Hi ${displayName || ''},</p>
              <p>You've been granted access to <b>${prod.name || 'Set-Dec Runner'}</b>.</p>
              <p><a href="${link}" style="background:#111;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">Set your password</a></p>
              <p>If the button doesn't work, copy & paste this link:<br>${link}</p>
              <p>This link expires in 24 hours.</p>
            </div>
          `,
        });
      } catch (mailErr) {
        console.error('[adminUsers] Email send failed:', mailErr);
        console.warn('[adminUsers] Invite link (copy manually):', link);
      }

      res.json({ ok: true, userId: user._id, productionId: String(prodId) });
    } catch (e) {
      const code = e.status || 500;
      if (code >= 500) console.error('[POST /tenant/admin/users]', e);
      res.status(code).json({ error: e.message || 'Failed to create user' });
    }
  }
);

/* =========================================================================
   PATCH /tenant/admin/users/:id
   Update user flags and/or the member role for THIS production.
   ========================================================================= */
router.patch(
  '/users/:id',
  authRequired,
  requireMembership,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const prodId = getProdIdOrThrow(req);
      await assertAdminForProduction(req, prodId);

      const userId = req.params.id;
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ error: 'Invalid user id' });
      }

      const target = await User.findById(userId);
      if (!target) return res.status(404).json({ error: 'User not found' });

      const body = req.body || {};
      const uUpdate = {};
      const wantsRole = body.role !== undefined;

      if (body.siteAuthorized !== undefined) uUpdate.siteAuthorized = !!body.siteAuthorized;
      if (body.banned !== undefined) uUpdate.banned = !!body.banned;
      if (Object.keys(uUpdate).length) {
        await User.updateOne({ _id: target._id }, { $set: uUpdate });
      }

      if (wantsRole) {
        const newRole = String(body.role).toLowerCase();
        if (!allowedRoles.has(newRole)) {
          return res.status(400).json({ error: 'Invalid role' });
        }
        // Update if exists; otherwise add membership + ensure user.productionIds
        const upd = await Production.updateOne(
          { _id: prodId, 'members.user': target._id },
          { $set: { 'members.$.role': newRole } }
        );
        if (upd.matchedCount === 0) {
          await Production.updateOne(
            { _id: prodId, 'members.user': { $ne: target._id } },
            { $addToSet: { members: { user: target._id, role: newRole } } }
          );
          await User.updateOne(
            { _id: target._id },
            { $addToSet: { productionIds: prodId } }
          );
        }
      }

      const freshUser = await User.findById(target._id)
        .select('_id email name provider oauthProvider siteAuthorized banned createdAt updatedAt photo productionIds')
        .lean();
      const refreshedProd = await Production.findOne(
        { _id: prodId, 'members.user': target._id },
        { 'members.$': 1 }
      ).lean();

      const role = refreshedProd?.members?.[0]?.role || 'user';
      res.json({ ...freshUser, role });
    } catch (e) {
      const code = e.status || 500;
      if (code >= 500) console.error('[PATCH /tenant/admin/users/:id]', e);
      res.status(code).json({ error: e.message || 'Failed to update user' });
    }
  }
);

/* =========================================================================
   DELETE /tenant/admin/users/:id
   Remove membership from THIS production and pull prodId from user.productionIds.
   ========================================================================= */
router.delete(
  '/users/:id',
  authRequired,
  requireMembership,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const prodId = getProdIdOrThrow(req);
      await assertAdminForProduction(req, prodId);

      const userId = req.params.id;
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ error: 'Invalid user id' });
      }

      const target = await User.findById(userId);
      if (!target) return res.status(404).json({ error: 'User not found' });

      await Production.updateOne(
        { _id: prodId },
        { $pull: { members: { user: target._id } } }
      );
      await User.updateOne(
        { _id: target._id },
        { $pull: { productionIds: prodId } }
      );

      res.json({ ok: true });
    } catch (e) {
      const code = e.status || 500;
      if (code >= 500) console.error('[DELETE /tenant/admin/users/:id]', e);
      res.status(code).json({ error: e.message || 'Failed to remove user' });
    }
  }
);

export default router;
