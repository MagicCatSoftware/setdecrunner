// src/auth.js
import { reactive, readonly, toRefs } from 'vue';
import api from './api.js';
import axios from 'axios';

/**
 * Global auth state (singleton)
 */
const HEX24 = /^[a-f0-9]{24}$/i;
const state = reactive({
  token: safeRead('token') || '',
  user: null,
  meLoaded: false,
  productionId: safeRead('currentProductionId') || '',
});

let inited = false;

/* ──────────────────────────────────────────────────────────────────────────
   Storage helpers
   ────────────────────────────────────────────────────────────────────────── */
function safeRead(key) {
  try {
    const v = localStorage.getItem(key);
    if (!v || v === 'undefined' || v === 'null') return '';
    return v;
  } catch {
    return '';
  }
}
function safeWrite(key, val) {
  try {
    if (val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch {}
}
const toId = (v) => {
  const s = String(v || '').trim();
  return HEX24.test(s) ? s : '';
};

/* ──────────────────────────────────────────────────────────────────────────
   Core setters (keep API helper in sync)
   ────────────────────────────────────────────────────────────────────────── */
function persistToken(t) {
  state.token = t || '';
  safeWrite('token', state.token);
  api.setToken(state.token);
}

function persistProductionId(pid) {
  const id = toId(pid);
  state.productionId = id;
  if (id) safeWrite('currentProductionId', id);
  else safeWrite('currentProductionId', '');
  api.setProductionId(state.productionId);
}

/* ──────────────────────────────────────────────────────────────────────────
   Bootstrap helpers to kill the “double reload” issue
   ────────────────────────────────────────────────────────────────────────── */
async function resolveProductionIdBySlug(slug) {
  if (!slug) return '';
  try {
    // Your server supports /tenant/productions/:slug
    const p = await api.get(`/tenant/productions/${slug}`);
    const pid = toId(p?._id);
    if (pid) persistProductionId(pid);
    return pid;
  } catch {
    return '';
  }
}

/**
 * Ensures production context for a slug, sets header in api.js, then hydrates /auth/me.
 * Call this RIGHT AFTER you set the token (local login, signup, or OAuth).
 */
async function bootstrapForSlug(slug) {
  // Resolve the production id first if missing or invalid
  const productionId = await axios.get('https://www.set-dec.com/api/productions/by-slug/' + slug);
  
  if (!toId(productionId.data._id)) {
    await resolveProductionIdBySlug(slug);
  } else {
    // make sure api has it
    api.setProductionId(productionId.data._id);
  }

  // Now that headers are set, fetch /auth/me so downstream sees membership immediately
  await fetchMe();
  return state.user;
}

/* ──────────────────────────────────────────────────────────────────────────
   Auth actions
   ────────────────────────────────────────────────────────────────────────── */
async function fetchMe() {
  try {
    // Ensure API carries the latest production id (important on first load)
    if (state.productionId) api.setProductionId(state.productionId);
    if (state.token) api.setToken(state.token);

    const me = await api.get('/auth/me');
    state.user = me || null;

    // (Optional) cache for faster warm start
    try { localStorage.setItem('me', JSON.stringify(state.user)); } catch {}
  } catch (e) {
    if (e.status === 401) logout();
    throw e;
  } finally {
    state.meLoaded = true;
  }
}

import { serverLogout } from './utils/serverLogout.js'; // axios POST /auth/logout (best-effort)

async function logout({ clearTenant = true } = {}) {
  // tell the server first (best-effort, don’t block UI)
  try { await serverLogout(); } catch {}

  // clear token in both memory + api helper
  persistToken('');
  state.user = null;
  state.meLoaded = false;

  // clear caches that might show previous user
  try {
    localStorage.removeItem('me');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  } catch {}

  if (clearTenant) {
    persistProductionId('');
  }

  try { window.dispatchEvent(new CustomEvent('auth:logout')); } catch {}
}

/**
 * Convenience for route guards to eject and land on the login screen of a slug.
 */
export function performLogout(router, slug) {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('currentProductionId');
    localStorage.removeItem('me');
  } catch {}
  // Keep in-memory state coherent too
  state.token = '';
  state.productionId = '';
  state.user = null;
  state.meLoaded = false;
  api.setToken('');
  api.setProductionId('');
  router.replace({ name: 'tenant-login', params: { slug } });
}

/* Optional helpers if you still use these somewhere */
async function loginLocal({ identifier, password, slug }) {
  const { token } = await api.post('/auth/login', { identifier, password, slug });
  persistToken(token);
  await bootstrapForSlug(slug);
  return state.user;
}

async function registerLocal(payload) {
  const { token } = await api.post('/auth/register', payload);
  persistToken(token);
  // No slug here; caller should immediately call bootstrapForSlug(slug)
  await fetchMe();
  return state.user;
}

/* ──────────────────────────────────────────────────────────────────────────
   Init once at app startup (e.g., App.vue onMounted -> auth.init())
   ────────────────────────────────────────────────────────────────────────── */
function init() {
  if (inited) return;
  inited = true;

  // Wire current token & production id into API helper
  api.setToken(state.token);
  if (state.productionId) api.setProductionId(state.productionId);

  // Central 401 hook → logout
  api.setUnauthorizedHandler(() => logout());

  // Cross-tab sync (token & production)
  try {
    window.addEventListener('storage', (e) => {
      if (e.key === 'token') {
        const t = safeRead('token');
        if (t !== state.token) persistToken(t);
      }
      if (e.key === 'currentProductionId') {
        const pid = safeRead('currentProductionId');
        if (pid !== state.productionId) persistProductionId(pid);
      }
    });
  } catch { /* ignore for SSR */ }

  // Warm start: hydrate user from cache (non-authoritative)
  try {
    const cached = localStorage.getItem('me');
    if (cached && !state.user) state.user = JSON.parse(cached);
  } catch {}
}

/* ──────────────────────────────────────────────────────────────────────────
   Public composable
   ────────────────────────────────────────────────────────────────────────── */
export function useAuth() {
  return {
    ...toRefs(readonly(state)),
    // lifecycle
    init,

    // setters
    setToken: persistToken,
    setProductionId: persistProductionId,

    // actions
    fetchMe,
    logout,
    loginLocal,
    registerLocal,
    bootstrapForSlug,        // 👈 expose this so pages can await it after login/OAuth
    resolveProductionIdBySlug,
  };
}

// Optional named export matching older imports
export { logout };

