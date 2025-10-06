// server/routes/owner.js
import { Router } from 'express';
import mongoose from 'mongoose';
import Production from '../models/Production.js';
import User from '../models/User.js';
import { authRequired } from '../middleware/auth.js'; // your existing auth middleware

const router = Router();
router.use(authRequired);

// ------------------------------
// Helpers
// ------------------------------
function isValidId(id) {
  return mongoose.isValidObjectId(String(id));
}
function isOwnerOrAdmin(prod, userId) {
  const uid = String(userId || '');
  if (!uid || !prod) return false;
  if (String(prod.ownerUserId || '') === uid) return true;
  return (prod.members || []).some(m => String(m.user) === uid && m.role === 'admin');
}
async function loadOwnedProduction(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid production id' });

    const prod = await Production.findById(id);
    if (!prod) return res.status(404).json({ error: 'Production not found' });

    if (!isOwnerOrAdmin(prod, req.user?._id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    req.production = prod;
    next();
  } catch (e) {
    next(e);
  }
}
function normalizeEmail(s) {
  return String(s || '').trim().toLowerCase();
}
function roleIsValid(role) {
  return ['admin', 'editor', 'viewer'].includes(role);
}

// ------------------------------
// List my productions (owner OR admin member)
// Mounted at: /api/owner/productions
// GET /
// ------------------------------
router.get('/', async (req, res, next) => {
  try {
    const uid = req.user._id;
    const items = await Production.find({
      $or: [
        { ownerUserId: uid },
        { members: { $elemMatch: { user: uid, role: 'admin' } } },
      ],
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.json(items);
  } catch (e) {
    next(e);
  }
});

// ------------------------------
// Read one (owner OR admin member)
// GET /:id
// ------------------------------
router.get('/:id', loadOwnedProduction, async (req, res, next) => {
  try {
    res.json(req.production);
  } catch (e) {
    next(e);
  }
});

// ------------------------------
// Update basic fields (owner OR admin member)
// PATCH /:id
// ------------------------------
router.patch('/:id', loadOwnedProduction, async (req, res, next) => {
  try {
    const p = req.production;
    const allowed = [
      'title',
      'slug',
      'productioncompany',
      'productionphone',
      'productionaddress',
      'isActive',
    ];
    for (const k of allowed) if (k in req.body) p[k] = req.body[k];
    await p.save();
    res.json(p);
  } catch (e) {
    next(e);
  }
});

// ------------------------------
// Delete (owner OR admin member)
// DELETE /:id
// ------------------------------
router.delete('/:id', loadOwnedProduction, async (req, res, next) => {
  try {
    await req.production.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ======================================================================
// Members Management (owner OR admin member)
// Base: /:id/members
// ======================================================================

// GET members
// GET /:id/members
router.get('/:id/members', loadOwnedProduction, async (req, res, next) => {
  try {
    const prod = await Production.findById(req.production._id)
      .populate('members.user', 'name email')
      .lean();

    const members = (prod.members || []).map(m => ({
      userId: String(m.user?._id || m.user),
      name: m.user?.name || '',
      email: m.user?.email || '',
      role: m.role,
      addedAt: m.addedAt || null,
    }));

    res.json({ members });
  } catch (e) {
    next(e);
  }
});

// Add or upsert member by email or userId
// POST /:id/members
// body: { email?: string, userId?: string, role: 'admin'|'editor'|'viewer' }
router.post('/:id/members', loadOwnedProduction, async (req, res, next) => {
  try {
    let { email, userId, role } = req.body || {};
    role = String(role || '').trim();
    if (!roleIsValid(role)) return res.status(400).json({ error: 'Invalid role' });

    let userDoc = null;

    if (userId) {
      if (!isValidId(userId)) return res.status(400).json({ error: 'Invalid userId' });
      userDoc = await User.findById(userId);
      if (!userDoc) return res.status(404).json({ error: 'User not found' });
    } else {
      const e = normalizeEmail(email);
      if (!e) return res.status(400).json({ error: 'Email required' });

      userDoc = await User.findOne({ email: e });
      // Optional: create a placeholder user so you can invite later
      if (!userDoc) {
        userDoc = await User.create({ email: e, name: e.split('@')[0] });
        // TODO: send invite email if you have a mailer
      }
    }

    const prod = req.production;
    const exists = (prod.members || []).some(m => String(m.user) === String(userDoc._id));

    if (exists) {
      // update role
      await Production.updateOne(
        { _id: prod._id, 'members.user': userDoc._id },
        { $set: { 'members.$.role': role } }
      );
    } else {
      // add new member
      await Production.updateOne(
        { _id: prod._id },
        { $push: { members: { user: userDoc._id, role } } }
      );
    }

    const updated = await Production.findById(prod._id)
      .populate('members.user', 'name email')
      .lean();

    const members = (updated.members || []).map(m => ({
      userId: String(m.user?._id || m.user),
      name: m.user?.name || '',
      email: m.user?.email || '',
      role: m.role,
      addedAt: m.addedAt || null,
    }));

    res.json({ members });
  } catch (e) {
    next(e);
  }
});

// Change role
// PATCH /:id/members/:userId
// body: { role }
router.patch('/:id/members/:userId', loadOwnedProduction, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body || {};

    if (!isValidId(userId)) return res.status(400).json({ error: 'Invalid userId' });
    if (!roleIsValid(role)) return res.status(400).json({ error: 'Invalid role' });

    await Production.updateOne(
      { _id: req.production._id, 'members.user': userId },
      { $set: { 'members.$.role': role } }
    );

    const updated = await Production.findById(req.production._id)
      .populate('members.user', 'name email')
      .lean();

    const members = (updated.members || []).map(m => ({
      userId: String(m.user?._id || m.user),
      name: m.user?.name || '',
      email: m.user?.email || '',
      role: m.role,
      addedAt: m.addedAt || null,
    }));

    res.json({ members });
  } catch (e) {
    next(e);
  }
});

// Remove member
// DELETE /:id/members/:userId
router.delete('/:id/members/:userId', loadOwnedProduction, async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) return res.status(400).json({ error: 'Invalid userId' });

    await Production.updateOne(
      { _id: req.production._id },
      { $pull: { members: { user: new mongoose.Types.ObjectId(userId) } } }
    );

    const updated = await Production.findById(req.production._id)
      .populate('members.user', 'name email')
      .lean();

    const members = (updated.members || []).map(m => ({
      userId: String(m.user?._id || m.user),
      name: m.user?.name || '',
      email: m.user?.email || '',
      role: m.role,
      addedAt: m.addedAt || null,
    }));

    res.json({ members });
  } catch (e) {
    next(e);
  }
});

export default router;

