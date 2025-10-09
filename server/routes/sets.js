// src/routes/sets.js
import express from 'express';
import Set from '../models/Set.js';
import { authRequired } from '../middleware/auth.js';
import { requireMembership } from '../middleware/requireMembership.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// All routes require auth + membership (tenant scope via req.productionId)


// GET /sets?q=...&limit=...
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);

    const filter = { productionId: req.headers['x-production-id'] };
    if (q) {
      filter.$or = [
        { name:   { $regex: q, $options: 'i' } },
        { number: { $regex: q, $options: 'i' } },
      ];
    }

    const sets = await Set.find(filter)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    res.json(sets);
  } catch (e) { next(e); }
});

// POST /sets
router.post('/', async (req, res, next) => {
  try {
    const { name = 'Untitled Set', number, description = '' } = req.body || {};
    const setNumber = (number ?? '').toString().trim();
    if (!setNumber) return res.status(400).json({ error: 'number is required' });

    const s = await Set.create({
      productionId: req.headers['x-production-id'],
      createdBy: req.user._id,
      name: String(name || '').trim() || 'Untitled Set',
      number: setNumber,
      description: String(description || '').trim(),
    });

    res.status(201).json(s);
  } catch (e) {
    if (e?.code === 11000) {
      // Expect a unique index like { productionId: 1, number: 1 }
      return res.status(400).json({ error: 'Set number must be unique within this production' });
    }
    next(e);
  }
});

// GET /sets/:id
router.get('/:id', async (req, res, next) => {
  try {
    const s = await Set.findOne({ _id: req.params.id, productionId: req.headers['x-production-id'] }).lean();
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (e) { next(e); }
});

// PATCH /sets/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, number, description } = req.body || {};
    const update = {};

    if (name !== undefined)        update.name = String(name || '').trim();
    if (number !== undefined)      update.number = String(number || '').trim();
    if (description !== undefined) update.description = String(description || '').trim();

    if (update.number === '') return res.status(400).json({ error: 'number cannot be empty' });

    const s = await Set.findOneAndUpdate(
      { _id: req.params.id, productionId: req.headers['x-production-id'] },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(400).json({ error: 'Set number must be unique within this production' });
    }
    next(e);
  }
});

// DELETE /sets/:id (admin only)
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const s = await Set.findOneAndDelete({ _id: req.params.id, productionId: req.headers['x-production-id'] });
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
