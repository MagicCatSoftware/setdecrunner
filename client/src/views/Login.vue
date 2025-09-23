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
        <a :href="googleUrl" class="btn btn--oauth">Continue with Google</a>
        <a :href="facebookUrl" class="btn btn--oauth">Continue with Facebook</a>
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


const route = useRoute();
const router = useRouter();

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
const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
const googleUrl = computed(() => `${apiBase}/auth/google?slug=${encodeURIComponent(slug.value)}&r=${encodeURIComponent(rDest.value)}`);
const facebookUrl = computed(() => `${apiBase}/auth/facebook?slug=${encodeURIComponent(slug.value)}&r=${encodeURIComponent(rDest.value)}`);

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
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    const r = route.query?.r && String(route.query.r);
    router.replace(r || { name: 'tenant-home', params: { slug: slug.value } });
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
    // Store token & user so they’re signed in immediately
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));

    // Try to go to dashboard — guards will bounce back with ?err=not-authorized if not a member
    const r = route.query?.r && String(route.query.r);
    router.replace(r || { name: 'tenant-home', params: { slug: slug.value } });
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Registration failed';
  } finally {
    loading.value = false;
  }
}

// Handle OAuth handoff (?token=) then continue to r or /:slug
onMounted(async () => {
  const token = route.query?.token && String(route.query.token);
  if (token) {
    localStorage.setItem('token', token);
    try {
      const user = await apiGet('/auth/me');
      localStorage.setItem('user', JSON.stringify(user));
    } catch {}
    const r = route.query?.r && String(route.query.r);
    router.replace(r || { name: 'tenant-home', params: { slug: slug.value } });
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
.btn--oauth { display: inline-block; text-align: center; background: #2d6cdf; }
.divider { text-align: center; color: #888; margin: 14px 0; }
.error { color: #c00; margin-top: 10px; }
.hint { color:#666; font-size: 0.9rem; margin-top: 6px; }
.help { margin-top: 12px; }
</style>
