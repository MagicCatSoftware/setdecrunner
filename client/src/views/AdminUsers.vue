<template>
  <div>
    <NavBar :me="me" @logout="logout" />

    <div class="users-page">
      <!-- Toolbar -->
      <div class="toolbar">
        <input
          v-model="q"
          placeholder="Search users (name or email)"
          class="input"
          @keyup.enter="load"
        />
        <button class="btn btn--primary" @click="load" :disabled="loading">
          {{ loading ? 'Searching…' : 'Search' }}
        </button>
        <button class="btn" @click="reset">Reset</button>

        <div class="toolbar__spacer"></div>

        <button class="btn btn--primary" @click="openCreate" :disabled="creating">
          + Create User
        </button>

        <span class="toolbar__stamp" v-if="lastUpdated">
          Updated {{ lastUpdated }}
        </span>
      </div>

      <!-- Access gate -->
      <div v-if="!checked" class="muted">Checking permissions…</div>
      <div v-else-if="!allowed" class="error">Admins only for this production.</div>

      <!-- List -->
      <div v-else>
        <div v-if="loading" class="muted">Loading…</div>

        <div v-else class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Authorized</th>
                <th>Banned</th>
                <th>Provider</th>
                <th>Created</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in list" :key="u._id">
                <td>
                  <div class="usercell">
                    <img v-if="u.photo" :src="u.photo" class="avatar" alt="" />
                    <div class="truncate">{{ u.name || '—' }}</div>
                  </div>
                </td>
                <td class="truncate email">{{ u.email || '—' }}</td>
                <td>
                  <select
                    class="select"
                    v-model="u.role"
                    :disabled="savingId===u._id || isSelf(u)"
                    @change="save(u)"
                  >
                    <option value="admin">admin</option>
                    <option value="coordinator">coordinator</option>
                    <option value="driver">driver</option>
                    <option value="user">user</option>
                  </select>
                </td>
                <td>
                  <label class="check">
                    <input type="checkbox" v-model="u.siteAuthorized" :disabled="savingId===u._id || isSelf(u)" @change="save(u)" />
                    <span class="pill" :class="u.siteAuthorized ? 'pill--ok' : 'pill--muted'">
                      {{ u.siteAuthorized ? 'Yes' : 'No' }}
                    </span>
                  </label>
                </td>
                <td>
                  <label class="check">
                    <input type="checkbox" v-model="u.banned" :disabled="savingId===u._id || isSelf(u)" @change="save(u)" />
                    <span class="pill" :class="u.banned ? 'pill--danger' : 'pill--ok'">
                      {{ u.banned ? 'Banned' : 'Active' }}
                    </span>
                  </label>
                </td>
                <td class="ucase small">{{ u.oauthProvider || u.provider || 'local' }}</td>
                <td class="small">{{ shortDate(u.createdAt) }}</td>
                <td class="text-right">
                  <button class="btn btn--ghost" @click="view(u)">View</button>
                  <button
                    class="btn btn--danger"
                    :disabled="savingId===u._id || isSelf(u)"
                    @click="removeUser(u)"
                  >Remove</button>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="!list.length" class="empty muted">
            No users match your search.
          </div>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="notice" class="notice">{{ notice }}</p>
      </div>
    </div>

    <!-- Profile Modal -->
    <div v-if="active" class="modal">
      <div class="modal__backdrop" @click="active=null"></div>
      <div class="modal__card">
        <div class="modal__head">
          <h3 class="title">User Profile</h3>
          <button class="btn btn--ghost" @click="active=null">Close</button>
        </div>

        <div class="profile">
          <img v-if="active.photo" :src="active.photo" class="avatar avatar--lg" alt="" />
          <div>
            <div class="profile__name">{{ active.name || '—' }}</div>
            <div class="muted small">{{ active.email || '—' }}</div>
          </div>
        </div>

        <div class="details">
          <div>
            <div class="label small">Role</div>
            <div class="mono">{{ active.role }}</div>
          </div>
          <div>
            <div class="label small">Provider</div>
            <div class="mono ucase">{{ active.oauthProvider || active.provider || 'local' }}</div>
          </div>
          <div>
            <div class="label small">Authorized</div>
            <div class="pill" :class="active.siteAuthorized ? 'pill--ok' : 'pill--muted'">
              {{ active.siteAuthorized ? 'Yes' : 'No' }}
            </div>
          </div>
          <div>
            <div class="label small">Banned</div>
            <div class="pill" :class="active.banned ? 'pill--danger' : 'pill--ok'">
              {{ active.banned ? 'Banned' : 'Active' }}
            </div>
          </div>
          <div>
            <div class="label small">Created</div>
            <div class="small">{{ longDate(active.createdAt) }}</div>
          </div>
          <div>
            <div class="label small">Updated</div>
            <div class="small">{{ longDate(active.updatedAt) }}</div>
          </div>
        </div>

        <div class="modal__foot">
          <button class="btn" @click="toggleAuth(active)" :disabled="savingId===active._id || isSelf(active)">
            {{ active.siteAuthorized ? 'Revoke Site Access' : 'Authorize Site Access' }}
          </button>
          <button class="btn" @click="toggleBan(active)" :disabled="savingId===active._id || isSelf(active)">
            {{ active.banned ? 'Unban' : 'Ban' }}
          </button>
          <button class="btn btn--danger" @click="removeUser(active)" :disabled="savingId===active._id || isSelf(active)">
            Remove Account
          </button>
        </div>
      </div>
    </div>

    <!-- Create User Modal -->
    <div v-if="createOpen" class="modal">
      <div class="modal__backdrop" @click="closeCreate"></div>
      <div class="modal__card">
        <div class="modal__head">
          <h3 class="title">Create User & Send Invite</h3>
          <button class="btn btn--ghost" @click="closeCreate">Close</button>
        </div>

        <form class="grid" @submit.prevent="createUser">
          <input class="input" v-model.trim="createForm.firstName" placeholder="First name" />
          <input class="input" v-model.trim="createForm.lastName" placeholder="Last name" />
          <input class="input" v-model.trim="createForm.email" placeholder="Email" type="email" required />
          <input class="input" v-model.trim="createForm.username" placeholder="Username (optional)" />

          <div class="row gap-2">
            <label class="label small">Role</label>
            <select class="select" v-model="createForm.role">
              <option value="user">user</option>
              <option value="driver">driver</option>
              <option value="coordinator">coordinator</option>
              <option value="admin">admin</option>
            </select>
          </div>

          <label class="check">
            <input type="checkbox" v-model="createForm.siteAuthorized" />
            <span>Authorize site access immediately</span>
          </label>

          <div class="modal__foot">
            <button class="btn btn--primary" :disabled="creating">
              {{ creating ? 'Sending Invite…' : 'Create & Send Invite' }}
            </button>
            <span class="muted small" v-if="createError">{{ createError }}</span>
            <span class="small" v-if="createMsg">{{ createMsg }}</span>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import NavBar from '../components/NavBar.vue';
import { useAuth } from '../auth.js';
import api, { apiGet } from '../api.js';
import { useRoute } from 'vue-router';

const route = useRoute();
const auth = useAuth();
const me = ref(null);

const q = ref('');
const list = ref([]);
const loading = ref(false);
const error = ref('');
const notice = ref('');
const savingId = ref('');
const lastUpdated = ref('');

const active = ref(null);

// Create modal state
const createOpen = ref(false);
const creating = ref(false);
const createForm = ref({
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  role: 'user',
  siteAuthorized: false,
});
const createError = ref('');
const createMsg = ref('');

/* ---------- production/admin gate ---------- */
const slug = computed(() => String(route.params.slug || ''));

const prod = ref(null);
const checked = ref(false);
const allowed = ref(false);
const resolvedProdId = ref(localStorage.getItem('currentProductionId') || '');

const HEX24 = /^[a-f0-9]{24}$/i;
function toId(v) {
  if (!v) return '';
  if (typeof v === 'string' || typeof v === 'number') {
    const s = String(v).trim();
    return HEX24.test(s) ? s : '';
  }
  if (Array.isArray(v)) return toId(v[0]);
  const nested = v._id ?? v.user ?? v.id ?? v.userId ?? v.uid ?? v.$oid ?? (typeof v.valueOf === 'function' ? v.valueOf() : null);
  if (nested && nested !== v) return toId(nested);
  try { const s = v.toString?.(); return HEX24.test(s) ? s : ''; } catch { return ''; }
}

async function ensureProduction() {
  // Keep current prod id if we already have one; otherwise try to resolve from slug
  if (HEX24.test(resolvedProdId.value)) return;
  if (!slug.value) return;
  try {
    const p = await apiGet(`/tenant/productions/${slug.value}`);
    prod.value = p || null;
    const pid = toId(p?._id);
    if (pid) {
      resolvedProdId.value = pid;
      localStorage.setItem('currentProductionId', pid);
    }
  } catch {
    prod.value = null;
  }
}

/* ---------- request helpers ---------- */
function prodIdHeader() {
  const pid = String(resolvedProdId.value || '').trim();
  return HEX24.test(pid) ? { 'x-production-id': pid } : {};
}
function authHeaders() {
  // Your api helper should also attach Authorization: Bearer <JWT>
  return { ...prodIdHeader() };
}
function qs(obj = {}) {
  const s = new URLSearchParams(obj).toString();
  return s ? `?${s}` : '';
}

/* ---------- utilities ---------- */
const logout = () => auth.logout();
const stamp = () => { lastUpdated.value = new Date().toLocaleTimeString(); };

const shortDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleDateString();
};
const longDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleString();
};
const isSelf = (u) => me.value && u?._id === me.value._id;

/* ---------- admin probe ---------- */
async function checkAdminAccess() {
  const pid = String(resolvedProdId.value || '').trim();
  if (!HEX24.test(pid)) return false;
  try {
    await api.get('/tenant/admin/users?probe=1', { headers: authHeaders() });
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- data actions (admin endpoints) ---------- */
const load = async () => {
  if (!allowed.value) return;
  loading.value = true; error.value = '';
  try {
    const headers = authHeaders();
    const query = q.value ? { q: q.value } : {};
    list.value = await api.get('/tenant/admin/users' + qs(query), { headers });
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Failed to load users';
  } finally {
    loading.value = false;
  }
};

const reset = async () => { q.value = ''; await load(); };

const save = async (u) => {
  savingId.value = u._id; error.value = '';
  try {
    const headers = authHeaders();
    const body = { role: u.role, siteAuthorized: !!u.siteAuthorized, banned: !!u.banned };
    const updated = await api.patch(`/tenant/admin/users/${u._id}`, body, { headers });
    Object.assign(u, updated);
    notice.value = 'Changes saved';
    setTimeout(() => (notice.value = ''), 1200);
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to update user';
    await reloadSingle(u._id);
  } finally {
    savingId.value = '';
  }
};

const toggleAuth = async (u) => {
  u.siteAuthorized = !u.siteAuthorized;
  await save(u);
};
const toggleBan = async (u) => {
  if (!u.banned && isSelf(u)) return;
  u.banned = !u.banned;
  await save(u);
};

const removeUser = async (u) => {
  if (isSelf(u)) { alert('You cannot remove your own account from here.'); return; }
  if (!confirm(`Remove user "${u.name || u.email || 'account'}" from this production?`)) return;
  savingId.value = u._id; error.value = '';
  try {
    const headers = authHeaders();
    await api.del(`/tenant/admin/users/${u._id}`, { headers });
    list.value = list.value.filter(x => x._id !== u._id);
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to remove user';
    await reloadSingle(u._id);
  } finally {
    savingId.value = '';
  }
};

const view = (u) => {
  active.value = { ...u };
};

const reloadSingle = async (id) => {
  try {
    const prevActiveId = active.value?._id;
    await load();
    const fresh = list.value.find(x => x._id === id);
    if (fresh && prevActiveId === id) active.value = { ...fresh };
  } catch { /* ignore */ }
};

/* ---- Create user modal handlers ---- */
const openCreate = () => {
  createError.value = '';
  createMsg.value = '';
  createOpen.value = true;
};
const closeCreate = () => {
  createOpen.value = false;
  createForm.value = { firstName: '', lastName: '', email: '', username: '', role: 'user', siteAuthorized: false };
};

const createUser = async () => {
  try {
    createError.value = '';
    createMsg.value = '';
    if (!createForm.value.email) { createError.value = 'Email is required'; return; }
    creating.value = true;

    const headers = authHeaders();
    const body = {
      firstName: createForm.value.firstName || undefined,
      lastName:  createForm.value.lastName  || undefined,
      email:     createForm.value.email,
      username:  createForm.value.username || undefined,
      role:      createForm.value.role,
      siteAuthorized: !!createForm.value.siteAuthorized, // send directly on POST
    };

    const resp = await api.post('/tenant/admin/users', body, { headers });

    // resp is expected to be { ok: true, userId, productionId }
    if (!resp?.ok) throw new Error('Create failed');

    createMsg.value = 'Invitation sent';
    await load();
    setTimeout(() => { closeCreate(); }, 600);
  } catch (e) {
    createError.value = e?.response?.data?.error || e.message || 'Failed to create user';
  } finally {
    creating.value = false;
  }
};

/* ---------- lifecycle ---------- */
onMounted(async () => {
  try { me.value = await apiGet('/auth/me'); } catch { me.value = null; }
  await ensureProduction(); // resolve production id
  allowed.value = await checkAdminAccess(); // backend is source of truth
  checked.value = true;
  if (allowed.value) await load();
});
</script>

<style scoped>
.users-page { padding: 16px; }
.toolbar { display:flex; gap:8px; align-items:center; }
.toolbar__spacer { flex:1; }
.toolbar__stamp { color:#6c737f; font-size:12px; }
.card { background:#fff; border:1px solid #ececec; border-radius:12px; padding:8px; }
.table { width:100%; border-collapse:collapse; }
.table th, .table td { padding:10px; border-bottom:1px solid #eee; vertical-align:middle; }
.text-right { text-align:right; }
.input { padding:8px 10px; border:1px solid #ddd; border-radius:8px; }
.select { padding:6px 8px; border:1px solid #ddd; border-radius:8px; background:#fff; }
.btn { padding:8px 12px; border-radius:10px; border:1px solid #ddd; background:#f8f8f8; }
.btn--primary { background:#111; color:#fff; border-color:#111; }
.btn--danger { background:#c62828; color:#fff; border-color:#c62828; }
.btn--ghost { background:transparent; }
.muted { color:#6c737f; }
.error { color:#c62828; }
.notice { color:#1b5e20; }
.usercell { display:flex; gap:8px; align-items:center; }
.avatar { width:28px; height:28px; border-radius:50%; object-fit:cover; }
.avatar--lg { width:64px; height:64px; }
.truncate { max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; }
.pill--ok { background:#e8f5e9; color:#2e7d32; }
.pill--muted { background:#f5f5f5; color:#607d8b; }
.pill--danger { background:#ffebee; color:#c62828; }
.ucase { text-transform:uppercase; }
.small { font-size:12px; }
.table-wrap { overflow:auto; }
.modal { position:fixed; inset:0; display:grid; place-items:center; z-index:1000; }
.modal__backdrop { position:absolute; inset:0; background:rgba(0,0,0,.25); }
.modal__card { position:relative; z-index:1; width:100%; max-width:600px; background:#fff; border-radius:12px; padding:16px; box-shadow:0 10px 30px rgba(0,0,0,.15); }
.modal__head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.profile { display:flex; gap:12px; align-items:center; margin:10px 0; }
.details { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin:10px 0 16px; }
</style>


