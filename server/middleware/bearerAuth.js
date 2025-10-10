import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/** Read a bearer token from common header locations */
function getTokenFromHeaders(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (typeof auth === 'string') {
    const [scheme, token] = auth.split(' ');
    if (/^Bearer$/i.test(scheme) && token) return token.trim();
  }
  if (req.headers['x-auth-token']) return String(req.headers['x-auth-token']).trim();
  return null;
}

/** Extract a user id from a variety of payload shapes */
function extractUserId(payload) {
  // prefer standard JWT `sub`
  return String(
    payload?.sub ??
    payload?.userId ??
    payload?._id ??
    payload?.id ??
    payload?.uid ??
    payload?.user?._id ??
    payload?.user?.id ??
    ''
  ).trim();
}

export async function bearerAuth(req, res, next) {
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    // Verify with your configured secret/keys
    const secret = process.env.JWT_PUBLIC_KEY?.trim() || process.env.JWT_SECRET;
    if (!secret) {
      // Misconfigured server
      return res.status(500).json({ error: 'JWT secret not configured' });
    }

    const verifyOpts = {};
    // If using asymmetric keys, set algorithms from env
    if (process.env.JWT_ALG) verifyOpts.algorithms = [process.env.JWT_ALG];

    const payload = jwt.verify(token, secret, verifyOpts);

    const uid = extractUserId(payload);
    if (!uid) {
      // Helpful debug in non-production
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[bearerAuth] Could not extract user id from payload:', payload);
      }
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const user = await User.findById(uid)
      .select('_id email firstName lastName role isAdmin siteAuthorized productionIds')
      .lean();

    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = user;
    req.auth = { token, payload };
    next();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[bearerAuth] verify failed:', err?.name, err?.message);
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export default bearerAuth;