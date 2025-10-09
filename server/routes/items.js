// src/routes/items.js
import { Router } from 'express';
import mongoose from 'mongoose';
import Item from '../models/Item.js';
import { authRequired } from '../middleware/auth.js';
import { requireMembership } from '../middleware/requireMembership.js';
import { upload } from '../utils/uploader.js';

const router = Router();

const toObjectId = (v) =>
  v && mongoose.Types.ObjectId.isValid(String(v))
    ? new mongoose.Types.ObjectId(String(v))
    : null;

/* ----------------------------------------------------------------------------
 * CREATE  (multipart: fields + optional image/photos)
 * ---------------------------------------------------------------------------- */
router.post(
  '/',
  upload.fields([
    { name: 'image',  maxCount: 1 },  // single image
    { name: 'photos', maxCount: 10 }, // multiple photos
  ]),
  async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });

      const filesA = req.files?.image  || [];
      const filesB = req.files?.photos || [];
      const photos = [...filesA, ...filesB].map(f => `/uploads/${f.filename}`);

      // Optional refs
      const locId = req.body?.location;
      const location = locId ? toObjectId(locId) : null;

      const qtyRaw = req.body?.quantity;
      const quantity = qtyRaw != null && qtyRaw !== '' ? Number(qtyRaw) : 1;

      const item = await Item.create({
        productionId: req.headers['x-production-id'],     // tenant scope
        owner: req.user._id,
        name,
        description: String(req.body?.description || '').trim() || undefined,
        location: location,                 // may be null
        quantity: Number.isFinite(quantity) ? quantity : 1,
        photos,
      });

      await item.populate('location');
      res.status(201).json(item);
    } catch (err) {
      console.error('Create item error:', err);
      res.status(400).json({ error: err.message || 'Failed to create item' });
    }
  }
);

/* ----------------------------------------------------------------------------
 * LIST  (?q=&placeId=)
 * ---------------------------------------------------------------------------- */
router.get('/', async (req, res) => {
  try {
    const { q = '', placeId } = req.query;

    const filter = { productionId: req.headers['x-production-id'] };

    const term = String(q || '').trim();
    if (term) {
      // Regex fallback (works without a text index)
      filter.$or = [
        { name:        { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
      ];
    }

    if (placeId && mongoose.Types.ObjectId.isValid(String(placeId))) {
      filter.location = new mongoose.Types.ObjectId(String(placeId));
    }

    const items = await Item.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('location')
      .lean();

    res.json(items);
  } catch (err) {
    console.error('List items error:', err);
    res.status(500).json({ error: 'Failed to list items' });
  }
});

/* ----------------------------------------------------------------------------
 * READ
 * ---------------------------------------------------------------------------- */
router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findOne({
      _id: req.params.id,
      productionId: req.headers['x-production-id'],
    }).populate('location');

    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

/* ----------------------------------------------------------------------------
 * UPDATE (JSON body)
 * ---------------------------------------------------------------------------- */
router.patch('/:id', async (req, res) => {
  try {
    const upd = {};
    if (req.body.name !== undefined) {
      const nm = String(req.body.name).trim();
      if (!nm) return res.status(400).json({ error: 'name cannot be empty' });
      upd.name = nm;
    }
    if (req.body.description !== undefined) upd.description = String(req.body.description || '').trim();

    if (req.body.location !== undefined) {
      const locId = req.body.location;
      upd.location = locId ? toObjectId(locId) : null;
    }

    if (req.body.quantity !== undefined) {
      const qn = Number(req.body.quantity);
      if (!Number.isFinite(qn)) return res.status(400).json({ error: 'quantity must be a number' });
      upd.quantity = qn;
    }

    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, productionId: req.headers['x-production-id'] },
      { $set: upd },
      { new: true }
    ).populate('location');

    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    console.error('Update item error:', err);
    res.status(400).json({ error: err.message || 'Failed to update item' });
  }
});

/* ----------------------------------------------------------------------------
 * DELETE
 * ---------------------------------------------------------------------------- */
router.delete('/:id',  async (req, res) => {
  try {
    const deleted = await Item.findOneAndDelete({
      _id: req.params.id,
      productionId: req.headers['x-production-id'],
    });
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

/* ----------------------------------------------------------------------------
 * ADD PHOTOS (multipart)
 * ---------------------------------------------------------------------------- */
router.post(
  '/:id/photos',
  upload.array('photos', 6),
  async (req, res) => {
    try {
      const item = await Item.findOne({
        _id: req.params.id,
        productionId: req.headers['x-production-id'],
      });
      if (!item) return res.status(404).json({ error: 'Not found' });

      const urls = (req.files || []).map(f => `/uploads/${f.filename}`);
      if (!urls.length) return res.json(item);

      if (!Array.isArray(item.photos)) item.photos = [];
      item.photos.push(...urls);
      await item.save();

      await item.populate('location');
      res.json(item);
    } catch (err) {
      console.error('Add photos error:', err);
      res.status(400).json({ error: err.message || 'Failed to add photos' });
    }
  }
);

/* ----------------------------------------------------------------------------
 * REMOVE PHOTO
 * ---------------------------------------------------------------------------- */
router.delete('/:id/photos', async (req, res) => {
  try {
    const { url } = req.body || {};
    const item = await Item.findOne({
      _id: req.params.id,
      productionId: req.headers['x-production-id'],
    });
    if (!item) return res.status(404).json({ error: 'Not found' });

    item.photos = (item.photos || []).filter(p => p !== url);
    await item.save();

    await item.populate('location');
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to remove photo' });
  }
});

export default router;
