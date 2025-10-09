// src/routes/users.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();

// Helpers
function sanitizeUser(doc) {
  if (!doc) return null;
  const u = doc.toObject ? doc.toObject() : doc;
  delete u.passwordHash;
  delete u.resetToken;
  delete u.resetTokenExp;
  return u;
}

function escapeRegExp(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isObjectIdLike(s) {
  return typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);
}

// GET /api/users?q=&limit=...
// If you mount this router at '/tenant/users', the UI's `/tenant/users?q=...` will work as-is.
// NOTE: If non-admins should be allowed to search here, remove `requireRole('admin')`.
router.get('/', async (req, res, next) => {
  try {
    const qRaw   = (req.query.q || '').trim();
    const limit  = Math.min(Math.max(parseInt(req.query.limit || '200', 10) || 200, 1), 500);

    let filter = {};

    if (qRaw) {
      const rx = new RegExp(escapeRegExp(qRaw), 'i');
      const ors = [{ name: rx }, { email: rx }];

      // also allow direct lookup by _id if q looks like an ObjectId
      if (isObjectIdLike(qRaw)) {
        ors.push({ _id: new mongoose.Types.ObjectId(qRaw) });
      }

      filter = { $or: ors };
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('_id name email role siteAuthorized banned productionIds createdAt updatedAt')
      .lean();

    res.json(users);
  } catch (e) {
    next(e);
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('_id name email role siteAuthorized banned productionIds createdAt updatedAt');
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (e) { next(e); }
});

// PATCH /api/users/:id
router.patch('/:id', authRequired, async (req, res, next) => {
  try {
    const { role, siteAuthorized, banned, name, password } = req.body || {};
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });

    if (name !== undefined) user.name = String(name).trim();
    if (role !== undefined) user.role = String(role);
    if (typeof siteAuthorized === 'boolean') user.siteAuthorized = siteAuthorized;
    if (typeof banned === 'boolean') user.banned = banned;

    if (password !== undefined && String(password).trim()) {
      user.passwordHash = await bcrypt.hash(String(password).trim(), 10);
      user.mustChangePassword = false;
    }

    await user.save();
    res.json(sanitizeUser(user));
  } catch (e) { next(e); }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true, deleted: !!user });
  } catch (e) { next(e); }
});

// POST /api/users  (create or upsert by email)
router.post('/', async (req, res, next) => {
  try {
    const {
      email,
      name,
      role = 'user',
      siteAuthorized = false,
      banned = false,
      password, // optional
    } = req.body || {};

    if (!email) return res.status(400).json({ error: 'Email is required' });

    const emailLC = String(email).toLowerCase().trim();

    let user = await User.findOne({ email: emailLC });

    if (!user) {
      user = new User({
        email: emailLC,
        name: name ? String(name).trim() : undefined,
        role,
        siteAuthorized: !!siteAuthorized,
        banned: !!banned,
      });
      if (password && String(password).trim()) {
        user.passwordHash = await bcrypt.hash(String(password).trim(), 10);
      }
      await user.save();
    } else {
      // Update existing user
      if (name !== undefined) user.name = String(name).trim();
      if (role !== undefined) user.role = String(role);
      user.siteAuthorized = !!siteAuthorized;
      user.banned = !!banned;

      if (password && String(password).trim()) {
        user.passwordHash = await bcrypt.hash(String(password).trim(), 10);
        user.mustChangePassword = false;
      }
      await user.save();
    }

    res.status(201).json(sanitizeUser(user));
  } catch (e) { next(e); }
});

export default router;
