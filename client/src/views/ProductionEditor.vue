<template>
  <div class="container">
    <NavBar :me="me" />

    <div class="panel header">
      <input v-model="prod.title" class="input input--title" placeholder="Production title" @input="onTitleInput" />

      <div class="row row--wrap">
        <div class="field">
          <label class="label">Slug</label>
          <input
            v-model="prod.slug"
            class="input"
            @input="onSlugInput"
            :class="{ 'input--error': !!slugError }"
            placeholder="auto-generated-from-title"
          />
          <div class="muted">
            Normalized: <code>{{ normalizedSlug }}</code>
            <span v-if="slugError" class="error" style="margin-left:.5rem;">{{ slugError }}</span>
          </div>
        </div>

        <div class="field">
          <label class="label">Active?</label>
          <label class="checkbox">
            <input type="checkbox" v-model="prod.isActive" />
            <span>{{ prod.isActive ? 'Yes' : 'No' }}</span>
          </label>
        </div>
      </div>

      <div class="row row--wrap">
        <div class="field">
          <label class="label">Company</label>
          <input v-model="prod.productioncompany" class="input" placeholder="Company name" />
        </div>
        <div class="field">
          <label class="label">Phone</label>
          <input v-model="prod.productionphone" class="input" placeholder="Phone" />
        </div>
        <div class="field" style="min-width:340px;flex:1;">
          <label class="label">Address</label>
          <input v-model="prod.productionaddress" class="input" placeholder="Address" />
        </div>
      </div>

      <div class="header__actions">
        <button type="button" class="btn" @click="goToProductions">Back to list</button>
        <button type="button" class="btn btn--danger" v-if="prod._id" @click="destroy" :disabled="saving">Delete</button>
        <button type="button" class="btn btn--primary" @click="save" :disabled="saving || !!slugError">
          {{ saving ? 'Saving…' : (prod._id ? 'Save' : 'Create') }}
        </button>
      </div>

      <span class="muted saved" v-if="savedAt">Saved {{ savedAt }}</span>
    </div>

    <!-- Owner -->
    <section class="panel">
      <div class="row">
        <h3 class="subtitle">Owner</h3>
        <div class="muted">The owner is the canonical admin.</div>
      </div>

      <div v-if="ownerUser" class="row">
        <div class="chip">Current owner: <strong>{{ ownerUser.name || ownerUser.email }}</strong></div>
        <button class="btn btn--ghost" @click="clearOwner" :disabled="saving">Clear Owner</button>
      </div>
      <div v-else class="muted">No owner set.</div>

      <div class="row row--tight">
        <input v-model="ownerSearch" class="input" placeholder="Search users to set owner…" @input="debouncedSearchOwner()" />
        <button class="btn" @click="searchOwner" :disabled="searchingOwner">{{ searchingOwner ? 'Searching…' : 'Search' }}</button>
      </div>
      <div class="pillbar">
        <button
          v-for="u in ownerResults"
          :key="u._id"
          class="pill"
          @click="setOwner(u)"
        >
          Make Owner: {{ u.name || u.email }}
        </button>
      </div>
    </section>

    <!-- Members -->
    <section class="panel">
      <div class="row">
        <h3 class="subtitle">Members</h3>
        <div class="muted">Add users and set their roles (admin / editor / viewer).</div>
      </div>

      <div class="row row--tight">
        <input v-model="memberSearch" class="input" placeholder="Search users to add…" @input="debouncedSearchMembers()" />
        <button class="btn" @click="searchMembers" :disabled="searchingMembers">{{ searchingMembers ? 'Searching…' : 'Search' }}</button>
        <span v-if="membersError" class="error">{{ membersError }}</span>
      </div>

      <div class="pillbar" v-if="memberResults.length">
        <button
          v-for="u in memberResults"
          :key="u._id"
          class="pill"
          @click="addMember(u, 'editor')"
        >
          Add {{ u.name || u.email }} (editor)
        </button>
      </div>

      <div class="items mt-2">
        <div v-if="!prod.members?.length" class="empty muted">No members yet.</div>
        <div v-for="m in prod.members" :key="m.user?._id || m.user" class="item card">
          <div class="item__row">
            <div class="item__name">
              {{ memberLabel(m) }}
              <span class="muted" v-if="isOwner(m)"> — owner</span>
            </div>
            <div class="qty">
              <label class="muted">Role</label>
              <select class="select" :value="m.role" @change="e => changeMemberRole(m, e.target.value)">
                <option value="admin">admin</option>
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
              <button class="btn btn--danger" @click="removeMember(m)" :disabled="saving">Remove</button>
            </div>
          </div>
          <div class="muted">Added {{ fmtDate(m.addedAt) }}</div>
        </div>
      </div>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavBar from '../components/NavBar.vue';
import api from '../api.js';

// ---------- auth/nav helpers (match your existing style) ----------

const me = ref(null);

// ---------- routing ----------
const route = useRoute();
const router = useRouter();
const goToProductions = () => {
  // Adjust to your routes
  if (router.hasRoute('productions')) router.push({ name: 'productions' });
  else router.push('/productions');
};

// ---------- local normalize + reserved (mirror server) ----------
const RESERVED = new Set([
  'login','logout','register','signup','pricing','buy','purchase','billing',
  'about','contact','help','support','terms','privacy','dashboard',
  'api','assets','static','auth','users'
]);
function normalizeSlug(input = '') {
  return String(input)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ---------- state ----------
const prod = ref({
  _id: null,
  title: '',
  slug: '',
  ownerUserId: null,
  members: [],
  stripe: {},
  isActive: true,
  productionphone: '',
  productionaddress: '',
  productioncompany: '',
  // legacy (kept blank here; the server virtuals will cover them)
  name: '',
  phone: '',
  address: '',
  company: ''
});

const savedAt = ref('');
const saving = ref(false);
const error = ref('');

// track if user manually edited slug
const slugDirty = ref(false);
const normalizedSlug = computed(() => normalizeSlug(prod.value.slug || ''));
const slugError = computed(() => {
  if (!normalizedSlug.value) return 'Slug is required';
  if (RESERVED.has(normalizedSlug.value)) return 'This slug is reserved';
  return '';
});
function onTitleInput() {
  if (!slugDirty.value) {
    prod.value.slug = normalizeSlug(prod.value.title || '');
  }
}
function onSlugInput() {
  slugDirty.value = true;
  prod.value.slug = normalizeSlug(prod.value.slug || '');
}

function stamp() { savedAt.value = new Date().toLocaleTimeString(); }
function fmtDate(d) { try { return new Date(d).toLocaleString(); } catch { return ''; } }

// ---------- owner helpers ----------
const ownerUser = computed(() => {
  const id = prod.value.ownerUserId;
  if (!id) return null;
  const hit = prod.value.members?.find(m => (m.user?._id || m.user) === id);
  return (hit && (hit.user || null)) || null;
});

// ---------- members search (with q) ----------
const memberSearch = ref('');
const memberResults = ref([]);
const searchingMembers = ref(false);
const membersError = ref('');

let tMembers;
function debouncedSearchMembers(delay = 300) { clearTimeout(tMembers); tMembers = setTimeout(searchMembers, delay); }
async function searchMembers() {
  membersError.value = ''; searchingMembers.value = true; memberResults.value = [];
  try {
    const q = (memberSearch.value || '').trim();
    memberResults.value = await api.get('/tenant/users', q ? { q, limit: 20 } : { limit: 20 });
  } catch (e) {
    membersError.value = e?.response?.data?.error || 'Failed to search users';
  } finally { searchingMembers.value = false; }
}

// ---------- owner search ----------
const ownerSearch = ref('');
const ownerResults = ref([]);
const searchingOwner = ref(false);

let tOwner;
function debouncedSearchOwner(delay = 300) { clearTimeout(tOwner); tOwner = setTimeout(searchOwner, delay); }
async function searchOwner() {
  searchingOwner.value = true; ownerResults.value = [];
  try {
    const q = (ownerSearch.value || '').trim();
    ownerResults.value = await api.get('/tenant/users', q ? { q, limit: 20 } : { limit: 20 });
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to search users';
  } finally { searchingOwner.value = false; }
}

// ---------- members CRUD ----------
function memberLabel(m) {
  const u = m.user;
  if (!u) return '#unknown';
  if (typeof u === 'string') return `#${u}`;
  return u.name || u.email || u._id || '#user';
}
function isOwner(m) {
  return !!prod.value.ownerUserId && (m.user?._id || m.user) === prod.value.ownerUserId;
}

async function addMember(user, role = 'editor') {
  if (!prod.value._id) { error.value = 'Create the production before adding members.'; return; }
  try {
    const body = { userId: user._id, role };
    const updated = await api.post(`/tenant/productions/${prod.value._id}/members`, body);
    prod.value.members = updated.members || updated; // support either payload shape
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to add member';
  }
}

async function changeMemberRole(m, role) {
  try {
    const userId = m.user?._id || m.user;
    const updated = await api.patch(`/tenant/productions/${prod.value._id}/members/${userId}`, { role });
    prod.value.members = updated.members || updated;
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to update role';
  }
}

async function removeMember(m) {
  if (!confirm('Remove this member?')) return;
  try {
    const userId = m.user?._id || m.user;
    const updated = await api.del(`/tenant/productions/${prod.value._id}/members/${userId}`);
    prod.value.members = updated.members || updated;
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to remove member';
  }
}

// ---------- owner set/clear ----------
async function setOwner(u) {
  if (!prod.value._id) { error.value = 'Create the production first.'; return; }
  try {
    // ensure member exists (optional – safe to call)
    await addMember(u, 'admin');
    const updated = await api.patch(`/tenant/productions/${prod.value._id}`, { ownerUserId: u._id });
    prod.value.ownerUserId = updated.ownerUserId || u._id;
    // reflect potential member list returned
    if (updated.members) prod.value.members = updated.members;
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to set owner';
  }
}
async function clearOwner() {
  if (!prod.value._id) return;
  try {
    const updated = await api.patch(`/tenant/productions/${prod.value._id}`, { ownerUserId: null });
    prod.value.ownerUserId = updated.ownerUserId || null;
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to clear owner';
  }
}

// ---------- save / delete ----------
function payloadFromState() {
  return {
    title: (prod.value.title || '').trim(),
    slug: normalizeSlug(prod.value.slug || prod.value.title || ''),
    isActive: !!prod.value.isActive,
    productioncompany: (prod.value.productioncompany || '').trim(),
    productionphone: (prod.value.productionphone || '').trim(),
    productionaddress: (prod.value.productionaddress || '').trim(),
    ownerUserId: prod.value.ownerUserId || null
  };
}
async function save() {
  error.value = '';
  if (slugError.value) { error.value = slugError.value; return; }
  saving.value = true;
  try {
    if (prod.value._id) {
      const updated = await api.patch(`/tenant/productions/${prod.value._id}`, payloadFromState());
      Object.assign(prod.value, updated);
    } else {
      const created = await api.post('/tenant/productions', payloadFromState());
      Object.assign(prod.value, created);
      // Navigate to the new doc route if you prefer
      // router.push({ name: 'production-edit', params: { id: created._id } }).catch(()=>{});
    }
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to save production';
  } finally {
    saving.value = false;
  }
}
async function destroy() {
  if (!prod.value._id) return;
  if (!confirm('Delete this production? This cannot be undone.')) return;
  saving.value = true;
  try {
    await api.del(`/tenant/productions/${prod.value._id}`);
    goToProductions();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to delete';
  } finally {
    saving.value = false;
  }
}

// ---------- load ----------
async function load() {
  const id = route.params.id;
  if (!id || id === 'new') return; // creating new
  try {
    const data = await api.get(`/tenant/productions/${id}`);
    // ensure arrays/booleans are sane
    data.members = Array.isArray(data.members) ? data.members : [];
    data.isActive = !!data.isActive;
    Object.assign(prod.value, data);
    // if slug was pre-filled by backend, consider it "dirty" to avoid overwriting on title input
    if (prod.value.slug) slugDirty.value = true;
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to load production';
  }
}

onMounted(async () => {
  try { me.value = await auth.fetchMe?.(); } catch {}
  await load();
});

// keep slug normalized even if user pastes funky characters
watch(() => prod.value.slug, (v) => {
  if (v !== normalizeSlug(v || '')) prod.value.slug = normalizeSlug(v || '');
});

</script>

<style scoped>
.container { max-width: 980px; margin: 0 auto; }
.panel { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 16px; margin: 14px 0; }
.header { display: grid; gap: 10px; }
.row { display: flex; gap: 10px; align-items: center; }
.row--wrap { flex-wrap: wrap; }
.row--tight { gap: 6px; }
.input { padding: 8px 10px; border: 1px solid #ccc; border-radius: 8px; }
.input--title { font-size: 20px; font-weight: 600; width: 100%; }
.input--error { border-color: #e74c3c; }
.select { padding: 8px 10px; border: 1px solid #ccc; border-radius: 8px; }
.checkbox { display: inline-flex; align-items: center; gap: 8px; }
.btn { padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; background: #f8f8f8; cursor: pointer; }
.btn--primary { background: #0b5fff; border-color: #0b5fff; color: #fff; }
.btn--danger { background: #e74c3c; border-color: #e74c3c; color: #fff; }
.btn--ghost { background: #fff; }
.header__actions { display: flex; gap: 8px; }
.label { font-size: 12px; color: #666; margin-bottom: 4px; display: block; }
.field { display: flex; flex-direction: column; min-width: 220px; }
.pillbar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.pill { padding: 6px 10px; border-radius: 999px; border: 1px solid #ddd; background: #fafafa; cursor: pointer; }
.items .item { margin-bottom: 10px; }
.item__row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.item__name { font-weight: 600; }
.qty { display: flex; align-items: center; gap: 8px; }
.error { color: #e74c3c; }
.muted { color: #777; }
.saved { margin-left: 8px; }
.chip { background: #f2f4ff; border: 1px solid #dfe3ff; padding: 4px 8px; border-radius: 999px; }
.empty { padding: 8px 0; }
code { background: #f6f6f6; padding: 1px 4px; border-radius: 4px; }
</style>
