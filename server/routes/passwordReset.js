// server/routes/passwordReset.js (ESM)
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Production from '../models/Production.js';

const router = Router();

const MIN_PASS_LEN = +(process.env.PASS_LEN || 8);

/** Use ONE canonical secret; support fallbacks for legacy setups */
const RESET_SECRET =
  process.env.SETPW_SECRET

const isHex24 = (s) => /^[a-f0-9]{24}$/i.test(String(s || ''));
const lc = (s) => String(s || '').trim().toLowerCase();
const toId = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return isHex24(v) ? v : '';
  try { const s = v?.toString?.(); return isHex24(s) ? s : ''; } catch { return ''; }
};

/** Verify with primary secret, then try a couple of fallbacks just in case */
function verifyResetToken(token) {
  const candidates = [
    process.env.SETPW_SECRET,
  ].filter(Boolean);

  let lastErr;
  for (const secret of candidates) {
    try {
      return jwt.verify(token, secret);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Invalid token');
}

/**
 * POST /auth/complete-reset
 * Body: { token, password, slug?, productionId? }
 * Also supports token via query (?token=...)
 */
router.post('/complete-reset', async (req, res) => {
  try {
    const token = String(req.body?.token || req.query?.token || '').trim();
    const password = String(req.body?.password || '').trim();
    const slug = String(req.body?.slug || '').trim().toLowerCase();
    const productionId = toId(req.body?.productionId);

    if (!token) return res.status(400).json({ error: 'token is required' });
    if (!password || password.length < MIN_PASS_LEN) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASS_LEN} characters.` });
    }

    // 1) decode token
    let dec;
    try {
      dec = verifyResetToken(token);
      // expected claims: { pid?, mid?, email? }
    } catch {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    // 2) resolve production
    const pid = toId(dec.pid) || productionId;
    let prod = null;

    if (pid) {
      prod = await Production.findById(pid)
        .select('_id slug ownerUserId owner members._id members.user members.email')
        .lean();
    }
    if (!prod && slug) {
      prod = await Production.findOne({ slug, isActive: true })
        .select('_id slug ownerUserId owner members._id members.user members.email')
        .lean();
    }
    if (!prod) return res.status(404).json({ error: 'Production not found' });

    // 3) find the member
    const mid = toId(dec.mid);
    const emailLC = lc(dec.email);

    let member = null;
    if (Array.isArray(prod.members)) {
      member = prod.members.find(m =>
        (mid && String(m._id) === mid) ||
        (mid && isHex24(m.user) && String(m.user) === mid) ||
        (emailLC && lc(m.email) === emailLC)
      ) || null;
    }
    if (!member) return res.status(404).json({ error: 'Member not found for this token' });

    // 4) write passwordHash
    const hash = await bcrypt.hash(password, 12);
    await Production.updateOne(
      { _id: prod._id, 'members._id': member._id },
      { $set: { 'members.$.passwordHash': hash } },
      { strict: false }
    );

    return res.json({ ok: true });
  } catch (e) {
    const msg = e?.message || 'Failed to set password';
    return res.status(500).json({ error: msg });
  }
});

export default router;