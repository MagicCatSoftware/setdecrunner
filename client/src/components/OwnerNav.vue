<template>
  <header class="owner-nav">
    <div class="container row">
      <div class="left">
        <RouterLink class="brand" to="/owner">Owner Console</RouterLink>
      </div>

      <nav class="right">
        <!-- When NOT logged in, show only login -->
        <RouterLink v-if="!isAuthed" class="link" to="/owner/login">Owner login</RouterLink>

        <!-- When logged in, show the owner controls -->
        <template v-else>
          <RouterLink class="link" to="/owner">My Productions</RouterLink>
          <RouterLink class="link" to="/purchase" title="Create a new production">Create Production</RouterLink>
          <RouterLink class="link" to="/owner/logout" title="Sign out">Logout</RouterLink>

          <div class="userchip" :title="email || name">
            <span class="avatar">{{ initials }}</span>
            <span class="uname">{{ name || email || 'Owner' }}</span>
          </div>
        </template>
      </nav>
    </div>
  </header>
</template>

<script setup>
import { RouterLink, useRouter } from 'vue-router';
import { ref, computed, onMounted } from 'vue';

const router = useRouter();

const token = ref('');
const user  = ref(null);

function readToken() {
  try {
    const t = localStorage.getItem('token');
    return t && t !== 'undefined' && t !== 'null' ? t : '';
  } catch { return ''; }
}
function readUser() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    return u && typeof u === 'object' ? u : null;
  } catch { return null; }
}

function decodeJwtPayload(t) {
  try {
    const parts = t.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch { return null; }
}

const isAuthed = computed(() => {
  if (!token.value) return false;
  const payload = decodeJwtPayload(token.value);
  if (!payload) return false;
  if (payload.exp && Date.now() >= payload.exp * 1000) return false;
  return true;
});

const name  = computed(() => user.value?.name || '');
const email = computed(() => user.value?.email || '');
const initials = computed(() => {
  const src = (name.value || email.value || '').trim();
  if (!src) return 'U';
  const parts = src.split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  return s.toUpperCase() || src[0].toUpperCase();
});

function refreshAuth() {
  token.value = readToken();
  user.value  = readUser();
}

onMounted(() => {
  refreshAuth();
  // keep in sync across tabs/windows
  window.addEventListener('storage', (e) => {
    if (e.key === 'token' || e.key === 'user') refreshAuth();
  });
});
</script>

<style scoped>
.owner-nav { border-bottom:1px solid #eee; background:#fff; position: sticky; top: 0; z-index: 40; }
.container { max-width: 1100px; margin: 0 auto; padding: 10px 16px; }
.row { display:flex; align-items:center; justify-content:space-between; gap: 12px; }
.brand { font-weight:700; text-decoration:none; color:#111; }
.right { display:flex; align-items:center; gap:10px; }
.link {
  padding:6px 10px;
  border:1px solid #e5e7eb;
  border-radius:8px;
  background:#f9fafb;
  color:#111;
  text-decoration:none;
}
.link:hover { background:#f3f4f6; }
.userchip {
  display:flex; align-items:center; gap:8px;
  padding:4px 8px; border:1px solid #e5e7eb; border-radius:9999px; background:#fff;
}
.avatar {
  width:22px; height:22px; border-radius:50%;
  display:inline-flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700; background:#eef2ff; color:#3730a3;
}
.uname { font-size: 13px; color:#333; }
@media (max-width: 640px) {
  .uname { display: none; }
}
</style>
