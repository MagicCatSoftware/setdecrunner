// server/routes/tenantAuth.js
// server/routes/tenantAuth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Production, { normalizeSlug } from '../models/Production.js';
import User from '../models/User.js';
import { verifyMemberPasswordToken } from '../utils/tokens.js';


const router = Router();

/* ───────────────────────── config ───────────────────────── */
const TENANT_JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const TENANT_JWT_TTL    = process.env.JWT_TTL || '12h';
const MIN_PASS_LEN      = +(process.env.PASS_LEN || 8);

/* ───────────────────────── helpers ───────────────────────── */
const HEX24 = /^[a-f0-9]{24}$/i;
const isHex24 = (s) => HEX24.test(String(s || ''));
const lc = (s) => String(s || '').trim().toLowerCase();

function toId(v) {
  if (!v) return '';
  if (typeof v === 'string' && HEX24.test(v)) return v;
  try { const s = v?._id ?? v?.id ?? v?.valueOf?.(); return HEX24.test(String(s)) ? String(s) : ''; }
  catch { return ''; }
}
function idsEqual(a, b) { const A = toId(a), B = toId(b); return !!A && !!B && A === B; }

async function getProductionBySlug(slug) {
  const s = normalizeSlug(slug);
  const prod = await Production.findOne({ slug: s, isActive: true })
    .select('_id slug title ownerUserId owner members')
    .lean();
  return prod || null;
}

function signTenantJwt(payload) {
  return jwt.sign(payload, TENANT_JWT_SECRET, { expiresIn: TENANT_JWT_TTL });
}
function readBearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}
function tenantAuthRequired(req, res, next) {
  try {
    const token = readBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const dec = jwt.verify(token, TENANT_JWT_SECRET);
    req.tenant = dec; // { pid, mid, uid, email, role, owner }
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

/** Ensure a backing User doc and attach productionId if missing */
async function ensureBackingUser(email, name, prodId) {
  const emailLC = lc(email);
  let user = await User.findOne({ email: emailLC }).select('_id email name productionIds').lean();
  if (!user) {
    user = await User.create({ email: emailLC, name: name || '', productionIds: prodId ? [prodId] : [] })
      .then(d => d.toObject());
  } else if (prodId) {
    const has = (user.productionIds || []).map(String).includes(String(prodId));
    if (!has) await User.updateOne({ _id: user._id }, { $addToSet: { productionIds: prodId } });
  }
  return user;
}

/** Upsert a member row by email (and user ref) with siteAuthorized defaulting to false */
async function upsertMemberUnauthorized(prod, { userId, email, role = 'user', passwordHash = null }) {
  const emailLC = lc(email);
  const existing = (prod.members || []).find(m => lc(m?.email) === emailLC);

  const memberDoc = {
    user: userId || (existing?.user || undefined),
    email: emailLC,
    role: ['admin','editor','viewer','coordinator','driver','user'].includes(String(role)) ? role : 'user',
    siteAuthorized: false, // 🚫 never auto-authorize here
    addedAt: existing?.addedAt || new Date(),
  };
  if (passwordHash) memberDoc.passwordHash = passwordHash;

  if (!existing) {
    await Production.updateOne(
      { _id: prod._id, 'members.email': { $ne: emailLC } },
      { $push: { members: memberDoc } },
      { strict: false }
    );
  } else {
    // Keep email and user consistent; never flip siteAuthorized to true here.
    const set = {
      'members.$.email': emailLC,
      'members.$.role': memberDoc.role,
    };
    if (memberDoc.user) set['members.$.user'] = memberDoc.user;
    if (passwordHash) set['members.$.passwordHash'] = passwordHash;

    await Production.updateOne(
      { _id: prod._id, 'members.email': emailLC },
      { $set: set },
      { strict: false }
    );
  }

  // Return fresh member
  const refreshed = await Production.findOne(
    { _id: prod._id, 'members.email': emailLC },
    { 'members.$': 1, ownerUserId: 1, owner: 1 }
  ).lean();
  return refreshed?.members?.[0] || null;
}

/* ─────────────────────────── REGISTER ───────────────────────────
   Creates a backing User and a members[] entry with siteAuthorized=false.
   DOES NOT issue a tenant token; admin must authorize first.
────────────────────────────────────────────────────────────────── */
router.post('/register', async (req, res) => {
  try {
    const { slug, email, password, name } = req.body || {};
    if (!slug || !email || !password) {
      return res.status(400).json({ error: 'slug, email, password required' });
    }
    if (String(password).length < MIN_PASS_LEN) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASS_LEN} characters.` });
    }

    const prod = await getProductionBySlug(slug);
    if (!prod) return res.status(404).json({ error: 'Production not found' });

    // Backing user + membership (unauthorized)
    const user = await ensureBackingUser(email, name, prod._id);
    const passwordHash = await bcrypt.hash(String(password), 10);
    const member = await upsertMemberUnauthorized(prod, {
      userId: user._id,
      email,
      role: 'user',
      passwordHash, // store member-local password
    });

    if (!member) return res.status(500).json({ error: 'Failed to create member' });

    return res.status(201).json({
      ok: true,
      pendingAuthorization: true,
      message: 'Account created. An admin must authorize your access before you can sign in.',
      productionId: String(prod._id),
      member: {
        id: String(member._id || ''),
        user: String(member.user || user._id),
        email: lc(email),
        role: member.role || 'user',
        siteAuthorized: !!member.siteAuthorized, // false
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Registration failed' });
  }
});

/* ─────────────────────────── SOCIAL UPSERT ───────────────────────────
   Call this after Google/Facebook OAuth success.
   Ensures the user + member exist with siteAuthorized=false.
   DOES NOT issue a token.
   Body: { slug, email, name? }
────────────────────────────────────────────────────────────────── */
router.post('/social/upsert', async (req, res) => {
  try {
    const { slug, email, name } = req.body || {};
    if (!slug || !email) return res.status(400).json({ error: 'slug and email required' });

    const prod = await getProductionBySlug(slug);
    if (!prod) return res.status(404).json({ error: 'Production not found' });

    const user = await ensureBackingUser(email, name, prod._id);
    const member = await upsertMemberUnauthorized(prod, {
      userId: user._id,
      email,
      role: 'user',
    });

    if (!member) return res.status(500).json({ error: 'Failed to upsert member' });

    return res.json({
      ok: true,
      pendingAuthorization: true,
      message: 'Your account is awaiting admin authorization.',
      productionId: String(prod._id),
      member: {
        id: String(member._id || ''),
        user: String(member.user || user._id),
        email: lc(email),
        role: member.role || 'user',
        siteAuthorized: !!member.siteAuthorized, // false
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Social upsert failed' });
  }
});

/* ─────────────────────────── LOGIN ───────────────────────────
   Authenticates against Production.members by email/password.
   Refuses if siteAuthorized=false.
────────────────────────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  try {
    const { slug, email, password } = req.body || {};
    if (!slug || !email || !password) {
      return res.status(400).json({ error: 'slug, email, password required' });
    }

    const prod = await getProductionBySlug(slug);
    if (!prod) return res.status(404).json({ error: 'Production not found' });

    const m = (prod.members || []).find(x => lc(x?.email) === lc(email));
    
    if (!m || !m.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
    
    const passOK = await bcrypt.compare(String(password), m.passwordHash);
    if (!passOK) return res.status(401).json({ error: 'Invalid credentials' });

    // 🚫 Block tenant access until authorized
    if (!m.siteAuthorized) {
      return res.status(403).json({
        error: 'Access requires admin authorization',
        pendingAuthorization: true,
      });
    }

    const isOwner = idsEqual(m.user, (prod.ownerUserId ?? prod.owner));

    const token = signTenantJwt({
      pid: String(prod._id),
      mid: String(m._id || m.user || ''),
      uid: isHex24(m.user) ? String(m.user) : undefined,
      email: lc(email),
      role: String(m.role || 'user'),
      owner: !!isOwner,
    });

    return res.json({
      ok: true,
      productionId: String(prod._id),
      token,
      owner: !!isOwner,
      member: {
        id: String(m._id || ''),
        user: isHex24(m.user) ? String(m.user) : '',
        email: lc(email),
        role: m.role || 'user',
        siteAuthorized: !!m.siteAuthorized, // true here
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Login failed' });
  }
});

/* ─────────────────────────── /me (tenant) ───────────────────────────
   Validates token → re-checks DB → REFUSES if siteAuthorized=false.
────────────────────────────────────────────────────────────────── */
router.get('/me', tenantAuthRequired, async (req, res) => {
  try {
    const pid = String(req.headers['x-production-id'] || '').trim();
    if (!pid || !isHex24(pid)) return res.status(400).json({ error: 'Missing or invalid x-production-id' });

    const { mid, uid, email } = req.tenant || {};
    const prod = await Production.findById(pid)
      .select('_id slug ownerUserId owner members')
      .lean();

    if (!prod) return res.status(404).json({ error: 'Production not found' });

    // Locate member by _id, user ref, or email
    const me = (prod.members || []).find(m =>
      (m._id && String(m._id) === String(mid)) ||
      (uid && m.user && String(m.user) === String(uid)) ||
      (m.email && lc(m.email) === lc(email))
    );

    if (!me) return res.status(401).json({ error: 'Member not found (stale token)' });

    if (!me.siteAuthorized) {
      return res.status(403).json({
        error: 'Access requires admin authorization',
        pendingAuthorization: true,
      });
    }

    const isOwner = idsEqual(me.user, (prod.ownerUserId ?? prod.owner));
    const role = me.role || (isOwner ? 'admin' : 'user');

    req.user = me.user;

    return res.json({
      ok: true,
      productionId: String(prod._id),
      owner: !!isOwner,
      role,
      email: lc(email),
      uid: isHex24(me.user) ? String(me.user) : null,
      member: {
        id: String(me._id || ''),
        user: isHex24(me.user) ? String(me.user) : '',
        role: me.role || 'user',
        siteAuthorized: !!me.siteAuthorized,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to load tenant session' });
  }
});

router.get('/set-password/verify', async (req, res) => {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).json({ error: 'Missing token' });
    const dec = verifyMemberPasswordToken(token); // { pid, mid, email, ... }
    const prod = await Production.findById(dec.pid).select('_id slug title members._id members.email').lean();
    if (!prod) return res.status(404).json({ error: 'Production not found' });

    const m = (prod.members || []).find(x => String(x._id) === String(dec.mid) && String(x.email).toLowerCase() === String(dec.email).toLowerCase());
    if (!m) return res.status(404).json({ error: 'Member not found' });

    return res.json({
      ok: true,
      productionId: String(prod._id),
      slug: prod.slug,
      email: dec.email,
      memberId: String(m._id),
      title: prod.title || prod.slug,
    });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
});

// Consume token and set password
router.post('/set-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'token and password required' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const dec = verifyMemberPasswordToken(token); // { pid, mid, email }
    const hash = await bcrypt.hash(String(password), 12);

    const q = { _id: dec.pid, 'members._id': dec.mid, 'members.email': dec.email.toLowerCase() };
    const upd = { $set: { 'members.$.passwordHash': hash } };
    const r = await Production.updateOne(q, upd, { strict: false });

    if (!r?.modifiedCount) return res.status(400).json({ error: 'Unable to update password (invalid token/member)' });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
});

export default router;
