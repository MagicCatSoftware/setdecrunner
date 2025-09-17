import { useAuth } from './auth.js'
export function getAuth() {
  return useAuth()  // called from components (safe) or after main mounts
}
// client/src/api.js
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api/tenant').replace(/\/+$/, '')
function getToken() {
  const t = localStorage.getItem('token');
  return t && t !== 'undefined' && t !== 'null' ? t : '';
}

function getProductionId() {
  return localStorage.getItem('currentProductionId') || '';
}

function buildUrl(path, params) {
  const base = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!params || Object.keys(params).length === 0) return base;
  const url = new URL(base, window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function apiFetch(method, path, { params, body, headers } = {}) {
  const token = getToken();
  const prodId = getProductionId();

  // auto JSON unless body is FormData
  const isForm = body instanceof FormData;
  const url = buildUrl(path, params);

  const res = await fetch(url, {
    method,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(prodId ? { 'x-production-id': prodId } : {}),
      ...(headers || {}),
    },
    body: isForm ? body : body != null ? JSON.stringify(body) : undefined,
    credentials: 'omit',
  });

  // Try parse JSON either way to get error details
  let data = null;
  const text = await res.text().catch(() => '');
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const err = new Error(
      (data && (data.error || data.message)) ||
      `${res.status} ${res.statusText}`
    );
    err.status = res.status;
    err.body = data || null;
    // small hint in dev console for 401/403 cases
    if (process.env.NODE_ENV !== 'production' && (res.status === 401 || res.status === 403)) {
      console.warn(`[api] ${method} ${url} -> ${res.status}`, { prodId, tokenPresent: !!token, body });
    }
    throw err;
  }

  return data;
}

function apiGet(path, params, options = {}) {
  
  return apiFetch('GET', path, { params, ...(options || {}) });
}
function apiPost(path, body, options = {}) {
  return apiFetch('POST', path, { body, ...(options || {}) });
}
function apiPatch(path, body, options = {}) {
  return apiFetch('PATCH', path, { body, ...(options || {}) });
}
function apiDel(path, bodyOrParams, options = {}) {
  // Allow DELETE with body (JSON) or just params
  const hasBody = bodyOrParams && (typeof bodyOrParams === 'object') && !('toString' in bodyOrParams) && !('append' in bodyOrParams);
  return apiFetch('DELETE', path, hasBody ? { body: bodyOrParams, ...(options || {}) } : { params: bodyOrParams, ...(options || {}) });
}

const api = { get: apiGet, post: apiPost, patch: apiPatch, del: apiDel, fetch: apiFetch };

export { apiFetch, apiGet, apiPost, apiPatch, apiDel };
export default api;