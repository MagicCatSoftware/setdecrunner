import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import Place from '../models/Place.js';
import { authRequired } from '../middleware/auth.js';
import { requireMembership } from '../middleware/requireMembership.js';
import { makeUploader } from '../utils/uploader.js';

const router = Router();
const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

/* ----------------------------- Helpers ----------------------------- */
const toNumberOrNull = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

function sanitizeCreatePayload(body) {
  const payload = { ...body };
  if (
    !payload.googlePlaceId ||
    typeof payload.googlePlaceId !== 'string' ||
    !payload.googlePlaceId.trim()
  ) {
    delete payload.googlePlaceId;
  }
  return payload;
}

function sanitizePatchPayload(body = {}) {
  const b = { ...body };
  const update = { $set: {}, $unset: {} };

  const setIfDefined = (k, v) => {
    if (typeof v !== 'undefined') update.$set[k] = v;
  };

  setIfDefined('name', b.name);
  setIfDefined('address', b.address);
  setIfDefined('phone', b.phone);
  setIfDefined('website', b.website);
  setIfDefined('notes', b.notes);

  if ('lat' in b) update.$set.lat = toNumberOrNull(b.lat);
  if ('lng' in b) update.$set.lng = toNumberOrNull(b.lng);

  if ('googlePlaceId' in b) {
    if (b.googlePlaceId) update.$set.googlePlaceId = String(b.googlePlaceId);
    else update.$unset.googlePlaceId = '';
  }

  if ('photos' in b) {
    update.$set.photos = Array.isArray(b.photos) ? b.photos : [];
  }

  if (!Object.keys(update.$set).length) delete update.$set;
  if (!Object.keys(update.$unset).length) delete update.$unset;

  return update;
}

/* All endpoints require auth + tenant membership */


/* ------------------------------- CREATE ------------------------------- */
router.post('/', async (req, res) => {
  try {
    const payload = sanitizeCreatePayload(req.body);
    const p = await Place.create({
      ...payload,
      productionId: req.headers['x-production-id'],
      createdBy: req.user._id,
    });
    res.status(201).json(p);
  } catch (err) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ error: 'Place already exists with this googlePlaceId' });
    }
    res
      .status(500)
      .json({ error: 'Failed to create place', detail: err.message });
  }
});

/* -------------------------------- LIST -------------------------------- */
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const filter = {
      productionId: req.headers['x-production-id'],
      ...(q
        ? {
            $or: [
              { name: { $regex: q, $options: 'i' } },
              { address: { $regex: q, $options: 'i' } },
            ],
          }
        : {}),
    };
    const places = await Place.find(filter)
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(places);
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to list places', detail: err.message });
  }
});

/* -------------------------------- READ -------------------------------- */
router.get('/:id', async (req, res) => {
  try {
    const p = await Place.findOne({
      _id: req.params.id,
      productionId: req.headers['x-production-id'],
    });
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to fetch place', detail: err.message });
  }
});

/* ------------------------------- UPDATE ------------------------------- */
router.patch('/:id', async (req, res) => {
  try {
    const update = sanitizePatchPayload(req.body);
    const p = await Place.findOneAndUpdate(
      { _id: req.params.id, productionId: req.headers['x-production-id'] },
      update,
      { new: true, runValidators: true }
    );
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Duplicate googlePlaceId' });
    }
    res
      .status(500)
      .json({ error: 'Failed to update place', detail: err.message });
  }
});

/* ------------------------------- DELETE ------------------------------- */
router.delete('/:id', async (req, res) => {
  try {
    const result = await Place.deleteOne({
      _id: req.params.id,
      productionId: req.headers['x-production-id'],
    });
    if (!result.deletedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to delete place', detail: err.message });
  }
});

/* ------------------------------ ADD PHOTOS ---------------------------- */
router.post(
  '/:id/photos',
  makeUploader((req) => path.join('places', req.params.id)).array('photos', 6),
  async (req, res) => {
    try {
      const p = await Place.findOne({
        _id: req.params.id,
        productionId: req.headers['x-production-id'],
      });
      if (!p) return res.status(404).json({ error: 'Not found' });

      const urls = (req.files || []).map((f) => {
        const rel = path.relative(path.resolve(process.cwd(), 'uploads'), f.path);
        return '/uploads/' + rel.replace(/\\/g, '/');
      });

      if (urls.length) {
        if (!Array.isArray(p.photos)) p.photos = [];
        p.photos.push(...urls);
        await p.save();
      }

      res.json(p);
    } catch (err) {
      res
        .status(500)
        .json({ error: 'Failed to add photos', detail: err.message });
    }
  }
);

/* ---------------------------- REMOVE PHOTO ---------------------------- */
router.delete('/:id/photos', async (req, res) => {
  try {
    const { url } = req.body || {};
    const p = await Place.findOne({
      _id: req.params.id,
      productionId: req.headers['x-production-id'],
    });
    if (!p) return res.status(404).json({ error: 'Not found' });

    p.photos = (p.photos || []).filter((ph) => ph !== url);

    if (url?.startsWith('/uploads/')) {
      const abs = path.join(process.cwd(), url.replace('/uploads/', 'uploads/'));
      try {
        await fs.unlink(abs);
      } catch {}
    }

    await p.save();
    res.json(p);
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to remove photo', detail: err.message });
  }
});

export default router;


