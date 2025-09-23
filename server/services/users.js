// services/users.js
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

function genTempPassword() {
  // 12 chars: URL-safe
  return crypto.randomBytes(9).toString('base64url');
}

/**
 * Ensure a user exists; if created, set a temporary password and flag.
 * Returns: { user, created, tempPassword? }
 */
export async function ensureTempAccountAndInvite(email, profile = {}) {
  const emailLC = String(email).trim().toLowerCase();

  let user = await User.findOne({ email: emailLC });
  if (user) {
    // if they exist already, do not overwrite password; just return
    return { user, created: false };
  }

  const tempPassword = genTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  user = await User.create({
    email: emailLC,
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    role: 'admin',
    passwordHash,
    mustChangePassword: true, // make them update on first login
    isActive: true,
  });

  return { user, created: true, tempPassword };
}
