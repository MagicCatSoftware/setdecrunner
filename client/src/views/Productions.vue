<!-- client/src/views/Productions.vue -->
<template>
  <NavBar :me="me" />
  <div class="container">
    <!-- Header -->
    <div class="panel header">
      <h2 class="title">Productions</h2>
      <div class="spacer"></div>
      <RouterLink
        class="btn btn--primary"
        :to="{ name: 'production-new', params: { slug } }"
      >
        + New Production
      </RouterLink>
    </div>

    <!-- Search -->
    <section class="panel">
      <div class="row row--wrap" style="gap:.75rem;">
        <input
          v-model="q"
          @input="debouncedLoad()"
          placeholder="Search productions by title, slug or company…"
          class="input"
          style="min-width:340px;flex:1;"
        />
        <button class="btn" :disabled="loading" @click="load">
          {{ loading ? 'Searching…' : 'Search' }}
        </button>
        <button class="btn btn--ghost" :disabled="loading && !prods.length" @click="clearSearch">
          Clear
        </button>
      </div>
      <p class="muted" v-if="!loading && !prods.length">No productions found.</p>
      <p class="error" v-if="error">{{ error }}</p>
    </section>

    <!-- Results -->
    <section class="panel" v-if="prods.length">
      <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;">
        <article v-for="p in prods" :key="toId(p._id)" class="card">
          <header class="card__head">
            <div class="card__title">
              <strong>{{ productionTitle(p) }}</strong>
            </div>
            <div class="muted">
              <span>@{{ p.slug }}</span>
              <span v-if="p.isActive === false"> • <em>inactive</em></span>
            </div>
          </header>

          <div class="card__body">
            <div class="muted" v-if="companyLine(p)">{{ companyLine(p) }}</div>

            <div class="row row--tight" style="margin-top:.25rem;">
              <span class="chip" v-if="isOwner(p)">Owner</span>
              <span class="chip" v-else>Role: {{ memberRole(p) || 'viewer' }}</span>
              <span class="chip chip--ghost" v-if="isCurrent(p)">Current</span>
            </div>

            <div class="muted" style="margin-top:.25rem;" v-if="p.createdAt">
              Created {{ fmtDate(p.createdAt) }}
            </div>
          </div>

          <footer class="card__actions">
            <button class="btn btn--primary" @click="openProduction(p)">
              Open
            </button>

            <RouterLink
              class="btn"
              :to="{ name: 'tenant-members', params: { slug: p.slug } }"
              v-if="canSeeMembers(p)"
            >
              Members
            </RouterLink>

            <RouterLink
              class="btn btn--ghost"
              :to="{ name: 'production-edit', params: { slug, id: toId(p._id) } }"
              v-if="canEdit(p)"
            >
              Edit
            </RouterLink>
          </footer>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import api from '../api.js';          // default client (api.get/post/etc.)
import NavBar from '../components/NavBar.vue';
/* -------------------------------- state -------------------------------- */
const router = useRouter();
const route  = useRoute();

const slug   = computed(() => String(route.params.slug || ''));
const loading = ref(false);
const error   = ref('');
const q       = ref('');
const prods   = ref([]);
const me = ref(null);

/* ------------------------------ utilities ------------------------------ */
const HEX24_RE = /^[a-f0-9]{24}$/i;
function toId(v) {
  if (!v) return '';
  if (typeof v === 'string' || typeof v === 'number') {
    const s = String(v).trim();
    return HEX24_RE.test(s) ? s : '';
  }
  const nested = v._id ?? v.id ?? v.$oid ?? (typeof v.valueOf === 'function' ? v.valueOf() : null);
  if (nested && nested !== v) return toId(nested);
  try { const s = v.toString?.(); return HEX24_RE.test(s) ? s : ''; } catch { return ''; }
}

function fmtDate(d) {
  try { return new Date(d).toLocaleDateString(); } catch { return ''; }
}

function productionTitle(p) {
  // Prefer explicit title; fall back to legacy name
  return p?.title || p?.name || '(untitled)';
}

function companyLine(p) {
  return p?.productioncompany || p?.company || '';
}

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); }
  catch { return null; }
}
const currentUserId = computed(() => toId(getCurrentUser()?._id));

function idsEqual(a, b) {
  const A = toId(a), B = toId(b);
  return !!A && !!B && A === B;
}

function isOwner(p) {
  return idsEqual(p?.ownerUserId ?? p?.owner, currentUserId.value);
}

function memberRole(p) {
  const members = p?.members;
  if (!Array.isArray(members)) return '';
  for (const m of members) {
    const uid = toId(m?.user ?? m);
    if (idsEqual(uid, currentUserId.value)) {
      return String(m?.role || '').toLowerCase() || 'viewer';
    }
  }
  return '';
}

function isAdmin(p) {
  return isOwner(p) || memberRole(p) === 'admin';
}

function canEdit(p)   { return isAdmin(p); }
function canSeeMembers(p) { return true; } // allow everyone to view; restrict in view if needed
function isCurrent(p) { return String(p?.slug || '') === slug.value; }

/* --------------------------------- API --------------------------------- */
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = { limit: 100 };
    const qq = (q.value || '').trim();
    if (qq) params.q = qq;

    try { me.value = await apiGet('/auth/me'); } catch { me.value = null; }

    // Expecting: GET /tenant/productions?q=...
    const list = await api.get('/tenant/productions', params);
    prods.value = Array.isArray(list) ? list : (list?.results || []);
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to load productions';
    prods.value = [];
  } finally {
    loading.value = false;
  }
}

let t;
function debouncedLoad(delay = 350) {
  clearTimeout(t);
  t = setTimeout(load, delay);
}

function clearSearch() {
  q.value = '';
  load();
}

/* ------------------------------ navigation ----------------------------- */
async function openProduction(p) {
  const s = String(p?.slug || '').trim();
  if (!s) return;
  // Let the slug route guard validate and set currentProductionId
  await router.push({ name: 'tenant-home', params: { slug: s } }).catch(() => {});
}

/* -------------------------------- mount -------------------------------- */
onMounted(load);
</script>

<style scoped>
.title { font-size: 1.25rem; font-weight: 600; }
.card { padding: 12px; border:1px solid #e5e7eb; border-radius: 10px; background:#fff; display:flex; flex-direction:column; }
.card__head { margin-bottom: 6px; }
.card__title { font-size: 1rem; }
.card__body { font-size: .95rem; }
.card__actions { display:flex; gap:.5rem; margin-top:.5rem; }
.chip {
  display:inline-block; padding:.15rem .5rem; border-radius:999px; border:1px solid #e5e7eb;
  font-size:.75rem; line-height:1; background:#f9fafb;
}
.chip--ghost { background:transparent; }
.header { display:flex; align-items:center; gap:12px; }
.spacer { flex:1; }
</style>
