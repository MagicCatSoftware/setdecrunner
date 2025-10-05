// server/routes/ocr.js
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import Runsheet from '../models/RunSheet.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/image\/(png|jpeg|jpg|webp)/i.test(file.mimetype)) {
      return cb(new Error('Only PNG/JPEG/WEBP images are allowed.'));
    }
    cb(null, true);
  },
});

/* -------------------------- helpers -------------------------- */

function extFromMime(m) {
  if (/png/i.test(m)) return 'png';
  if (/webp/i.test(m)) return 'webp';
  return 'jpg';
}

function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filePath);
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function publicUploadsPath(runsheetId, filename) {
  return `/uploads/ocr/${runsheetId}/${filename}`;
}

/**
 * Save a buffer to the runsheet uploads folder and return:
 * { absPath, publicPath, filename }
 */
async function persistImageBuffer(runsheetId, buffer, mimetype) {
  const ext = extFromMime(mimetype);
  const dir = path.join(process.cwd(), 'uploads', 'ocr', String(runsheetId));
  await ensureDir(dir);
  const filename = `runsheet-${runsheetId}-${Date.now()}.${ext}`;
  const absPath = path.join(dir, filename);
  await fs.writeFile(absPath, buffer);
  const publicPath = publicUploadsPath(runsheetId, filename);
  return { absPath, publicPath, filename };
}

/**
 * Create a queue job manifest consumed by the Python worker.
 * Returns { jobId, jobFile }
 */
async function enqueueOCRJob({ runsheetId, absPath, publicPath, mimetype, userId, kind = 'by_hand', model = 'gpt-4o-mini' }) {
  const queueDir = path.join(process.cwd(), 'uploads', 'ocr_queue');
  await ensureDir(queueDir);
  const jobId = `job-${runsheetId}-${uid()}`;
  const jobFile = path.join(queueDir, `${jobId}.json`);
  const job = {
    jobId,
    runsheetId,
    imageAbsPath: absPath,
    imagePublicPath: publicPath,
    mimetype,
    createdBy: userId || null,
    createdAt: new Date().toISOString(),
    kind,
    model,
  };
  await writeJsonAtomic(jobFile, job);
  return { jobId, jobFile };
}

/**
 * Set minimal OCR placeholder on runsheet so UI can show a preview
 */
async function markRunsheetQueued(runsheetId, { publicPath, jobId, userId, kind = 'by_hand' }) {
  const rs = await Runsheet.findById(runsheetId);
  if (!rs) return null;
  rs.ocr = rs.ocr || {};
  const latest = {
    kind,
    model: '',
    image: publicPath,
    text: '',
    fields: {},
    raw: {},
    tokens: 0,
    meta: { status: 'queued', jobId },
    createdBy: userId || null,
    createdAt: new Date(),
  };
  rs.ocr.latest = latest;
  rs.ocr.history = Array.isArray(rs.ocr.history) ? [...rs.ocr.history, latest] : [latest];
  rs.ocr.searchText = '';
  await rs.save();
  return rs;
}

/* --------------------------- routes -------------------------- */

/**
 * POST /api/ocr/runsheet
 * Saves a drawn/merged image from the canvas and enqueues OCR.
 * Expects multipart FormData with:
 *  - file: image data
 *  - runsheetId: existing runsheet id
 */
router.post(
  '/runsheet',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Image too large. Please upload a smaller image.' });
      }
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  async (req, res) => {
    try {
      const runsheetId = String(req.body.runsheetId || '').trim();
      if (!runsheetId) return res.status(400).json({ error: 'runsheetId missing' });
      if (!req.file) return res.status(400).json({ error: 'file missing' });

      const { absPath, publicPath } = await persistImageBuffer(runsheetId, req.file.buffer, req.file.mimetype);
      const { jobId } = await enqueueOCRJob({
        runsheetId,
        absPath,
        publicPath,
        mimetype: req.file.mimetype,
        userId: req.user?._id,
        kind: 'by_hand',
      });
      await markRunsheetQueued(runsheetId, { publicPath, jobId, userId: req.user?._id, kind: 'by_hand' });

      return res.status(202).json({
        ok: true,
        status: 'queued',
        jobId,
        image: publicPath,
        runsheetId,
      });
    } catch (e) {
      console.error('OCR enqueue error', e);
      return res.status(500).json({ error: 'Failed to enqueue OCR' });
    }
  }
);

/**
 * POST /api/ocr/runsheet/photo
 * Upload a photographed runsheet, create a runsheet if needed, and enqueue OCR.
 * Accepts:
 *  - file: image
 *  - runsheetId: optional existing id; if omitted, a new runsheet is created
 *  - productionId: required if creating a new runsheet (or supply in header x-production-id)
 *  - title: optional title for new runsheet
 */
router.post(
  '/runsheet/photo',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Image too large. Please upload a smaller image.' });
      }
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file missing' });

      let runsheetId = String(req.body.runsheetId || '').trim();
      let createdNew = false;

      if (!runsheetId) {
        const productionId =
          String(req.body.productionId || req.headers['x-production-id'] || '').trim();
        if (!productionId) {
          return res.status(400).json({ error: 'productionId required to create runsheet' });
        }
        const title = String(req.body.title || 'Untitled (Photo)').trim();

        const rs = await Runsheet.create({
          title,
          status: 'draft',
          productionId,
          createdBy: req.user?._id || null,
        });
        runsheetId = String(rs._id);
        createdNew = true;
      }

      const { absPath, publicPath } = await persistImageBuffer(runsheetId, req.file.buffer, req.file.mimetype);
      const { jobId } = await enqueueOCRJob({
        runsheetId,
        absPath,
        publicPath,
        mimetype: req.file.mimetype,
        userId: req.user?._id,
        kind: 'photo',
      });
      await markRunsheetQueued(runsheetId, { publicPath, jobId, userId: req.user?._id, kind: 'photo' });

      return res.status(createdNew ? 201 : 202).json({
        ok: true,
        status: 'queued',
        jobId,
        image: publicPath,
        runsheetId,
        createdNew,
      });
    } catch (e) {
      console.error('Photo OCR enqueue error', e);
      return res.status(500).json({ error: 'Failed to enqueue photo OCR' });
    }
  }
);

/**
 * Optional: poll latest OCR result
 * GET /api/ocr/runsheet/:id/latest
 */
router.get('/runsheet/:id/latest', async (req, res) => {
  try {
    const rs = await Runsheet.findById(req.params.id).select('ocr.latest ocr.searchText updatedAt');
    if (!rs) return res.status(404).json({ error: 'Runsheet not found' });
    return res.json({
      ok: true,
      latest: rs.ocr?.latest || null,
      searchText: rs.ocr?.searchText || '',
      updatedAt: rs.updatedAt,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read OCR status' });
  }
});

export default router;


