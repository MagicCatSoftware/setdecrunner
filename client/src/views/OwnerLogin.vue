<!-- client/src/views/OwnerLogin.vue -->
<template>
  <div class="container">
    <div class="card">
      <h1 class="title">Owner access</h1>
      <p class="muted">Sign in to manage your productions.</p>

      <div class="tabs">
        <button :class="{ active: mode==='signin' }" @click="mode='signin'">Sign in</button>
        <button :class="{ active: mode==='signup' }" @click="mode='signup'">Create account</button>
      </div>

      <!-- Sign in -->
      <form v-if="mode==='signin'" class="form" @submit.prevent="signIn">
        <label class="label">
          <span>Email</span>
          <input v-model.trim="email" type="email" required autocomplete="email" placeholder="you@example.com" />
        </label>

        <label class="label">
          <span>Password</span>
          <input v-model="password" type="password" required autocomplete="current-password" placeholder="••••••••" />
        </label>

        <button class="btn" :disabled="loading">{{ loading ? 'Signing in…' : 'Sign in' }}</button>
      </form>

      <!-- Sign up -->
      <form v-else class="form" @submit.prevent="signUp">
        <label class="label">
          <span>Name</span>
          <input v-model.trim="name" type="text" autocomplete="name" placeholder="Your name" />
        </label>

        <label class="label">
          <span>Email</span>
          <input v-model.trim="email" type="email" required autocomplete="email" placeholder="you@example.com" />
        </label>

        <label class="label">
          <span>Password</span>
          <input v-model="password" type="password" required autocomplete="new-password" placeholder="Minimum 8 characters" />
        </label>

        <button class="btn" :disabled="loading">{{ loading ? 'Creating…' : 'Create account' }}</button>
      </form>

      <div class="divider">or</div>

      <!-- Brand-accurate OAuth buttons -->
      <div class="buttons">
        <a :href="googleUrl" class="oauth-btn oauth-btn--google" aria-label="Continue with Google">
          <span class="oauth-btn__logo">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2045c0-.638-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.797 2.717v2.258h2.908C16.661 13.254 17.64 11.004 17.64 9.2045z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.464-.806 5.952-2.18l-2.908-2.258c-.806.54-1.837.86-3.044.86-2.341 0-4.324-1.58-5.03-3.704H.94v2.332C2.422 15.983 5.481 18 9 18z"/>
              <path fill="#FBBC05" d="M3.97 10.718a5.411 5.411 0 0 1 0-3.436V4.95H.94a8.996 8.996 0 0 0 0 8.1l3.03-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.319 0 2.507.453 3.439 1.343l2.58-2.58C13.46.89 11.43 0 9 0 5.481 0 2.422 2.017.94 4.95l3.03 2.332C4.676 5.158 6.659 3.58 9 3.58z"/>
            </svg>
          </span>
          <span class="oauth-btn__label">Continue with Google</span>
        </a>

        <a :href="facebookUrl" class="oauth-btn oauth-btn--facebook" aria-label="Continue with Facebook">
          <span class="oauth-btn__logo">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect width="24" height="24" rx="4" fill="#1877F2"/>
              <path fill="#fff" d="M15.33 13.5l.39-2.55h-2.43V9.18c0-.7.34-1.38 1.45-1.38h1.12V5.61s-1.02-.17-1.99-.17c-2.04 0-3.37 1.24-3.37 3.49v2.02H8.3v2.55h2.2V19h2.79v-5.5h2.04z"/>
            </svg>
          </span>
          <span class="oauth-btn__label">Continue with Facebook</span>
        </a>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <div class="help"><router-link to="/">← Back to product page</router-link></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api, { apiPost, apiGet } from '../api.js';
import { useAuth } from '../auth.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();

const mode = ref('signin');
const name = ref(''); const email = ref(''); const password = ref('');
const loading = ref(false); const error = ref('');

// Ensure owner area doesn’t require a production id
try { api.setProductionId(''); } catch {}

const apiBase = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api').replace(/\/+$/, '');
const rDest = computed(() => (route.query?.r ? String(route.query.r) : '/owner'));

// OAuth URLs (include owner=1 and the return path)
const googleUrl = computed(() =>
  `${apiBase}/auth/google?owner=1&prompt=select_account&r=${encodeURIComponent(rDest.value)}`
);
const facebookUrl = computed(() =>
  `${apiBase}/auth/facebook?owner=1&r=${encodeURIComponent(rDest.value)}`
);

// ----- helpers -----
function persistToken(t) {
  const v = t || '';
  if (!v) return false;
  try { auth.setToken(v); } catch {}
  try { localStorage.setItem('token', v); } catch {}
  try { api.setToken(v); } catch {}
  // Wake up any UIs that watch focus/storage/custom events
  try { window.dispatchEvent(new CustomEvent('auth:changed', { detail: { token: v } })); } catch {}
  try { window.dispatchEvent(new Event('focus')); } catch {}
  return true;
}

async function afterAuthNavigate() {
  // Hydrate user (no x-production-id required in owner mode)
  try {
    const me = await apiGet('/auth/me');
    try { localStorage.setItem('user', JSON.stringify(me)); } catch {}
  } catch { /* swallow; token might still be valid for owner endpoints */ }
  return router.replace(rDest.value || '/owner');
}

function parseTokenFromUrl() {
  // 1) query params
  const q = route.query || {};
  const qToken = (q.token || q.t || q.access_token) && String(q.token || q.t || q.access_token);
  if (qToken) return qToken;

  // 2) from hash (#token=... or #access_token=...)
  const hash = window.location.hash || '';
  if (hash && hash.includes('=')) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const h = params.get('token') || params.get('t') || params.get('access_token');
    if (h) return String(h);
  }
  return '';
}

function stripTokenFromUrl() {
  const nextQuery = { ...(route.query || {}) };
  delete nextQuery.token; delete nextQuery.t; delete nextQuery.access_token;
  router.replace({ path: route.path, query: nextQuery, hash: '' });
}

// ----- local auth -----
async function signIn() {
  try {
    loading.value = true; error.value = '';
    const { token, user } = await apiPost('/auth/local/login', { email: email.value, password: password.value });
    persistToken(token);
    try { localStorage.setItem('user', JSON.stringify(user)); } catch {}
    await afterAuthNavigate();
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Sign in failed';
  } finally { loading.value = false; }
}

async function signUp() {
  try {
    loading.value = true; error.value = '';
    const { token, user } = await apiPost('/auth/local/register', {
      email: email.value, password: password.value, name: name.value || undefined,
    });
    persistToken(token);
    try { localStorage.setItem('user', JSON.stringify(user)); } catch {}
    await afterAuthNavigate();
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Registration failed';
  } finally { loading.value = false; }
}

// ----- OAuth handoff -----
onMounted(async () => {
  const token = parseTokenFromUrl();
  if (token) {
    persistToken(token);
    // remove token from URL so refreshes don't re-run handoff
    stripTokenFromUrl();
    await afterAuthNavigate();
  }
});
</script>

<style scoped>
.container { max-width: 560px; margin: 48px auto; padding: 0 16px; }
.card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,.03); }
.title { margin: 0 0 6px; }
.muted { color: #666; margin: 0 12px 16px 0; }
.tabs { display: inline-flex; gap: 6px; margin-bottom: 12px; }
.tabs button { padding: 8px 12px; border: 1px solid #ddd; background:#f8f8f8; border-radius: 8px; cursor: pointer; }
.tabs button.active { background:#111; color:#fff; border-color:#111; }
.form { display: grid; gap: 12px; margin-top: 8px; }
.label { display: grid; gap: 6px; }
input { padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; outline: none; }
input:focus { border-color: #666; }
.btn { padding: 10px 14px; border: none; border-radius: 8px; background: #111; color: #fff; cursor: pointer; }
.btn[disabled] { opacity: .6; cursor: default; }
.divider { text-align: center; color: #888; margin: 14px 0; }
.error { color: #c00; margin-top: 10px; }
.buttons { display: grid; gap: 10px; margin-top: 10px; }
.oauth-btn { display:inline-flex; align-items:center; justify-content:center; gap:10px; height:44px; border-radius:6px; text-decoration:none; font-weight:600; transition: background-color .15s, border-color .15s, box-shadow .15s, transform .02s; user-select:none; }
.oauth-btn__logo { display:inline-flex; width:18px; height:18px; }
.oauth-btn__label { font-size:14px; }
.oauth-btn:focus-visible { outline:none; box-shadow:0 0 0 3px rgba(26,115,232,.2); }
.oauth-btn:active { transform: translateY(0.5px); }
.oauth-btn--google { background:#fff; color:#3c4043; border:1px solid #dadce0; }
.oauth-btn--google:hover { background:#f7f8f8; border-color:#c9cccf; }
.oauth-btn--facebook { background:#1877F2; color:#fff; border:1px solid #1877F2; }
.oauth-btn--facebook:hover { background:#166fe0; border-color:#166fe0; }
</style>
