// server/routes/runsheetHand.js
import { Router } from 'express';
import Runsheet from '../models/RunSheet.js';

const router = Router();

// Validate a stroke payload quickly to avoid doc bloat or invalid data
function sanitizeStrokes(strokes, limits = { maxStrokes: 5000, maxPoints: 100000 }) {
  if (!Array.isArray(strokes)) return [];
  const out = [];
  let totalPoints = 0;

  for (const s of strokes) {
    if (!s || typeof s !== 'object') continue;
    const tool = (s.tool === 'eraser') ? 'eraser' : 'pen';
    const color = typeof s.color === 'string' ? s.color : '#000000';
    let size = Number.isFinite(s.size) ? s.size : 4;
    if (size < 1) size = 1;
    if (size > 64) size = 64;

    const pts = Array.isArray(s.points) ? s.points : [];
    const cleanPts = [];
    for (const p of pts) {
      if (!p) continue;
      const x = Number(p.x);
      const y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < 0 || x > 1 || y < 0 || y > 1) continue;
      cleanPts.push({ x, y });
      totalPoints++;
      if (totalPoints > limits.maxPoints) break;
    }
    if (cleanPts.length < 1) continue;

    out.push({ tool, color, size, points: cleanPts });
    if (out.length >= limits.maxStrokes || totalPoints >= limits.maxPoints) break;
  }

  return out;
}

// GET /api/tenant/runsheets/:id/hand
router.get('/:id/hand', async (req, res) => {
  try {
    const rs = await Runsheet.findById(req.params.id).select('hand');
    if (!rs) return res.status(404).json({ error: 'Runsheet not found' });
    const hand = rs.hand || {};
    return res.json({
      ok: true,
      hand: {
        baseWidth: hand.baseWidth || 0,
        baseHeight: hand.baseHeight || 0,
        strokes: Array.isArray(hand.strokes) ? hand.strokes : [],
        lastSavedAt: hand.lastSavedAt || null,
        lastSavedBy: hand.lastSavedBy || null,
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch hand data' });
  }
});

// PUT /api/tenant/runsheets/:id/hand
// Body: { baseWidth: number, baseHeight: number, strokes: Stroke[] }
router.put('/:id/hand', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const baseWidth  = Number(req.body.baseWidth || 0);
    const baseHeight = Number(req.body.baseHeight || 0);
    let strokes = sanitizeStrokes(req.body.strokes);

    if (!id) return res.status(400).json({ error: 'id missing' });
    if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight) || baseWidth <= 0 || baseHeight <= 0) {
      return res.status(400).json({ error: 'Invalid baseWidth/baseHeight' });
    }

    const setDoc = {
      'hand.baseWidth': baseWidth,
      'hand.baseHeight': baseHeight,
      'hand.strokes': strokes,
      'hand.lastSavedAt': new Date(),
      'hand.lastSavedBy': req.user?._id || null,
      updatedAt: new Date(),
    };

    const rs = await Runsheet.findByIdAndUpdate(id, { $set: setDoc }, { new: true, projection: { hand: 1 } });
    if (!rs) return res.status(404).json({ error: 'Runsheet not found' });

    return res.json({
      ok: true,
      hand: rs.hand || {}
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save hand data' });
  }
});

export default router;
