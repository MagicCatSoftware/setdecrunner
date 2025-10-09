// utils/memberResetToken.js
import jwt from 'jsonwebtoken';

const RESET_SECRET =
  process.env.SETPW_SECRET ||
  process.env.RESET_JWT_SECRET ||
  process.env.JWT_RESET_SECRET ||
  process.env.JWT_SECRET ||
  'devsecret';

export function issueMemberResetToken({ pid, mid, email, ttl = '24h' }) {
  if (!pid) throw new Error('pid required');
  if (!mid && !email) throw new Error('mid or email required');
  return jwt.sign({ pid, mid, email }, RESET_SECRET, { expiresIn: ttl });
}