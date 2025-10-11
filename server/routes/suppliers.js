// src/routes/suppliers.js
import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import mongoose from 'mongoose';

import Supplier from '../models/Supplier.js';
import Production from '../models/Production.js'; // for slug -> productionId (import fallback)
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All routes require auth (and tenant context via header for CRUD)
router.use(authRequired);

/* -------------------------- helpers -------------------------- */

const upload = multer({ storage: multer.memoryStorage() });

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

function requireProductionId(req) {
  const pid = String(req.headers['x-production-id'] || '').trim();
  if (!pid) {
    const err = new Error('Missing X-Production-Id header');
    err.status = 400;
    throw err;
  }
  return pid;
}

// For import: allow ?slug= fallback if header missing
async function resolveProductionId(req) {
  const header = String(req.headers['x-production-id'] || '').trim();
  if (header) return header;

  const slug = String(req.query.slug || '').trim();
  if (slug) {
    const prod = await Production.findOne({ slug }).select('_id').lean();
    if (!prod?._id) {
      const err = new Error('Unknown production slug');
      err.status = 400;
      throw err;
    }
    return String(prod._id);
  }

  const err = new Error('Missing production context (X-Production-Id header or ?slug=)');
  err.status = 400;
  throw err;
}

/* ------------------------ list/create ------------------------ */

router.get('/', async (req, res, next) => {
  try {
    const productionId = requireProductionId(req);
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
    const textQuery = buildFindQuery(req.query.q);

    const query = { productionId, ...textQuery };

    const list = await Supplier.find(query)
      .sort({ updatedAt: -1 })
      .select('name address location phone contactName hours createdAt updatedAt')
      .limit(limit)
      .lean();

    res.json(list);
  } catch (e) { next(e); }
});

router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    const productionId = await resolveProductionId(req);
    const createdBy = req.user?._id;

    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse workbook/csv
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return res.status(400).json({ error: 'No sheets found in file' });
    const ws = wb.Sheets[sheetName];

    // rows keyed by header row
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'Sheet is empty' });

    // header aliases (very broad, case-insensitive)
    const A = (s) => String(s || '').trim().toLowerCase();
    const ALIASES = {
      name:        ['name', 'supplier', 'supplier name', 'vendor', 'vendor name', 'company', 'company name'],
      address:     ['address', 'addr', 'street', 'location', 'address1', 'address 1', 'address line 1'],
      address2:    ['address2', 'address 2', 'address line 2', 'suite', 'unit'],
      city:        ['city', 'town'],
      state:       ['state', 'province', 'region', 'state/province', 'state or province'],
      postal:      ['zip', 'zip code', 'postal', 'postal code', 'postcode'],
      country:     ['country', 'country/region', 'nation'],
      phone:       ['phone', 'phone #', 'tel', 'telephone', 'mobile', 'phone number'],
      contactName: ['contact', 'contact name', 'attn', 'attention', 'contact person'],
      hours:       ['hours', 'opening hours', 'open hours', 'business hours'],
      lat:         ['lat', 'latitude', 'y', 'lat (y)'],
      lng:         ['lng', 'lon', 'long', 'longitude', 'x', 'lng (x)'],
    };

    // Build header map: raw header -> canonical field
    const headerMap = {};
    const rawKeys = Object.keys(rows[0] || {});
    for (const raw of rawKeys) {
      const k = A(raw);
      for (const [canon, list] of Object.entries(ALIASES)) {
        if (list.includes(k)) { headerMap[raw] = canon; break; }
      }
    }

    const toNum = (v) => {
      if (v === '' || v === null || v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    const ops = [];
    const skipped = [];
    let analyzed = 0;

    // Compose full address from parts when needed
    const buildAddress = (doc) => {
      if (doc.address) return doc.address;
      const parts = [doc.address, doc.address2, doc.city, doc.state, doc.postal, doc.country]
        .map(x => String(x || '').trim())
        .filter(Boolean);
      return parts.join(', ');
    };

    for (const row of rows) {
      analyzed++;
      const doc = {};
      let lat, lng;

      // Map row -> doc fields
      for (const [rawKey, value] of Object.entries(row)) {
        const canon = headerMap[rawKey];
        if (!canon) continue;
        if (canon === 'lat') { lat = toNum(value); continue; }
        if (canon === 'lng') { lng = toNum(value); continue; }
        doc[canon] = String(value || '').trim();
      }

      // Requireds
      doc.name = doc.name || '';
      // Build address if not provided directly
      doc.address = buildAddress(doc);

      if (!doc.name || !doc.address) {
        skipped.push({ reason: 'missing name/address', sample: row });
        continue;
      }

      // Prepare update document
      const $set = {
        address: doc.address,
        phone: doc.phone || undefined,
        contactName: doc.contactName || undefined,
        hours: doc.hours || undefined,
      };
      if (lat !== undefined || lng !== undefined) {
        $set.location = {
          lat: lat === undefined ? null : lat,
          lng: lng === undefined ? null : lng,
        };
      }

      ops.push({
        updateOne: {
          filter: { productionId, name: doc.name, address: doc.address },
          update: {
            $set,
            $setOnInsert: { name: doc.name, createdBy, productionId },
          },
          upsert: true,
        }
      });
    }

    if (!ops.length) {
      return res.json({
        ok: true,
        inserted: 0,
        updated: 0,
        skipped: skipped.length,
        analyzed,
        items: 0,
        skippedExamples: skipped.slice(0, 5), // help debug header mapping
        headerMap,                             // see what we matched
      });
    }

    const result = await Supplier.bulkWrite(ops, { ordered: false });
    const inserted = result.upsertedCount || 0;
    const updated  = result.modifiedCount || 0;

    return res.json({
      ok: true,
      inserted,
      updated,
      skipped: skipped.length,
      analyzed,
      items: ops.length,
      skippedExamples: skipped.slice(0, 5),
      headerMap,
    });
  } catch (e) { next(e); }
});

/* -------------------- read/update/delete --------------------- */

router.get('/:id', async (req, res, next) => {
  try {
    const productionId = requireProductionId(req);

    const s = await Supplier.findOne({
      _id: req.params.id,
      productionId,
    }).lean();

    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const productionId = requireProductionId(req);

    const { name, address, phone, contactName, hours, location } = req.body || {};
    const $set = {};
    const $unset = {};

    if (name !== undefined)        $set.name        = String(name || '').trim();
    if (address !== undefined)     $set.address     = String(address || '').trim();
    if (phone !== undefined)       $set.phone       = String(phone || '').trim() || undefined;
    if (contactName !== undefined) $set.contactName = String(contactName || '').trim() || undefined;
    if (hours !== undefined)       $set.hours       = String(hours || '').trim() || undefined;

    if (location !== undefined) {
      const loc = coerceLocation(location);
      if (loc) $set.location = loc;
      else $unset.location = '';
    }

    const ops = {};
    if (Object.keys($set).length) ops.$set = $set;
    if (Object.keys($unset).length) ops.$unset = $unset;

    await Supplier.updateOne(
      { _id: req.params.id, productionId },
      ops,
      { runValidators: true }
    );

    const fresh = await Supplier.findOne({
      _id: req.params.id,
      productionId,
    }).lean();

    if (!fresh) return res.status(404).json({ error: 'Not found' });
    res.json(fresh);
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const productionId = requireProductionId(req);

    const s = await Supplier.findOneAndDelete({
      _id: req.params.id,
      productionId,
    });
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ----------------------- excel/csv import --------------------- */
/**
 * POST /tenant/suppliers/import
 * Accepts .xlsx/.xls/.csv in field "file".
 * Upserts by (productionId, name, address).
 * Optional columns: phone, contact/contactName, hours, lat, lng.
 *
 * Production resolution:
 *  - X-Production-Id header (preferred)
 *  - or ?slug=my-production
 */
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    const productionId = await resolveProductionId(req);
    const createdBy = req.user?._id;

    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return res.status(400).json({ error: 'No sheets found in file' });
    const ws = wb.Sheets[sheetName];

    // rows as array of objects keyed by header row
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'Sheet is empty' });

    // header aliases (case-insensitive)
    const ALIASES = {
      name: ['name', 'supplier', 'supplier name'],
      address: ['address', 'addr', 'street', 'location'],
      phone: ['phone', 'tel', 'telephone', 'mobile', 'phone number'],
      contactName: ['contact', 'contact name', 'attn', 'attention'],
      hours: ['hours', 'opening hours', 'open hours', 'business hours'],
      lat: ['lat', 'latitude'],
      lng: ['lng', 'lon', 'long', 'longitude'],
    };

    const headerMap = {};
    const firstRowKeys = Object.keys(rows[0] || {});
    for (const key of firstRowKeys) {
      const k = String(key || '').trim().toLowerCase();
      for (const [canon, list] of Object.entries(ALIASES)) {
        if (list.includes(k)) {
          headerMap[key] = canon;
          break;
        }
      }
    }

    const ops = [];
    let skipped = 0;

    const toNum = (v) => {
      if (v === '' || v === null || v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    for (const row of rows) {
      const doc = { name: '', address: '', phone: '', contactName: '', hours: '' };
      let lat, lng;

      for (const [rawKey, value] of Object.entries(row)) {
        const canon = headerMap[rawKey];
        if (!canon) continue;
        if (canon === 'lat') { lat = toNum(value); continue; }
        if (canon === 'lng') { lng = toNum(value); continue; }
        doc[canon] = String(value || '').trim();
      }

      if (!doc.name || !doc.address) { skipped++; continue; }

      const $set = {
        address: doc.address,
        phone: doc.phone || undefined,
        contactName: doc.contactName || undefined,
        hours: doc.hours || undefined,
      };

      if (lat !== undefined || lng !== undefined) {
        $set.location = {
          lat: lat === undefined ? null : lat,
          lng: lng === undefined ? null : lng,
        };
      }

      ops.push({
        updateOne: {
          filter: { productionId, name: doc.name, address: doc.address },
          update: {
            $set,
            $setOnInsert: { name: doc.name, createdBy, productionId },
          },
          upsert: true,
        }
      });
    }

    if (!ops.length) {
      return res.json({ ok: true, inserted: 0, updated: 0, skipped, items: 0 });
    }

    const result = await Supplier.bulkWrite(ops, { ordered: false });
    const inserted = result.upsertedCount || 0;
    const updated = result.modifiedCount || 0;

    return res.json({ ok: true, inserted, updated, skipped, items: ops.length });
  } catch (e) { next(e); }
});

/* --------------------------- exports -------------------------- */

export default router;