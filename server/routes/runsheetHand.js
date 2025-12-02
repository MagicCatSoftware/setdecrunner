// server/routes/runsheetHand.js
import { Router } from 'express';
import Runsheet from '../models/RunSheet.js';

const router = Router();

/**
 * VERY SIMPLE sanitizer:
 * - Keeps all strokes as-is, including { tool: 'text', text, at, wrapW }
 * - Ensures base shape for pen/eraser points is sane.
 * - Does NOT strip unknown keys.
 */
function passThroughStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];

  return strokes.map((s) => {
    if (!s || typeof s !== 'object') return null;

    // text strokes – keep everything the client sends
    if (s.tool === 'text') {
      return {
        tool: 'text',
        text: typeof s.text === 'string' ? s.text : '',
        color: typeof s.color === 'string' ? s.color : '#000000',
        size: Number.isFinite(s.size) ? s.size : 16,
        at: {
          x: Number.isFinite(s.at?.x) ? s.at.x : 0,
          y: Number.isFinite(s.at?.y) ? s.at.y : 0
        },
        wrapW: Number.isFinite(s.wrapW) && s.wrapW > 0 && s.wrapW <= 1
          ? s.wrapW
          : 0.32
      };
    }

    // pen / eraser strokes – keep points, don't kill extra keys
    const tool = (s.tool === 'eraser') ? 'eraser' : 'pen';
    const color = typeof s.color === 'string' ? s.color : '#000000';
    const size = Number.isFinite(s.size) ? s.size : 4;

    const pts = Array.isArray(s.points) ? s.points : [];
    const cleanPts = pts.map((p) => ({
      x: Number.isFinite(p?.x) ? p.x : 0,
      y: Number.isFinite(p?.y) ? p.y : 0,
      p: Number.isFinite(p?.p) ? p.p : 1
    }));

    return {
      ...s, // keep any extra keys you might add later
      tool,
      color,
      size,
      points: cleanPts
    };
  }).filter(Boolean);
}

// GET /api/tenant/runsheetsbyhand/:id/hand
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
    console.error('GET /runsheetsbyhand/:id/hand error', e);
    return res.status(500).json({ error: 'Failed to fetch hand data' });
  }
});

// PUT /api/tenant/runsheetsbyhand/:id/hand
// Body: { baseWidth: number, baseHeight: number, strokes: Stroke[] }
router.put('/:id/hand', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'id missing' });
    }

    const baseWidth  = Number(req.body.baseWidth || 0);
    const baseHeight = Number(req.body.baseHeight || 0);

    if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight) ||
        baseWidth <= 0 || baseHeight <= 0) {
      return res.status(400).json({ error: 'Invalid baseWidth/baseHeight' });
    }

    const strokes = passThroughStrokes(req.body.strokes);

    const setDoc = {
      'hand.baseWidth': baseWidth,
      'hand.baseHeight': baseHeight,
      'hand.strokes': strokes,
      'hand.lastSavedAt': new Date(),
      'hand.lastSavedBy': req.user?._id || null,
      updatedAt: new Date(),
    };

    const rs = await Runsheet.findByIdAndUpdate(
      id,
      { $set: setDoc },
      { new: true, projection: { hand: 1 } }
    );

    if (!rs) return res.status(404).json({ error: 'Runsheet not found' });

    return res.json({
      ok: true,
      hand: rs.hand || {}
    });
  } catch (e) {
    console.error('PUT /runsheetsbyhand/:id/hand error', e);
    return res.status(500).json({ error: 'Failed to save hand data' });
  }
});

export default router;


