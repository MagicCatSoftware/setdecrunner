<template>
  <PublicNav />

  <div class="login">
    <div class="login__card">
      <h2 class="login__title">
        Set your password
        <span v-if="title" class="small muted">for {{ title }}</span>
      </h2>

      <form class="flex col gap-2" @submit.prevent="submit">
        <div v-if="resolving" class="text-muted">Validating your link…</div>

        <div v-else>
          <div v-if="email" class="small muted">Account: {{ email }}</div>

          <input
            class="input"
            v-model.trim="password"
            type="password"
            placeholder="New password (min 8 chars)"
            minlength="8"
            required
            autocomplete="new-password"
          />
          <input
            class="input"
            v-model.trim="confirm"
            type="password"
            placeholder="Confirm password"
            minlength="8"
            required
            autocomplete="new-password"
          />

          <button class="btn btn--primary" :disabled="loading || resolving || !token">
            {{ (loading || resolving) ? 'Working…' : 'Set password' }}
          </button>
        </div>

        <p v-if="msg" class="text-muted">{{ msg }}</p>
        <p v-if="err" class="login__error">{{ err }}</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../api.js';
import PublicNav from '../components/PublicNav.vue';

const router = useRouter();
const route  = useRoute();

const token    = ref('');
const email    = ref('');
const title    = ref('');
const slug     = ref('');        // returned by verify endpoint
const memberId = ref('');
const prodId   = ref('');

const password = ref('');
const confirm  = ref('');

const loading   = ref(false);
const resolving = ref(false);
const msg       = ref('');
const err       = ref('');

/** Validate the token and fetch display info (email, production title, slug) */
async function verifyToken() {
  if (!token.value) { err.value = 'Missing reset token in URL.'; return; }
  resolving.value = true; err.value = ''; msg.value = '';

  try {
    // Explicitly drop Authorization on public endpoint (defensive; ok if your api ignores).
    const info = await api.get(
      `/tenant/tenantauth/set-password/verify`,
      { params: { token: token.value }, headers: { Authorization: '' } }
    );

    // Expected shape:
    // { ok, productionId, slug, email, memberId, title }
    prodId.value   = String(info.productionId || '');
    slug.value     = String(info.slug || '');
    email.value    = String(info.email || '');
    memberId.value = String(info.memberId || '');
    title.value    = String(info.title || '');

  } catch (e) {
    err.value = e?.response?.data?.error || 'Invalid or expired link.';
  } finally {
    resolving.value = false;
  }
}

onMounted(async () => {
  token.value = String(route.query.token || '');
  await verifyToken();
});

async function submit() {
  if (!token.value) { err.value = 'Missing reset token.'; return; }
  if (password.value.length < 8) { err.value = 'Password must be at least 8 characters.'; return; }
  if (password.value !== confirm.value) { err.value = 'Passwords do not match.'; return; }

  loading.value = true; err.value = ''; msg.value = '';
  try {
    await api.post(
      '/tenant/tenantauth/set-password',
      { token: token.value, password: password.value },
      { headers: { Authorization: '' } }
    );

    msg.value = 'Password set! You can now sign in.';
    // Prefer redirect to the tenant login for this production
    const s = slug.value || route.params.slug || route.query.slug || '';
    setTimeout(() => {
      if (s) router.replace({ name: 'tenant-login', params: { slug: s } });
      else router.replace({ name: 'marketing' });
    }, 800);
  } catch (e) {
    err.value = e?.response?.data?.error || 'Failed to set password.';
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

