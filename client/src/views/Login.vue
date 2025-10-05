<template>
  <div class="container">
    <div class="card">
      <h1 class="title">
        Access <span class="slug">/{{ route.params.slug }}</span>
      </h1>
      <p class="muted">Sign in or create an account. You must be a member of this production.</p>

      <div v-if="route.query.err === 'not-authorized'" class="warn">
        You're signed in, but not authorized for this production. Ask the owner to add you.
      </div>

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

        <button class="btn" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
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

        <button class="btn" :disabled="loading">
          {{ loading ? 'Creating…' : 'Create account' }}
        </button>

        <p class="hint">
          After creating an account, the production owner must add you as a member before you can access this production.
        </p>
      </form>

      <div class="divider">or</div>

      <div class="buttons">
  <!-- Google -->
  <a
    :href="googleUrl"
    class="oauth-btn oauth-btn--google"
    aria-label="Continue with Google"
  >
    <span class="oauth-btn__logo">
      <!-- Official 4-color “G” (inline SVG, no external asset needed) -->
      <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2045c0-.638-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.797 2.717v2.258h2.908C16.661 13.254 17.64 11.004 17.64 9.2045z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.464-.806 5.952-2.18l-2.908-2.258c-.806.54-1.837.86-3.044.86-2.341 0-4.324-1.58-5.03-3.704H.94v2.332C2.422 15.983 5.481 18 9 18z"/>
        <path fill="#FBBC05" d="M3.97 10.718a5.411 5.411 0 0 1 0-3.436V4.95H.94a8.996 8.996 0 0 0 0 8.1l3.03-2.332z"/>
        <path fill="#EA4335" d="M9 3.58c1.319 0 2.507.453 3.439 1.343l2.58-2.58C13.46.89 11.43 0 9 0 5.481 0 2.422 2.017.94 4.95l3.03 2.332C4.676 5.158 6.659 3.58 9 3.58z"/>
      </svg>
    </span>
    <span class="oauth-btn__label">Continue with Google</span>
  </a>

  <!-- Facebook -->
  <a
    :href="facebookUrl"
    class="oauth-btn oauth-btn--facebook"
    aria-label="Continue with Facebook"
  >
    <span class="oauth-btn__logo">
      <!-- Facebook “f” in blue box (brand blue) -->
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <rect width="24" height="24" rx="4" fill="#1877F2"/>
        <path fill="#fff" d="M15.33 13.5l.39-2.55h-2.43V9.18c0-.7.34-1.38 1.45-1.38h1.12V5.61s-1.02-.17-1.99-.17c-2.04 0-3.37 1.24-3.37 3.49v2.02H8.3v2.55h2.2V19h2.79v-5.5h2.04z"/>
      </svg>
    </span>
    <span class="oauth-btn__label">Continue with Facebook</span>
  </a>
</div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="help">
        <router-link to="/">← Back to product page</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiPost, apiGet } from '../api.js';
import { useAuth } from '../auth.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();

const mode = ref('signin'); // 'signin' | 'signup'
const name = ref('');
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

// slug + return destination
const slug = computed(() => String(route.params.slug || ''));
const rDest = computed(() => (route.query?.r ? String(route.query.r) : `/${slug.value}`));

// OAuth endpoints
const apiBase = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api').replace(/\/+$/, '');
const googleUrl = computed(() => `${apiBase}/auth/google?slug=${encodeURIComponent(slug.value)}&r=${encodeURIComponent(rDest.value)}`);
const facebookUrl = computed(() => `${apiBase}/auth/facebook?slug=${encodeURIComponent(slug.value)}&r=${encodeURIComponent(rDest.value)}`);

async function afterAuthNavigate() {
  // Ensure we **have** membership info before navigating
  try {
    const me = await apiGet('/auth/me'); // carries x-production-id header now
    // optional: cache to avoid flicker
    try { localStorage.setItem('user', JSON.stringify(me)); } catch {}
  } catch (_) {
    // If not authorized for this production, bounce back to login with notice
    return router.replace({ name: 'tenant-login', params: { slug: slug.value }, query: { err: 'not-authorized' } });
  }
  const r = route.query?.r && String(route.query.r);
  return router.replace(r || { name: 'tenant-home', params: { slug: slug.value } });
}

// Local sign-in
async function signIn() {
  try {
    loading.value = true;
    error.value = '';
    const { token, user } = await apiPost('/auth/local/login', {
      email: email.value,
      password: password.value,
      slug: slug.value,
    });



    // Store token in both localStorage and api helper via auth
    auth.setToken(token);
    try { localStorage.setItem('user', JSON.stringify(user)); } catch {}

    // 🔑 CRITICAL: resolve production id for this slug, set header, hydrate /auth/me
    await auth.bootstrapForSlug(slug.value);

    await afterAuthNavigate();
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Sign in failed';
  } finally {
    loading.value = false;
  }
}

// Local sign-up
async function signUp() {
  try {
    loading.value = true;
    error.value = '';
    const { token, user } = await apiPost('/auth/local/register', {
      email: email.value,
      password: password.value,
      name: name.value || undefined,
    });

    auth.setToken(token);
    try { localStorage.setItem('user', JSON.stringify(user)); } catch {}

    // You might not be a member yet; still bootstrap so /auth/me reflects reality.
    await auth.bootstrapForSlug(slug.value);

    await afterAuthNavigate();
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Registration failed';
  } finally {
    loading.value = false;
  }
}

// Handle OAuth handoff (?token=) then continue ONLY after production bootstrap
onMounted(async () => {
  const token = route.query?.token && String(route.query.token);
  if (token) {
    auth.setToken(token);
    try {
      // 🔑 resolve prod id for slug + hydrate /auth/me before navigating
      await auth.bootstrapForSlug(slug.value);
    } catch {}
    await afterAuthNavigate();
  }
});
</script>


<style scoped>
.container { max-width: 560px; margin: 48px auto; padding: 0 16px; }
.card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,.03); }
.title { margin: 0 0 6px; }
.slug { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
.muted { color: #666; margin: 0 12px 16px 0; }
.warn { background: #fff9e6; border: 1px solid #ffe08a; padding: 10px; border-radius: 8px; margin-bottom: 12px; }
.tabs { display: inline-flex; gap: 6px; margin-bottom: 12px; }
.tabs button { padding: 8px 12px; border: 1px solid #ddd; background:#f8f8f8; border-radius: 8px; cursor: pointer; }
.tabs button.active { background:#111; color:#fff; border-color:#111; }
.form { display: grid; gap: 12px; margin-top: 8px; }
.label { display: grid; gap: 6px; }
input { padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; outline: none; }
input:focus { border-color: #666; }
.btn { padding: 10px 14px; border: none; border-radius: 8px; background: #111; color: #fff; cursor: pointer; }
.btn[disabled] { opacity: .6; cursor: default; }
.buttons { display: grid; gap: 10px; margin-top: 10px; }

/* Base OAuth button */
.oauth-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 44px;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
  line-height: 1;
  transition: background-color .15s ease, border-color .15s ease, box-shadow .15s ease, transform .02s ease-in;
  user-select: none;
}

/* Logo container keeps consistent size & alignment */
.oauth-btn__logo {
  display: inline-flex;
  width: 18px;
  height: 18px;
}

/* Label styling (lets us fine-tune per brand) */
.oauth-btn__label {
  font-size: 14px;
}

/* Focus ring (both brands) */
.oauth-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(26,115,232,.2);
}

/* Press feedback */
.oauth-btn:active {
  transform: translateY(0.5px);
}

/* --- Google --- */
.oauth-btn--google {
  background: #fff;
  color: #3c4043;
  border: 1px solid #dadce0;
}

.oauth-btn--google:hover {
  background: #f7f8f8;
  border-color: #c9cccf;
}

/* --- Facebook --- */
.oauth-btn--facebook {
  background: #1877F2; /* Facebook brand blue */
  color: #fff;
  border: 1px solid #1877F2;
}

.oauth-btn--facebook:hover {
  background: #166fe0;
  border-color: #166fe0;
}

.divider { text-align: center; color: #888; margin: 14px 0; }
.error { color: #c00; margin-top: 10px; }
.hint { color:#666; font-size: 0.9rem; margin-top: 6px; }
.help { margin-top: 12px; }
</style>
