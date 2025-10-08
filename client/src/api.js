// -------- Optional helper: access the auth store without a hard import cycle.
export async function getAuth() {
  const mod = await import('./auth.js');
  return mod.useAuth();
}

// -------- Base URL (no /tenant here). Fixes "https//" typos and trims trailing slashes.
const RAW_BASE = (import.meta.env.VITE_API_BASE || '/api').trim();
const API_BASE = RAW_BASE.replace(/^https(?=\/\/)/i, 'https:').replace(/\/+$/, '');

// Token header/scheme are configurable via env:
//   VITE_TOKEN_HEADER=x-auth-token  (defaults to "Authorization")
//   VITE_TOKEN_SCHEME=Bearer        (set "" to send raw token)
const TOKEN_HEADER = (import.meta.env.VITE_TOKEN_HEADER || 'Authorization').toLowerCase();
const TOKEN_SCHEME = (import.meta.env.VITE_TOKEN_SCHEME ?? 'Bearer');

// ---------------------------------------------------------------------------
// Internal state (mirrors localStorage; synced across tabs)
// ---------------------------------------------------------------------------
let _token  = safeRead('token');
let _prodId = pickPidFromQuery() || safeRead('currentProductionId'); // prefer ?pid on first load
let _unauthHandler = null;

function safeRead(key) {
  try {
    const v = localStorage.getItem(key);
    return v && v !== 'undefined' && v !== 'null' ? v : '';
  } catch { return ''; }
}
function safeWrite(key, val) {
  try { val ? localStorage.setItem(key, val) : localStorage.removeItem(key); } catch {}
}
function notifyEnvChange() {
  try { window.dispatchEvent(new Event('storage')); } catch {}
  try { window.dispatchEvent(new Event('focus')); } catch {}
}

const HEX24 = /^[a-f0-9]{24}$/i;
function isValidPid(s) { return HEX24.test(String(s || '')); }

// Slug helpers
const RESERVED_PREFIXES = new Set([
  'owner','pricing','features','faq','purchase','thank-you','set-password',
  'login','logout','register','signup','about','contact','help','support',
  'terms','privacy','dashboard','api','assets','static','auth'
]);

function pickSlugFromQuery() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get('slug') || '';
    return String(v || '').trim().toLowerCase();
  } catch { return ''; }
}
function pickSlugFromLocation() {
  try {
    const seg = (window.location.pathname || '/')
      .split('/')
      .filter(Boolean)
      .map(s => decodeURIComponent(s).toLowerCase());
    const first = seg[0] || '';
    if (!first || RESERVED_PREFIXES.has(first)) return '';
    return first;
  } catch { return ''; }
}

// cross-tab sync
try {
  window.addEventListener('storage', (e) => {
    if (e.key === 'token') _token = safeRead('token');
    if (e.key === 'currentProductionId') _prodId = safeRead('currentProductionId');
  });
} catch {}

// Immediately persist pid from URL if present
if (_prodId) safeWrite('currentProductionId', _prodId);

// Public setters
export function setToken(t) {
  _token = t || '';
  safeWrite('token', _token);
  notifyEnvChange();
}
export function setProductionId(pid) {
  _prodId = pid || '';
  safeWrite('currentProductionId', _prodId);
  notifyEnvChange();
}
export function setUnauthorizedHandler(fn) {
  _unauthHandler = typeof fn === 'function' ? fn : null;
}

// Handy initializer for app startup
export function initFromStorage() {
  setToken(safeRead('token'));
  setProductionId(safeRead('currentProductionId'));
}

// ---------------------------------------------------------------------------
/** Resolve and persist a production id if missing/invalid. ALWAYS tries before requests. */
async function ensurePidForRequest() {
  if (isValidPid(_prodId)) return _prodId;

  // 1) Query param wins
  const fromQ = pickPidFromQuery();
  if (isValidPid(fromQ)) {
    setProductionId(fromQ);
    return _prodId;
  }

  // 2) Try to resolve by slug via public endpoint
  const ok = await tryRecoverPidFromSlug();
  return ok ? _prodId : '';
}

// ---------------------------------------------------------------------------
// URL & headers helpers
// ---------------------------------------------------------------------------
function buildUrl(path, params) {
  const base = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;

  if (params && Object.keys(params).length) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      qs.set(k, String(v));
    }
    return `${base}${base.includes('?') ? '&' : '?'}${qs.toString()}`;
  }
  return base;
}

function toLowerKeys(obj = {}) {
  const out = {};
  for (const k of Object.keys(obj)) out[k.toLowerCase()] = obj[k];
  return out;
}

function applyTokenHeader(h) {
  if (!_token) return;
  if (TOKEN_HEADER === 'authorization') {
    const scheme = (TOKEN_SCHEME ?? 'Bearer').toString().trim();
    h['Authorization'] = scheme ? `${scheme} ${_token}` : _token;
  } else {
    h[TOKEN_HEADER] = _token;
  }
}

function buildHeaders(extra = {}, { isForm = false, hasBody = false } = {}) {
  const extraL = toLowerKeys(extra);
  const h = { Accept: 'application/json', ...(extra || {}) };

  // Only set Content-Type for JSON bodies (FormData sets its own)
  if (hasBody && !isForm && !('Content-Type' in h)) {
    h['Content-Type'] = 'application/json';
  }

  // Freshen token/pid from storage on every request
  if (!_token)  _token  = safeRead('token');
  if (!_prodId) _prodId = safeRead('currentProductionId');

  // Auth token (unless caller already set it)
  const hasAuthHeader = ('authorization' in extraL) || (TOKEN_HEADER in extraL);
  if (!hasAuthHeader) applyTokenHeader(h);

  // 🔒 ALWAYS send tenant headers
  h['X-Production-Id']   = _prodId || '';
  h['X-Production-Slug'] = pickSlugFromQuery() || pickSlugFromLocation() || '';

  if (!('X-Requested-With' in h)) h['X-Requested-With'] = 'fetch';
  return h;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper with auto PID recovery + safe retries
// ---------------------------------------------------------------------------
export async function apiFetch(method, path, { params, body, headers, credentials } = {}) {
  // Always re-read latest token/pid right before the call
  if (!_token)  _token  = safeRead('token');
  if (!_prodId) _prodId = safeRead('currentProductionId');

  // Proactively resolve a PID if we don't have a valid one yet
  if (!isValidPid(_prodId)) {
    await ensurePidForRequest();
  }

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const url = buildUrl(path, params);

  // Never send a body on GET/HEAD
  const sendBody = body != null && !/^get|head$/i.test(method);

  const extra = { ...(headers || {}) };
  const alreadyRetried = extra['x-api-retried'] === '1';

  let res;
  try {
    res = await fetch(url, {
      method,
      mode: 'cors',
      credentials: credentials || 'omit', // flip to 'include' if you rely on cookies
      headers: buildHeaders(
        { ...extra, ...(alreadyRetried ? { 'x-api-retried': '1' } : {}) },
        { isForm, hasBody: sendBody }
      ),
      body: isForm ? body : (sendBody ? JSON.stringify(body) : undefined),
    });
  } catch (netErr) {
    const err = new Error(`Network error calling ${method.toUpperCase()} ${url}. ${netErr?.message || netErr}`);
    err.status = 0;
    err.cause = netErr;
    throw err;
  }

  const ct = (res.headers.get('content-type') || '').toLowerCase();
  let data = null;
  try {
    if (ct.includes('application/json') || ct.includes('+json')) {
      data = await res.json();
    } else {
      const txt = await res.text();
      try { data = txt ? JSON.parse(txt) : null; } catch { data = txt || null; }
    }
  } catch { data = null; }

  if (!res.ok) {
    // 400 that looks PID-related → try to recover PID by slug and retry ONCE
    if (res.status === 400 && !alreadyRetried && shouldAttemptPidRecovery(data)) {
      const recovered = await tryRecoverPidFromSlug();
      if (recovered) {
        return apiFetch(method, path, {
          params,
          body,
          headers: { ...extra, 'x-api-retried': '1' },
          credentials,
        });
      }
    }

    // Unauthorized → delegate to router handler if present
    if ((res.status === 401 || res.status === 403) && _unauthHandler) {
      try { _unauthHandler(); } catch {}
    }

    const msg =
      (data && (data.error || data.message || (typeof data === 'string' ? data : ''))) ||
      `${res.status} ${res.statusText}` || 'Request failed';
    const err = new Error(msg);
    err.status = res.status;
    err.response = { status: res.status, data };
    throw err;
  }

  return data;
}

// Heuristics to detect pid-related 400s from backend
function shouldAttemptPidRecovery(data) {
  const s = typeof data === 'string' ? data : (data && (data.error || data.message)) || '';
  if (!s) return false;
  const t = s.toLowerCase();
  return (
    t.includes('x-production-id') ||
    t.includes('production id') ||
    t.includes('missing x-production-id') ||
    t.includes('invalid production id') ||
    t.includes('not authorized for this production')
  );
}

// Try to recover pid by reading ?pid=… or resolving by slug → GET /productions/by-slug/:slug
async function tryRecoverPidFromSlug() {
  // 1) Query param
  const pid = pickPidFromQuery();
  if (isValidPid(pid)) { setProductionId(pid); return true; }

  // 2) Slug from ?slug= or first path segment
  const slug = (pickSlugFromQuery() || pickSlugFromLocation() || '').trim();
  if (!slug) return false;

  // 3) Resolve pid using an endpoint that does NOT require x-production-id
  try {
    const url = buildUrl(`/productions/by-slug/${encodeURIComponent(slug)}`);
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'fetch',
        'X-Production-Slug': slug, // hint to backend logs/metrics
      },
    });
    if (!res.ok) return false;
    const p = await res.json().catch(() => null);
    const found = p && (p._id || p.id);
    if (isValidPid(found)) {
      setProductionId(String(found));
      return true;
    }
  } catch {}
  return false;
}

// Read pid from current URL query (?pid=, ?productionId=, ?production_id=)
function pickPidFromQuery() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const pid = sp.get('pid') || sp.get('productionId') || sp.get('production_id');
    const v = pid ? String(pid).trim() : '';
    return isValidPid(v) ? v : '';
  } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Friendly helpers
// ---------------------------------------------------------------------------
export function apiGet(path, params, options = {}) {
  return apiFetch('GET', path, { params, ...(options || {}) });
}
export function apiPost(path, body, options = {}) {
  return apiFetch('POST', path, { body, ...(options || {}) });
}
export function apiPut(path, body, options = {}) {
  return apiFetch('PUT', path, { body, ...(options || {}) });
}
export function apiPatch(path, body, options = {}) {
  return apiFetch('PATCH', path, { body, ...(options || {}) });
}
export function apiDel(path, bodyOrParams, options = {}) {
  const hasBody =
    bodyOrParams &&
    typeof bodyOrParams === 'object' &&
    !(bodyOrParams instanceof URLSearchParams) &&
    !(typeof FormData !== 'undefined' && bodyOrParams instanceof FormData);
  return apiFetch('DELETE', path, hasBody
    ? { body: bodyOrParams, ...(options || {}) }
    : { params: bodyOrParams, ...(options || {}) }
  );
}

// Axios-like names
function get(path, options = {}) { return apiFetch('GET', path, options); }
function post(path, body, options = {}) { return apiFetch('POST', path, { body, ...(options || {}) }); }
function put(path, body, options = {}) { return apiFetch('PUT', path, { body, ...(options || {}) }); }
function patch(path, body, options = {}) { return apiFetch('PATCH', path, { body, ...(options || {}) }); }
function del(path, options = {}) { return apiFetch('DELETE', path, options); }

// Default export
const api = {
  // state setters
  setToken,
  setProductionId,
  setUnauthorizedHandler,
  initFromStorage,
  // methods
  fetch: apiFetch,
  get, post, put, patch, del,
  // utils
  buildUrl,
};

export default api;



