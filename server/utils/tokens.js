// server/utils/tokens.js
import jwt from 'jsonwebtoken';

const PW_TOKEN_SECRET = process.env.JWT_SECRET;

// Create a short-lived token that encodes the production + member
export function signMemberPasswordToken({ pid, mid, email }, { expiresIn = '48h' } = {}) {
  if (!pid || !mid || !email) throw new Error('pid, mid, email required');
  const payload = {
    t: 'memberPwd',           // token type
    pid: String(pid),         // production _id
    mid: String(mid),         // members._id
    email: String(email).toLowerCase(),
  };
  return jwt.sign(payload, PW_TOKEN_SECRET, { expiresIn });
}

export function verifyMemberPasswordToken(token) {
  const dec = jwt.verify(token, PW_TOKEN_SECRET);
  if (!dec || dec.t !== 'memberPwd') throw new Error('Invalid token');
  return dec; // { t, pid, mid, email, iat, exp }
}