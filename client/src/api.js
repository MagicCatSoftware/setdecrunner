// client/src/api.js

// Optional helper: access the auth store without creating a hard import cycle.
// Usage (async): const auth = await getAuth(); auth.setToken(...), auth.setProductionId(...);
// Optional helper: access the auth store without a hard import cycle.
export async function getAuth() {
  const mod = await import('./auth.js');
  return mod.useAuth();
}

// ⚠️ Base WITHOUT /tenant — put /tenant in the path you pass in.
const API_BASE = (import.meta.env.VITE_API_BASE || 'https//set-dec.com/api').replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Internal state (mirrors localStorage; synced across tabs)
// ---------------------------------------------------------------------------
let _token = safeRead('token');
let _prodId = pickPidFromQuery() || safeRead('currentProductionId'); // prefer ?pid on first load
let _unauthHandler = null;

function safeRead(key) {
  try {
    const v = localStorage.getItem(key);
    return v && v !== 'undefined' && v !== 'null' ? v : '';
  } catch { return ''; }
}
function safeWrite(key, val) {
  try {
    if (val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch {}
}
// sync across tabs
try {
  window.addEventListener('storage', (e) => {
    if (e.key === 'token') _token = safeRead('token');
    if (e.key === 'currentProductionId') _prodId = safeRead('currentProductionId');
  });
} catch {}

// Immediately persist pid from OAuth callback if present
if (_prodId) safeWrite('currentProductionId', _prodId);

// ---------------------------------------------------------------------------
// Public setters – call after login and after you know the pid
// ---------------------------------------------------------------------------
export function setToken(t) {
  _token = t || '';
  safeWrite('token', _token);
}
export function setProductionId(pid) {
  _prodId = pid || '';
  safeWrite('currentProductionId', _prodId);
}
export function setUnauthorizedHandler(fn) {
  _unauthHandler = typeof fn === 'function' ? fn : null;
}

// ---------------------------------------------------------------------------
// URL & headers helpers
// ---------------------------------------------------------------------------
function buildUrl(path, params) {
  const base = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!params || Object.keys(params).length === 0) return base;

  // Build relative to API_BASE origin to avoid oddities
  const url = new URL(base, API_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function buildHeaders(extra = {}, { isForm = false, hasBody = false } = {}) {
  const h = { Accept: 'application/json', ...(extra || {}) };

  // Only set Content-Type for actual JSON bodies
  if (hasBody && !isForm && !('Content-Type' in h)) {
    h['Content-Type'] = 'application/json';
  }

  if (_token && !('Authorization' in h)) h.Authorization = `Bearer ${_token}`;
  if (_prodId && !('x-production-id' in h)) h['x-production-id'] = _prodId;

  return h;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper with automatic pid resolution & single retry
// ---------------------------------------------------------------------------
export async function apiFetch(method, path, { params, body, headers } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const url = buildUrl(path, params);

  // Never send a body on GET/HEAD
  const sendBody = body != null && !/^get|head$/i.test(method);

  // One-shot retry guard
  const alreadyRetried = headers && headers['x-api-retried'] === '1';

  let res;
  try {
    res = await fetch(url, {
      method,
      mode: 'cors',
      credentials: 'omit', // set to 'include' if you use cookies
      headers: buildHeaders({ ...(headers || {}), ...(alreadyRetried ? { 'x-api-retried': '1' } : {}) }, { isForm, hasBody: sendBody }),
      body: isForm ? body : (sendBody ? JSON.stringify(body) : undefined),
    });
  } catch (netErr) {
    const err = new Error(
      `Network error calling ${method.toUpperCase()} ${url}. ${netErr?.message || netErr}`
    );
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
    // If we got a 400 and it *looks like* a missing/invalid production id, attempt to resolve via slug and retry ONCE
    if (res.status === 400 && !alreadyRetried && shouldAttemptPidRecovery(data)) {
      const recovered = await tryRecoverPidFromSlug();
      if (recovered) {
        // retry the original request once with a marker to avoid loops
        return apiFetch(method, path, {
          params,
          body,
          headers: { ...(headers || {}), 'x-api-retried': '1' },
        });
      }
    }

    if ((res.status === 401 || res.status === 403) && import.meta.env.MODE !== 'production') {
      console.warn(`[api] ${method} ${url} -> ${res.status}`, {
        tokenPresent: !!_token,
        prodId: _prodId || '(none)',
        body: sendBody ? body : undefined,
      });
    }
    const msg =
      (data && (data.error || data.message || (typeof data === 'string' ? data : ''))) ||
      `${res.status} ${res.statusText}` ||
      'Request failed';
    const err = new Error(msg);
    err.status = res.status;
    err.response = { status: res.status, data };
    if (res.status === 401 && _unauthHandler) {
      try { _unauthHandler(); } catch {}
    }
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

// Try to recover pid by reading ?pid=… or resolving by /:slug → GET /tenant/productions/:slug
async function tryRecoverPidFromSlug() {
  // 1) Query param wins
  const pid = pickPidFromQuery();
  if (pid) {
    setProductionId(pid);
    return true;
  }

  // 2) Parse slug from current location: "/:slug(/…)?"
  let slug = '';
  try {
    const seg = (window.location.pathname || '/').split('/').filter(Boolean);
    slug = seg[0] || '';
  } catch {}
  if (!slug) return false;

  // 3) Resolve pid using a direct fetch that does NOT require x-production-id
  try {
    const url = buildUrl(`/tenant/productions/${encodeURIComponent(slug)}`);
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: buildHeaders({}, { isForm: false, hasBody: false }), // adds token if present, NO x-production-id
    });
    if (!res.ok) return false;
    const p = await res.json().catch(() => null);
    const found = p && (p._id || p.id);
    if (found && /^[a-f0-9]{24}$/i.test(String(found))) {
      setProductionId(String(found));
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

// Read pid from current URL query (?pid=, ?productionId=, ?production_id=)
function pickPidFromQuery() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const pid = sp.get('pid') || sp.get('productionId') || sp.get('production_id');
    const v = pid ? String(pid).trim() : '';
    return v && /^[a-f0-9]{24}$/i.test(v) ? v : '';
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

// Axios-like names (if you use api.get('/path', { params, headers }))
function get(path, options = {}) { return apiFetch('GET', path, options); }
function post(path, body, options = {}) { return apiFetch('POST', path, { body, ...(options || {}) }); }
function patch(path, body, options = {}) { return apiFetch('PATCH', path, { body, ...(options || {}) }); }
function del(path, options = {}) { return apiFetch('DELETE', path, options); }

// Default export
const api = {
  // state setters
  setToken,
  setProductionId,
  setUnauthorizedHandler,
  // methods
  fetch: apiFetch,
  get, post, patch, del,
  // utils
  buildUrl,
};

export default api;