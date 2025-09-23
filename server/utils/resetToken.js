import crypto from 'crypto';

export function generateResetToken() {
  const raw = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashToken(rawToken) {
  // Robust: handles URL-encoded + stray spaces
  const clean = decodeURIComponent(String(rawToken || '')).trim();
  return crypto.createHash('sha256').update(clean).digest('hex');
}