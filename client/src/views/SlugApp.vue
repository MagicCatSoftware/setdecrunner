<!-- client/src/views/SlugApp.vue -->
<template>
  <div class="layout">
    <!-- Show NavBar only when authed + member of this production -->

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavBar from '../components/NavBar.vue';

const route = useRoute();
const router = useRouter();

const me = ref(null);

/* ================= auth + membership helpers ================= */

function decodeJwtPayload(t) {
  try {
    const parts = t.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch { return null; }
}

function isAuthed() {
  const t = localStorage.getItem('token');
  if (!t || t === 'null' || t === 'undefined') return false;
  const payload = decodeJwtPayload(t);
  if (!payload) return false;
  if (payload.exp && Date.now() >= payload.exp * 1000) return false;
  return true;
}

function userHasProduction(prodId) {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user || !prodId) return false;
    const list = user.productionIds || (user.productionId ? [user.productionId] : []);
    return Array.isArray(list) && list.map(String).includes(String(prodId));
  } catch { return false; }
}

const currentProdId = computed(() => localStorage.getItem('currentProductionId') || '');
const showNav = computed(() => isAuthed() && userHasProduction(currentProdId.value));

/* ================= load / sync "me" ================= */

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api').replace(/\/+$/, '');

async function fetchMe() {
  const t = localStorage.getItem('token') || '';
  if (!t) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${t}` },
      credentials: 'omit',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function ensureMe() {
  if (!isAuthed()) { me.value = null; return; }

  // Prefer cached user for fast paint
  try {
    const cached = JSON.parse(localStorage.getItem('user') || 'null');
    if (cached) me.value = cached;
  } catch {}

  // Then refresh from API (best-effort)
  const fresh = await fetchMe();
  if (fresh) {
    me.value = fresh;
    try { localStorage.setItem('user', JSON.stringify(fresh)); } catch {}
  }
}

/* ================= actions ================= */



/* ================= lifecycle ================= */



onMounted(() => {
  ensureMe();
  
});

onBeforeUnmount(() => {
 
});

// If the navbar becomes eligible (e.g., storage updated), make sure "me" is loaded.
watch(showNav, (v) => { if (v && !me.value) ensureMe(); });
</script>




<style scoped>
.nav {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #eee;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand {
  font-weight: 700;
  text-decoration: none;
  color: #111;
}
.links {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
a {
  color: #333;
  text-decoration: none;
  padding: 6px 8px;
  border-radius: 8px;
}
a.active {
  background: #111;
  color: #fff;
}
.logout {
  margin-left: auto;
  background: #b00020;
  color: #fff;
  padding: 6px 10px;
  border-radius: 8px;
}
.content { padding: 16px; }
</style>
