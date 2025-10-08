<template>
  <div>
    <div class="no-print">
      <NavBar :me="me" @logout="logout" />
    </div>

    <div class="container">
      <!-- Access gate -->
      <div v-if="!checked" class="muted">Checking permissions…</div>

      <div v-else-if="!allowed" class="card denied">
        <h3>403 — Members Restricted</h3>
        <p class="muted">
          You must be the owner of this production and listed on the Production record to view Members.
        </p>
        <RouterLink class="btn" :to="{ name: 'runsheets', params: { slug } }">Back</RouterLink>
      </div>

      <!-- Members content -->
      <div v-else>
        <h2>Members</h2>
        <p v-if="error" class="error">{{ error }}</p>

        <!-- Search / refresh -->
        <div class="toolbar">
          <input v-model="q" placeholder="Search members…" class="input" @keyup.enter="load" />
          <button class="btn" @click="load" :disabled="loading">
            {{ loading ? 'Searching…' : 'Refresh' }}
          </button>
          <span v-if="lastUpdated" class="muted small">Updated {{ lastUpdated }}</span>
        </div>

        <!-- Add member by email -->
        <div class="toolbar toolbar--invite">
          <input
            v-model="newEmail"
            class="input"
            type="email"
            placeholder="Add member by email"
            @keyup.enter="createMember"
          />
          <button class="btn btn--primary" :disabled="creating" @click="createMember">
            {{ creating ? 'Adding…' : 'Add Member' }}
          </button>
          <span v-if="createError" class="error inline">{{ createError }}</span>
          <span v-if="createSuccess" class="success inline">Added!</span>
        </div>

        <div v-if="loading" class="muted">Loading…</div>

        <div v-else class="grid">
          <div v-for="u in filteredUsers" :key="u._id" class="card member">
            <img :src="photoUrl(u.photo)" class="avatar" alt="" />

            <div class="info">
              <div class="name">
                {{ u.name || u.email }}
                <span class="badge" v-if="isOwner(u)">Owner</span>
              </div>

              <div class="muted small" v-if="!isEditing(u._id)">
                {{ u.email }}
              </div>

              <div class="edit-row" v-else>
                <input
                  v-model="editDraft[u._id]"
                  class="input"
                  type="email"
                  :placeholder="u.email"
                  @keyup.enter="saveEmail(u)"
                />
                <button class="btn btn--primary" :disabled="savingId===u._id" @click="saveEmail(u)">
                  {{ savingId===u._id ? 'Saving…' : 'Save' }}
                </button>
                <button class="btn" :disabled="savingId===u._id" @click="cancelEdit(u._id)">Cancel</button>
              </div>

              <div class="muted small">{{ u.role }}</div>

              <div class="actions">
                <button
                  class="btn"
                  v-if="!isEditing(u._id)"
                  :disabled="savingId===u._id"
                  @click="startEdit(u)"
                >
                  Edit Email
                </button>

                <button
                  class="btn btn--danger"
                  :disabled="savingId===u._id || isOwner(u)"
                  @click="removeUser(u)"
                  title="Remove from this production"
                >
                  {{ savingId===u._id ? 'Working…' : 'Delete' }}
                </button>
              </div>

              <div class="error" v-if="rowError[u._id]">{{ rowError[u._id] }}</div>
            </div>
          </div>

          <div v-if="!filteredUsers.length" class="muted">No members found.</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import api, { apiGet } from '../api.js';
import NavBar from '../components/NavBar.vue';

const route = useRoute();
const router = useRouter();
const slug = computed(() => String(route.params.slug || ''));

/* ---------------- state ---------------- */
const me = ref(null);
const prod = ref(null);
const checked = ref(false);
const allowed = ref(false);

const q = ref('');
const users = ref([]);
const loading = ref(false);
const error = ref('');
const lastUpdated = ref('');
const resolvedProdId = ref(''); // guaranteed string or ''

// inline edit state
const editing = ref({});    // map: userId -> true
const editDraft = ref({});  // map: userId -> email string
const rowError = ref({});   // map: userId -> error string
const savingId = ref('');   // current saving/deleting user id

// create member state
const newEmail = ref('');
const creating = ref(false);
const createError = ref('');
const createSuccess = ref(false);

/* ---------------- auth/nav ---------------- */
const logout = () => router.replace({ name: 'tenant-logout', params: { slug: slug.value } });

/* ---------------- helpers ---------------- */
const API_BASE   = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api').replace(/\/+$/, '');
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '') || window.location.origin;
const HEX24_RE = /^[a-f0-9]{24}$/i;

function photoUrl(p) {
  if (!p) return '';
  let s = String(p);
  if (/^(?:https?:)?\/\//i.test(s) || s.startsWith('data:')) return s.startsWith('//') ? `https:${s}` : s;
  s = s.replace(/\\/g, '/');
  const idx = s.indexOf('/uploads/');
  if (idx !== -1) s = s.slice(idx);
  if (!s.startsWith('/')) s = `/${s}`;
  if (!s.startsWith('/uploads/')) s = s.replace(/^\/+/, '/uploads/');
  return `${API_ORIGIN}${s}`;
}

function qs(obj = {}) {
  const s = new URLSearchParams(obj).toString();
  return s ? `?${s}` : '';
}

/* -------- ID normalization (NEVER returns "[object Object]") ----- */
function toId(v) {
  if (!v) return '';
  // string/number
  if (typeof v === 'string' || typeof v === 'number') {
    const s = String(v).trim();
    return HEX24_RE.test(s) ? s : '';
  }
  // array → first element
  if (Array.isArray(v)) return toId(v[0]);

  // objects/common shapes
  // unwrap known fields recursively
  const nested = v._id ?? v.user ?? v.id ?? v.userId ?? v.uid ?? v.$oid ?? (typeof v.valueOf === 'function' ? v.valueOf() : null);
  if (nested && nested !== v) {
    const s = toId(nested);
    if (s) return s;
  }

  // last resort: toString if it looks like ObjectId
  try {
    const s = v.toString?.();
    return HEX24_RE.test(s) ? s : '';
  } catch (_) {
    return '';
  }
}

function idEq(a, b) {
  const ax = toId(a);
  const bx = toId(b);
  return !!ax && !!bx && ax === bx;
}

function arrayHasId(arr, id) {
  if (!Array.isArray(arr)) return false;
  const target = toId(id);
  if (!target) return false;
  return arr.some(x => idEq(x?._id ?? x?.user ?? x, target));
}

/** Build headers safely; never emits "[object Object]" */
function prodIdHeader() {
  const pid = String(resolvedProdId.value || '').trim();
  return HEX24_RE.test(pid) ? { 'x-production-id': pid } : {};
}

/* ---------------- owner badge ---------------- */
function isOwner(u) {
  const ownerId = prod.value?.ownerUserId ?? prod.value?.owner;
  return idEq(ownerId, u?._id);
}

/* ---------------- gate check ---------------- */
async function checkAccess() {
  try {
    const [meRes, prodRes] = await Promise.all([
      apiGet('/tenant/tenantauth/me'),
      apiGet(`/tenant/productions/${slug.value}`)
    ]);

    me.value = meRes || null;
    prod.value = prodRes || null;

    const userId = toId(me.value?._id || me.value);
    const prodIdFromSlug = toId(prod.value?._id);

    // owner (accept ownerUserId OR owner)
    const ownerId = toId(prod.value?.ownerUserId ?? prod.value?.owner);
    const ownerOk = !!ownerId && idEq(ownerId, userId);

    // membership via production doc OR via user.productionIds
    const memberViaProd =
      arrayHasId(prod.value?.members, userId) ||
      arrayHasId(prod.value?.users, userId) ||
      arrayHasId(prod.value?.memberIds, userId);

    const memberViaUser = !!prodIdFromSlug && arrayHasId(me.value?.productionIds, prodIdFromSlug);
    const isMember = memberViaProd || memberViaUser;

    // resolved id we will send as header — ensure 24-hex only
    resolvedProdId.value = prodIdFromSlug || (isMember ? toId((me.value?.productionIds || [])[0]) : '');

    allowed.value = !!(ownerOk && isMember);
  } catch (e) {
    allowed.value = false;
    error.value = e?.body?.error || e?.message || 'Failed to verify production access';
  } finally {
    checked.value = true;
  }
}

/* ---------------- data load ---------------- */
const filteredUsers = computed(() => {
  const term = q.value.trim().toLowerCase();
  if (!term) return users.value;
  return (users.value || []).filter(u =>
    (u.name || '').toLowerCase().includes(term) ||
    (u.email || '').toLowerCase().includes(term) ||
    (u.role || '').toLowerCase().includes(term)
  );
});

function stamp() {
  lastUpdated.value = new Date().toLocaleTimeString();
}

// Add next to HEX24_RE / toId / prodIdHeader()
function userIdHeader() {
  const uid = toId(me.value?._id || me.value);
  // only send when it looks like a 24-char hex ObjectId
  return /^[a-f0-9]{24}$/i.test(uid) ? { 'x-user-id': uid } : {};
}

function authHeaders() {
  // merges production + user headers, never emits [object Object]
  return { ...prodIdHeader(), ...userIdHeader() };
}

// Replace your load() with this:
async function load() {
  if (!allowed.value) return;
  loading.value = true; error.value = '';
  try {
    const headers = authHeaders();
    const query = q.value ? { q: q.value } : {};
    console.log(me);
    const res = await api.get('/tenant/members',{id:me.value._id});

    users.value = Array.isArray(res) ? res : (res.items || []);
    stamp();
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to load members';
  } finally {
    loading.value = false;
  }
}

/* ---------------- create member ---------------- */
function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

async function createMember() {
  createError.value = '';
  createSuccess.value = false;

  const email = String(newEmail.value || '').trim().toLowerCase();
  if (!email) {
    createError.value = 'Email is required.';
    return;
  }
  if (!isValidEmail(email)) {
    createError.value = 'Please enter a valid email.';
    return;
  }

  try {
    creating.value = true;
    const headers = prodIdHeader();
    await api.post('/tenant/members', { email }, { headers }); // Axios-style: body, { headers }

    newEmail.value = '';
    createSuccess.value = true;
    setTimeout(() => (createSuccess.value = false), 1500);
    await load();
  } catch (e) {
    createError.value = e?.body?.error || e?.message || 'Failed to add member';
  } finally {
    creating.value = false;
  }
}

/* ---------------- inline email edit ---------------- */
function isEditing(id) {
  return !!editing.value[toId(id)];
}
function startEdit(u) {
  const id = toId(u._id);
  editing.value[id] = true;
  editDraft.value[id] = String(u.email || '');
  rowError.value[id] = '';
}
function cancelEdit(id) {
  const key = toId(id);
  delete editing.value[key];
  delete editDraft.value[key];
  delete rowError.value[key];
}

async function saveEmail(u) {
  const id = toId(u._id);
  const nextEmail = String(editDraft.value[id] || '').trim();
  rowError.value[id] = '';

  if (!nextEmail) {
    rowError.value[id] = 'Email is required.';
    return;
  }
  if (!isValidEmail(nextEmail)) {
    rowError.value[id] = 'Please enter a valid email address.';
    return;
  }
  if (String(u.email || '').trim().toLowerCase() === nextEmail.toLowerCase()) {
    cancelEdit(id);
    return;
  }

  try {
    savingId.value = id;
    const headers = prodIdHeader();
    await api.patch(`/tenant/members/${encodeURIComponent(id)}`, { email: nextEmail }, { headers });

    const idx = users.value.findIndex(x => idEq(x._id, id));
    if (idx !== -1) users.value[idx] = { ...users.value[idx], email: nextEmail };

    cancelEdit(id);
    stamp();
  } catch (e) {
    rowError.value[id] = e?.body?.error || e?.message || 'Failed to update email';
  } finally {
    savingId.value = '';
  }
}

/* ---------------- delete member ---------------- */
async function removeUser(u) {
  const id = toId(u._id);
  rowError.value[id] = '';

  if (isOwner(u)) {
    rowError.value[id] = 'Owner cannot be removed.';
    return;
  }

  if (!confirm(`Remove ${u.name || u.email} from this production?`)) return;

  try {
    savingId.value = id;
    const headers = prodIdHeader();
    await api.del(`/tenant/members/${encodeURIComponent(id)}`, { headers });

    users.value = users.value.filter(x => !idEq(x._id, id));
    stamp();
  } catch (e) {
    rowError.value[id] = e?.body?.error || e?.message || 'Failed to delete member';
  } finally {
    savingId.value = '';
  }
}

/* ---------------- lifecycle ---------------- */
onMounted(async () => {
  await checkAccess();
  if (allowed.value) await load();
});
</script>

<style scoped>
.container { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
.toolbar { display:flex; gap:8px; margin-bottom:12px; align-items:center; }
.toolbar--invite { margin-top: -4px; }
.input { border:1px solid #d6d6d6; border-radius:8px; padding:8px 10px; flex:1; min-width:220px; }
.btn { border:1px solid #d6d6d6; background:#f7f7f7; border-radius:8px; padding:8px 12px; cursor:pointer; }
.btn:disabled { opacity:.6; cursor:not-allowed; }
.btn--primary { border-color:#2563eb; background:#2563eb; color:#fff; }
.btn--danger { border-color:#dc2626; background:#fee2e2; color:#991b1b; }
.grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:12px; }
.card { background:#fff; border:1px solid #ececec; border-radius:12px; padding:12px; display:flex; gap:12px; align-items:flex-start; }
.member .avatar { width:48px; height:48px; border-radius:8px; object-fit:cover; background:#f3f4f6; }
.name { font-weight:600; }
.small { font-size:12px; }
.muted { color:#6b7280; }
.badge { font-size:11px; border:1px solid #d1d5db; padding:1px 6px; border-radius:9999px; margin-left:8px; color:#374151; }
.error { color:#b42318; background:#fff1f0; border:1px solid #ffd7d5; padding:10px 12px; border-radius:8px; }
.error.inline { margin-top:0; }
.success { color:#065f46; background:#ecfdf5; border:1px solid #a7f3d0; padding:6px 10px; border-radius:8px; }
.success.inline { margin-left:8px; }
.actions { display:flex; gap:8px; margin-top:8px; }
.edit-row { display:flex; gap:8px; align-items:center; margin:6px 0; }
.denied { padding: 20px; }
</style>
