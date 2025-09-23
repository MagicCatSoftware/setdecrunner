<template>

  <div class="login">
    <div class="login__card">
      <h2 class="login__title">Set your password</h2>

      <form class="flex col gap-2" @submit.prevent="submit">
        <input class="input" v-model.trim="password" type="password" placeholder="New password (min 8 chars)" required />
        <input class="input" v-model.trim="confirm"  type="password" placeholder="Confirm password" required />
        <button class="btn btn--primary" :disabled="loading || resolving">
          {{ (loading || resolving) ? 'Working…' : 'Set password' }}
        </button>

        <p v-if="resolving" class="text-muted">Resolving production…</p>
        <p v-if="msg" class="text-muted">{{ msg }}</p>
        <p v-if="err" class="login__error">{{ err }}</p>
      </form>
    </div>
  </div>
</template>

<script setup>

import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../api.js';

const router = useRouter();
const route  = useRoute();

const token = ref('');
const email = ref('');
const password = ref('');
const confirm  = ref('');

const loading = ref(false);
const resolving = ref(false);
const msg = ref('');
const err = ref('');

// Support either /:slug/set-password or /set-password?slug=...
const slug = computed(() => route.params.slug || route.query.slug || '');
const productionId = ref('');

// Try several common endpoints to resolve slug -> productionId.
// If none succeed, we'll still send the slug so the backend can resolve.
async function resolveProductionIdBySlug(slugVal) {
  if (!slugVal) return '';
  resolving.value = true;
  try {
    // 1) /productions/slug/:slug -> { _id,... }
    try {
      const p1 = await api.get(`/productions/slug/${encodeURIComponent(slugVal)}`);
      if (p1 && (p1._id || p1.id)) return p1._id || p1.id;
    } catch (_) {}

    // 2) /productions/by-slug/:slug -> { _id,... }
    try {
      const p2 = await api.get(`/productions/by-slug/${encodeURIComponent(slugVal)}`);
      if (p2 && (p2._id || p2.id)) return p2._id || p2.id;
    } catch (_) {}

    // 3) /productions?slug=foo -> [ ... ]
    try {
      const list = await api.get('/productions', { params: { slug: slugVal } });
      if (Array.isArray(list) && list.length) {
        const first = list[0];
        if (first && (first._id || first.id)) return first._id || first.id;
      }
    } catch (_) {}

    return '';
  } finally {
    resolving.value = false;
  }
}

onMounted(async () => {
  token.value = route.query.token || '';
  email.value = route.query.email || '';
  if (!token.value) err.value = 'Missing reset token in URL.';
  if (slug.value) {
    productionId.value = await resolveProductionIdBySlug(slug.value);
  }
});

async function submit() {
  if (password.value.length < 8) { err.value = 'Password must be at least 8 characters'; return; }
  if (password.value !== confirm.value) { err.value = 'Passwords do not match'; return; }
  if (!token.value) { err.value = 'Missing reset token.'; return; }

  try {
    loading.value = true; err.value = ''; msg.value = '';

    const body = {
      token: token.value,
      password: password.value,
      // include these if available; backend can use either
      ...(email.value ? { email: email.value } : {}),
      ...(slug.value ? { slug: slug.value } : {}),
      ...(productionId.value ? { productionId: productionId.value } : {}),
    };

    await api.post('/auth/complete-reset', body);

    msg.value = 'Password set! You can now sign in.';
    // Prefer tenant login if slug exists
    if (slug.value) {
      router.replace({ name: 'tenant-login', params: { slug: slug.value } });
    } else {
      router.replace('/login');
    }
  } catch (e) {
    err.value = e?.response?.data?.error || e.message || 'Failed to set password';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f5f6fa;
}
.login__card {
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,.04);
  padding: 24px;
  width: 100%;
  max-width: 420px;
}
.login__title { margin-bottom: 12px; font-weight: 700; font-size: 22px; }
.input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; }
.btn { padding: 10px 14px; border-radius: 10px; }
.btn--primary { background: #111; color: #fff; }
.text-muted { color: #6c737f; font-size: 13px; }
.login__error { color: #d22; font-size: 14px; }
.flex.col { display: flex; flex-direction: column; }
.gap-2 { gap: 8px; }
</style>

