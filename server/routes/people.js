// src/routes/people.js
import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';

import Person from '../models/People.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { requireMembership } from '../middleware/requireMembership.js';

const router = express.Router();

const objectId = (id) =>
  (id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null);

// ---------------------------- Upload utils ---------------------------------
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
await fs.mkdir(UPLOAD_ROOT, { recursive: true });

function setUploadDest(fn) {
  return async (req, _res, next) => {
    try {
      const picked = await Promise.resolve(fn(req));
      const abs = path.resolve(picked);
      const rel = path.relative(UPLOAD_ROOT, abs);
      if (rel.startsWith('..')) {
        const err = new Error('Upload destination must be inside UPLOAD_ROOT');
        err.status = 400;
        throw err;
      }
      req.uploadDest = abs;
      await fs.mkdir(abs, { recursive: true }); // ensure /people/:id exists
      next();
    } catch (e) { next(e); }
  };
}

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const dest = req.uploadDest || UPLOAD_ROOT;
      await fs.mkdir(dest, { recursive: true });
      cb(null, dest);
    } catch (e) {
      cb(e);
    }
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '').toLowerCase();
    const base = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    cb(null, base + ext);
  },
});
const upload = multer({ storage });

const toPublicPath = (absOrFile) => {
  const abs = typeof absOrFile === 'string'
    ? path.resolve(absOrFile)
    : path.resolve(absOrFile?.path || '');

  const rel = path.relative(UPLOAD_ROOT, abs).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.startsWith('..')) {
    throw new Error('Path escapes UPLOAD_ROOT');
  }
  return '/uploads/' + rel;
};

const unlinkIfExists = async (abs) => {
  try { await fs.unlink(abs); } catch { /* ignore */ }
};

// ---------------------------- Middleware -----------------------------------
// Auth + tenant membership. requireMembership should:
//  - verify the user belongs to the current production
//  - set req.headers['x-production-id'] to that production’s ObjectId


// ---------------------------- List -----------------------------------------
/**
 * GET /people?q=...&limit=...
 * Tenant-scoped.
 */
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);

    const filter = {
      productionId: req.headers['x-production-id'],
      ...(q
        ? {
            $or: [
              { name:  { $regex: q, $options: 'i' } },
              { email: { $regex: q, $options: 'i' } },
              { phone: { $regex: q, $options: 'i' } },
            ],
          }
        : {})
    };

    const list = await Person.find(filter)
      .sort({ name: 1 })
      .limit(limit)
      .populate('user', 'name email role photo')
      .lean();

    res.json(list);
  } catch (e) { next(e); }
});

// ---------------------------- Create ---------------------------------------
/**
 * POST /people
 * Tenant-scoped create.
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      name = '',
      email = '',
      phone = '',
      user = null,
      notes = '',
      role = '',
      photo = null
    } = req.body || {};

    if (!name && !email) {
      return res.status(400).json({ error: 'Name or email is required' });
    }

    const userId = user
      ? (typeof user === 'string' ? objectId(user) : objectId(user?._id || user?.id))
      : null;

    const created = await Person.create({
      productionId: req.headers['x-production-id'],
      createdBy: req.user._id,
      name,
      email,
      phone,
      user: userId,
      notes,
      role,
      photo: photo || null,
    });

    const full = await Person.findById(created._id)
      .populate('user', 'name email role photo')
      .lean();

    res.status(201).json(full);
  } catch (e) { next(e); }
});

// ---------------------------- Read -----------------------------------------
/**
 * GET /people/:id
 * Tenant-scoped read.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const p = await Person.findOne({ _id: req.params.id, productionId: req.headers['x-production-id'] })
      .populate('user', 'name email role photo')
      .lean();
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  } catch (e) { next(e); }
});

// ---------------------------- Update ---------------------------------------
/**
 * PATCH /people/:id
 * Tenant-scoped update.
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, email, phone, user, notes, role, photo } = req.body || {};
    const update = {};

    if (name !== undefined)  update.name  = name;
    if (email !== undefined) update.email = email;
    if (phone !== undefined) update.phone = phone;
    if (notes !== undefined) update.notes = notes;
    if (role !== undefined)  update.role  = role;
    if (photo !== undefined) update.photo = photo;

    if (user !== undefined) {
      const userId = user ? (typeof user === 'string' ? objectId(user) : objectId(user?._id || user?.id)) : null;
      update.user = userId;
    }

    const found = await Person.findOneAndUpdate(
      { _id: req.params.id, productionId: req.headers['x-production-id'] },
      { $set: update },
      { new: true }
    )
      .populate('user', 'name email role photo')
      .lean();

    if (!found) return res.status(404).json({ error: 'Not found' });
    res.json(found);
  } catch (e) { next(e); }
});

// ---------------------------- Delete ---------------------------------------
/**
 * DELETE /people/:id
 * Admin only. Tenant-scoped delete.
 */
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const existed = await Person.findOne({ _id: req.params.id, productionId: req.headers['x-production-id'] }).select('_id photo');
    if (!existed) return res.status(404).json({ error: 'Not found' });

    // cleanup local photo if stored under /uploads
    if (existed.photo?.startsWith('/uploads/')) {
      const abs = path.join(process.cwd(), existed.photo.replace('/uploads/', 'uploads/'));
      await unlinkIfExists(abs);
    }

    await Person.deleteOne({ _id: existed._id, productionId: req.headers['x-production-id'] });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------- Photo upload ---------------------------------
/**
 * POST /people/:id/photo
 * Body: multipart/form-data; field "photo"
 * Tenant-scoped.
 */
router.post(
  '/:id/photo',
  setUploadDest(async (req) => path.join(UPLOAD_ROOT, 'people', req.params.id)),
  upload.single('photo'),
  async (req, res, next) => {
    try {
      const person = await Person.findOne({ _id: req.params.id, productionId: req.headers['x-production-id'] });
      if (!person) return res.status(404).json({ error: 'Not found' });
      if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

      // remove previous local photo (if any)
      if (person.photo?.startsWith('/uploads/')) {
        const prevAbs = path.join(process.cwd(), person.photo.replace('/uploads/', 'uploads/'));
        await unlinkIfExists(prevAbs);
      }

      const publicPath = toPublicPath(path.join(req.uploadDest, req.file.filename));
      person.photo = publicPath;
      await person.save();

      const full = await Person.findById(person._id)
        .populate('user', 'name email role photo')
        .lean();
      res.json(full);
    } catch (e) { next(e); }
  }
);

/**
 * DELETE /people/:id/photo
 * Clears photo and removes local file if under /uploads.
 * Tenant-scoped.
 */
router.delete('/:id/photo', async (req, res, next) => {
  try {
    const person = await Person.findOne({ _id: req.params.id, productionId: req.headers['x-production-id'] });
    if (!person) return res.status(404).json({ error: 'Not found' });

    if (person.photo?.startsWith('/uploads/')) {
      const abs = path.join(process.cwd(), person.photo.replace('/uploads/', 'uploads/'));
      await unlinkIfExists(abs);
    }

    person.photo = null;
    await person.save();

    const full = await Person.findById(person._id)
      .populate('user', 'name email role photo')
      .lean();
    res.json(full);
  } catch (e) { next(e); }
});

export default router;
