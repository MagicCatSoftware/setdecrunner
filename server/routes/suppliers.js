// src/routes/suppliers.js
import express from 'express';
import Supplier from '../models/Supplier.js';
import { authRequired, requireSiteAuthorized, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All routes require auth + tenant/production authorization
//router.use(authRequired);

// Helpers
const toNumberOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function buildFindQuery(qString) {
  const q = (qString || '').trim();
  if (!q) return {};
  return {
    $or: [
      { name:        { $regex: q, $options: 'i' } },
      { address:     { $regex: q, $options: 'i' } },
      { contactName: { $regex: q, $options: 'i' } },
      { phone:       { $regex: q, $options: 'i' } },
    ],
  };
}

// Normalize incoming location into { lat, lng } or null
function coerceLocation(input) {
  if (!input) return null;

  // GeoJSON { type:'Point', coordinates:[lng,lat] } (or nested in .geo)
  if (input.type === 'Point' && Array.isArray(input.coordinates) && input.coordinates.length >= 2) {
    const [lng, lat] = input.coordinates;
    return {
      lat: toNumberOrNull(lat),
      lng: toNumberOrNull(lng),
    };
  }
  if (input.geo?.type === 'Point' && Array.isArray(input.geo.coordinates) && input.geo.coordinates.length >= 2) {
    const [lng, lat] = input.geo.coordinates;
    return {
      lat: toNumberOrNull(lat),
      lng: toNumberOrNull(lng),
    };
  }

  // Plain fields
  const lat =
    toNumberOrNull(input.lat ?? input.latitude ?? input.coords?.lat ?? input.location?.lat);
  const lng =
    toNumberOrNull(input.lng ?? input.longitude ?? input.coords?.lng ?? input.location?.lng);

  if (lat === null || lng === null) return null;
  return { lat, lng };
}

// ----------------------------- List / Create -------------------------------
router.get('/', async (req, res, next) => {
  
  try {
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
    const textQuery = buildFindQuery(req.query.q);

    const query = {
      productionId: req.headers['x-production-id'],
      ...textQuery,
    };

    const list = await Supplier.find(query)
      .sort({ updatedAt: -1 })
      .select('name address location phone contactName hours createdAt updatedAt')
      .limit(limit)
      .lean();

    res.json(list);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, address, phone, contactName, hours, location } = req.body || {};
    const nameStr = String(name || '').trim();
    if (!nameStr) return res.status(400).json({ error: 'name is required' });

    const doc = await Supplier.create({
      productionId: req.headers['x-production-id'],
      createdBy: req.user._id,
      name: nameStr,
      address: String(address || '').trim(),
      phone: String(phone || '').trim() || undefined,
      contactName: String(contactName || '').trim() || undefined,
      hours: String(hours || '').trim() || undefined,
      location: coerceLocation(location),
    });

    res.status(201).json(await Supplier.findById(doc._id).lean());
  } catch (e) { next(e); }
});

// ----------------------------- Read / Update / Delete ----------------------
router.get('/:id', async (req, res, next) => {
  try {
    const s = await Supplier.findOne({
      _id: req.params.id,
      productionId: req.headers['x-production-id'],
    }).lean();

    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { name, address, phone, contactName, hours, location } = req.body || {};
    const $set = {};
    const $unset = {};

    if (name !== undefined)        $set.name        = String(name || '').trim();
    if (address !== undefined)     $set.address     = String(address || '').trim();
    if (phone !== undefined)       $set.phone       = String(phone || '').trim();
    if (contactName !== undefined) $set.contactName = String(contactName || '').trim();
    if (hours !== undefined)       $set.hours       = String(hours || '').trim();

    if (location !== undefined) {
      const loc = coerceLocation(location);
      if (loc) $set.location = loc;
      else $unset.location = '';
    }

    const ops = {};
    if (Object.keys($set).length) ops.$set = $set;
    if (Object.keys($unset).length) ops.$unset = $unset;

    await Supplier.updateOne(
      { _id: req.params.id, productionId: req.headers['x-production-id'] },
      ops,
      { runValidators: true }
    );

    const fresh = await Supplier.findOne({
      _id: req.params.id,
      productionId: req.headers['x-production-id'],
    }).lean();

    if (!fresh) return res.status(404).json({ error: 'Not found' });
    res.json(fresh);
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const s = await Supplier.findOneAndDelete({
      _id: req.params.id,
      productionId: req.headers['x-production-id'],
    });
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
