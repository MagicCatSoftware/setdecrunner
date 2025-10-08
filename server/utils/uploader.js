// src/utils/uploader.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';

/** Root directory for uploaded files (absolute). */
export const UPLOAD_ROOT =
  process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');

/** Ensure the uploads root exists on boot. */
export async function ensureUploadRoot() {
  try { await fsp.mkdir(UPLOAD_ROOT, { recursive: true }); } catch {}
}
// Synchronously ensure on import (helps when routes load before awaiting anything).
try { fs.mkdirSync(UPLOAD_ROOT, { recursive: true }); } catch {}

/**
 * Middleware factory: compute and set a per-request destination directory.
 * Use this before the multer handler.
 *
 * Example:
 *   router.post(
 *     '/:id/photos',
 *     setUploadDest((req) => path.join(UPLOAD_ROOT, 'runsheets', req.params.id)),
 *     upload.array('photos', 12),
 *     handler
 *   )
 */
export function setUploadDest(fn) {
  return async (req, _res, next) => {
    try {
      const dest = await Promise.resolve(fn(req));
      if (!dest) throw new Error('setUploadDest: destination path was falsy');
      // Normalize and ensure it's inside UPLOAD_ROOT
      const absDest = path.resolve(dest);
      const rel = path.relative(UPLOAD_ROOT, absDest);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Upload destination must be inside UPLOAD_ROOT (${UPLOAD_ROOT})`);
      }
      req.uploadDest = absDest;
      await fsp.mkdir(absDest, { recursive: true });
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Very light filename sanitizer (keeps extension, strips path separators/control chars). */
function sanitizeBaseName(name) {
  const base = (name || '').toString().replace(/[/\\]+/g, ' ').replace(/[\u0000-\u001F\u007F]/g, '');
  return base.trim() || 'file';
}

/** Multer storage that honors req.uploadDest (if provided), else UPLOAD_ROOT. */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dest = req.uploadDest ? path.resolve(req.uploadDest) : UPLOAD_ROOT;
    // Ensure within UPLOAD_ROOT
    const rel = path.relative(UPLOAD_ROOT, dest);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return cb(new Error('Upload destination escapes UPLOAD_ROOT'), undefined);
    }
    fs.mkdir(dest, { recursive: true }, (err) => cb(err, dest));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = sanitizeBaseName(path.basename(file.originalname || '', ext));
    const unique = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    cb(null, `${unique}-${name}${ext}`);
  }
});

/**
 * Main Multer instance.
 * Tweak limits/fileFilter as needed.
 */
export const upload = multer({
  storage,
  limits: {
    files: 50,                 // max number of files per request
    fileSize: 25 * 1024 * 1024 // 25 MB per file
  },
  fileFilter: (_req, _file, cb) => {
    // Accept all; add mimetype/extension checks if you want.
    cb(null, true);
  }
});

/**
 * Convert an absolute path under UPLOAD_ROOT (or a Multer file object) to a clean public URL (/uploads/…).
 * - If a string already contains /uploads/, returns a single normalized /uploads/... (deduped).
 * - Throws if the absolute path is outside UPLOAD_ROOT.
 */
export function toPublicPath(input) {
  // Multer file object support
  if (input && typeof input === 'object' && input.path) {
    const abs = path.resolve(input.path);
    const rel = path
      .relative(UPLOAD_ROOT, abs)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    if (rel.startsWith('..')) {
      throw new Error(`Refusing to expose path outside uploads: ${abs}`);
    }
    return '/uploads/' + rel;
  }

  // String handling
  let s = String(input || '').replace(/\\/g, '/').trim();
  if (!s) return '/uploads/';

  // If already a /uploads/... URL (even if duplicated), keep only the last segment
  if (s.includes('/uploads/')) {
    const tail = s.split('/uploads/').pop();
    return '/uploads/' + String(tail || '').replace(/^\/+/, '');
  }

  // If absolute path, map relative to root safely
  if (path.isAbsolute(s)) {
    const abs = path.resolve(s);
    const rel = path
      .relative(UPLOAD_ROOT, abs)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    if (rel.startsWith('..')) {
      throw new Error(`Refusing to expose path outside uploads: ${abs}`);
    }
    return '/uploads/' + rel;
  }

  // Otherwise treat as a relative file name under uploads
  return '/uploads/' + s.replace(/^\/+/, '');
}

/** Convert a /uploads/... URL back to an absolute path on disk under UPLOAD_ROOT. */
export function fromPublicPath(publicUrl) {
  const rel = String(publicUrl || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^uploads\/?/, ''); // strip leading 'uploads/'
  return path.join(UPLOAD_ROOT, rel);
}

/** Safe unlink; accepts absolute path OR /uploads/... url. Ignores ENOENT. */
export async function unlinkIfExists(absOrPublic) {
  try {
    const abs = String(absOrPublic || '').startsWith('/uploads/')
      ? fromPublicPath(absOrPublic)
      : path.resolve(absOrPublic);
    await fsp.unlink(abs);
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
  }
}


export function makeUploader(subfolderFn) {
  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        const subfolder = typeof subfolderFn === 'function' ? subfolderFn(req) : '';
        const dest = path.join(UPLOAD_ROOT, subfolder);
        fs.mkdir(dest, { recursive: true }, (err) => {
          if (err) return cb(err);
          cb(null, dest);
        });
      } catch (err) {
        cb(err);
      }
    },
    filename: (_req, file, cb) => {
      try {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const base = Date.now().toString(36) + Math.random().toString(36).slice(2);
        cb(null, base + ext);
      } catch (err) {
        cb(err);
      }
    }
  });

  return multer({
    storage,
    limits: { files: 30, fileSize: 25 * 1024 * 1024 }, // 25MB each
  });
}

/** (Optional) utility to check a path is inside the uploads root. */
export function isInsideUploadRoot(absPath) {
  const rel = path.relative(UPLOAD_ROOT, path.resolve(absPath));
  return !(rel.startsWith('..') || path.isAbsolute(rel));
}
