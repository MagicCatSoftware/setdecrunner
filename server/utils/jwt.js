// server/utils/jwt.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const TOKEN_TTL = process.env.JWT_TTL || '7d';

export function signToken(user) {
  const id = user?._id?.toString();
  if (!id) throw new Error('signToken: user._id missing');
  return jwt.sign(
    { uid: id, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}