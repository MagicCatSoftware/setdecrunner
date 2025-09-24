<!-- client/src/components/NavBar.vue -->
<template>
  <nav class="nav">
    <!-- Logo + Production -->
    <div class="nav__logo">
      <img src="/logo.png" alt="Set Dec Runner Logo" />
      <div class="nav__logo-texts">
        <span class="nav__logo-text">Set Dec Runner</span>
        <div class="nav__production" :title="productionTooltip">
          {{ productionLabel }}
        </div>
      </div>
    </div>

    <!-- Navigation Links (slug-aware) -->
    <div class="nav__links">
      <RouterLink class="nav__link" :to="{ name: 'tenant-home', params: { slug } }" draggable="false">Dashboard</RouterLink>
      <RouterLink class="nav__link" :to="{ name: 'runsheets', params: { slug } }" draggable="false">Run Sheets</RouterLink>
      <RouterLink class="nav__link" :to="{ name: 'sets', params: { slug } }" draggable="false">Sets</RouterLink>
      <RouterLink class="nav__link" :to="{ name: 'people', params: { slug } }" draggable="false">People</RouterLink>
      <RouterLink class="nav__link" :to="{ name: 'items', params: { slug } }" draggable="false">Items</RouterLink>
      <RouterLink class="nav__link" :to="{ name: 'places', params: { slug } }" draggable="false">Places</RouterLink>
      <RouterLink class="nav__link" :to="{ name: 'suppliers', params: { slug } }" draggable="false">Suppliers</RouterLink>

      <RouterLink class="nav__link" :to="{ name: 'productions', params: { slug } }" draggable="false">
        Productions
      </RouterLink>

      <RouterLink
        v-if="canEditCurrent"
        class="nav__link"
        :to="{ name: 'production-edit', params: { slug, id: currentProdId } }"
        draggable="false"
      >
        Production Settings
      </RouterLink>

      <RouterLink
        v-if="canCreateProduction"
        class="nav__link"
        :to="{ name: 'production-new', params: { slug } }"
        draggable="false"
      >
        New Production
      </RouterLink>

      <RouterLink
        v-if="showMembersLink"
        :to="{ name: 'tenant-members', params: { slug } }"
        class="nav__link"
        draggable="false"
      >
        Members
      </RouterLink>

      <!-- Show ONLY if current user is owner or in admins found in production.members -->
      <RouterLink
        v-if="showAdminUsersLink"
        class="nav__link nav__link--admin"
        :to="{ name: 'admin-users', params: { slug } }"
        draggable="false"
      >
        Create Users
      </RouterLink>
    </div>

    <!-- User Info + Logout -->
    <div class="nav__right">
      <img
        v-if="photoSrc"
        :src="photoSrc"
        class="nav__avatar"
        :alt="displayName || 'Profile'"
        draggable="false"
      />
      <span class="nav__name" :title="displayName">{{ displayName }}</span>
      <button class="btn" @click="onLogoutClick">Logout</button>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuth, performLogout } from '../auth.js';
import api, { apiGet } from '../api.js';

const router = useRouter();
const route  = useRoute();
const auth   = useAuth();

const props = defineProps({
  me: { type: Object, default: null },
  company: { type: Object, default: null },
});

const slug = computed(() => String(route.params.slug || ''));

/* ---------------- read user (prop or localStorage) ---------------- */
const user = computed(() => {
  if (props.me) return props.me;
  try { return JSON.parse(localStorage.getItem('user') || 'null'); }
  catch { return null; }
});
const currentUserId = computed(() => toId(user.value?._id || user.value));

/* ---------------- production fetch (to inspect members/roles) ---------------- */
const prod = ref(null); // {_id, ownerUserId|owner, title, members:[{user,role}|ObjectId] }
const HEX24_RE = /^[a-f0-9]{24}$/i;

function toId(v) {
  if (!v) return '';
  if (typeof v === 'string' || typeof v === 'number') {
    const s = String(v).trim();
    return HEX24_RE.test(s) ? s : '';
  }
  if (Array.isArray(v)) return toId(v[0]);
  const nested = v._id ?? v.user ?? v.id ?? v.userId ?? v.uid ?? v.$oid ?? (typeof v.valueOf === 'function' ? v.valueOf() : null);
  if (nested && nested !== v) return toId(nested);
  try { const s = v.toString?.(); return HEX24_RE.test(s) ? s : ''; } catch { return ''; }
}
const idsEqual = (a, b) => {
  const A = toId(a), B = toId(b);
  return !!A && !!B && A === B;
};

async function fetchProduction() {
  if (!slug.value) { prod.value = null; return; }
  try {
    // Server supports fetching by slug
    const p = await apiGet(`/tenant/productions/${slug.value}`);
    prod.value = p || null;

    // Keep both storage and API helper in sync so subsequent calls carry the header
    const pid = toId(p?._id);
    if (pid) {
      localStorage.setItem('currentProductionId', pid);
      api.setProductionId(pid);
    }
  } catch {
    prod.value = null;
  }
}
watch(() => slug.value, fetchProduction);

/* ---------------- derive admin set from members ---------------- */
function roleIsAdmin(r) {
  if (!r) return false;
  const s = String(r).trim().toLowerCase();
  // be generous with common admin strings
  return s === 'admin' || s === 'administrator' || s === 'owner';
}

// list of admin userIds from members (role=admin) + owner as admin
const productionAdminIds = computed(() => {
  const out = new Set();
  const p = prod.value || {};
  const ownerId = toId(p.ownerUserId ?? p.owner);
  if (ownerId) out.add(ownerId);

  const members = Array.isArray(p.members) ? p.members : [];
  for (const m of members) {
    // m can be ObjectId or object { user, role } or { _id, role }
    const uid = toId(m?.user ?? m?._id ?? m);
    const role = (m && typeof m === 'object')
      ? (m.role ?? (Array.isArray(m.roles) ? m.roles.find(roleIsAdmin) : null))
      : null;

    if (uid && roleIsAdmin(role)) out.add(uid);
  }
  return out;
});

const isOwner = computed(() => {
  const ownerId = toId(prod.value?.ownerUserId ?? prod.value?.owner);
  return !!ownerId && idsEqual(ownerId, currentUserId.value);
});
const isCurrentUserAdmin = computed(() => {
  const myId = currentUserId.value;
  if (!myId) return false;
  return productionAdminIds.value.has(myId);
});

// This one is exactly what you asked for: if current user is in the
// admin set derived from production.members (or is owner), show the link.
const showAdminUsersLink = computed(() => isOwner.value || isCurrentUserAdmin.value);

// Keep the other links using the same admin logic
const currentProdId = computed(() => toId(prod.value?._id));
const canEditCurrent = computed(() => isOwner.value || isCurrentUserAdmin.value);
const canCreateProduction = computed(() => isOwner.value || isCurrentUserAdmin.value);
const showMembersLink    = computed(() => canEditCurrent.value);

/* ---------------- presentation helpers ---------------- */
const productionLabel = computed(() => {
  const p = prod.value || {};
  return (
    p.title ||
    props.company?.companyProduction ||
    (slug.value ? `/${slug.value}` : '')
  );
});
const productionTooltip = computed(() => {
  const p = prod.value || {};
  const lines = [];
  if (p.title) lines.push(`Title: ${p.title}`);
  return lines.join('\n') || '';
});

const displayName = computed(() =>
  user.value?.name ||
  user.value?.fullName ||
  user.value?.displayName ||
  user.value?.email ||
  ''
);

// Profile photo normalization
const rawPhoto = computed(() => {
  const u = user.value || {};
  return (
    u.photo || u.avatar || u.photoUrl || u.photoURL || u.picture ||
    u.image?.url || u.image || u.providerData?.[0]?.photoURL ||
    u.photos?.[0]?.value || u.profile?._json?.picture ||
    u.profile?.picture || u.profile?.photos?.[0]?.value || ''
  );
});
const rawApiBase = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api').replace(/\/+$/, '');
const apiOrigin  = rawApiBase.replace(/\/api\/?$/, '') || window.location.origin;
function normalizePhoto(p) {
  if (!p) return '';
  if (/^(?:https?:)?\/\//i.test(p) || p.startsWith('data:')) {
    if (p.startsWith('//')) return `https:${p}`;
    if (location.protocol === 'https:' && p.startsWith('http:')) p = p.replace(/^http:/i, 'https:');
    try {
      const u = new URL(p, location.origin);
      if (/\bgoogleusercontent\.com$/i.test(u.hostname) && !/[?&](?:sz|s)=\d+/i.test(u.search)) {
        u.search += (u.search ? '&' : '?') + 'sz=128';
        return u.toString();
      }
    } catch {}
    return p;
  }
  let s = String(p).replace(/\\/g, '/');
  const idx = s.indexOf('/uploads/');
  if (idx !== -1) s = s.slice(idx);
  if (!s.startsWith('/')) s = `/${s}`;
  if (!s.startsWith('/uploads/')) s = s.replace(/^\/+/, '/uploads/');
  return `${apiOrigin}${s}`;
}
const photoSrc = computed(() => normalizePhoto(rawPhoto.value));

/* ---------------- actions ---------------- */
async function onLogoutClick() {
  try {
    await auth.logout({ clearTenant: true });
  } catch {
    // ignore
  } finally {
    const s = slug.value || '';
    router.replace({ name: 'tenant-login', params: { slug: s } });
  }
}

/* ---------------- lifecycle ---------------- */
onMounted(fetchProduction);
</script>



<style scoped>
.nav { display:flex; align-items:center; gap:16px; padding:10px 14px; border-bottom:1px solid #eee; background:#fff; }
.nav__logo { display:flex; align-items:center; gap:10px; }
.nav__logo img { height:32px; width:auto; }
.nav__logo-texts { display:flex; flex-direction:column; line-height:1.1; }
.nav__logo-text { font-weight:700; }
.nav__production { font-size:.9rem; color:#666; }
.nav__links { display:flex; gap:10px; flex-wrap:wrap; margin-left:12px; }
.nav__link { color:#333; text-decoration:none; padding:6px 8px; border-radius:8px; }
.nav__link--admin { background:#f3f5ff; border:1px solid #dfe5ff; }
.nav__right { margin-left:auto; display:flex; align-items:center; gap:8px; }
.nav__avatar { width:28px; height:28px; border-radius:50%; object-fit:cover; }
.nav__name { max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#444; }
.btn.btn--ghost { background:transparent; border:1px solid #ddd; border-radius:8px; padding:6px 10px; cursor:pointer; }
</style>

