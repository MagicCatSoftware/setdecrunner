<template>
  <OwnerNav />
  <div class="container">
    <div class="head">
      <h1>Your productions</h1>
      <RouterLink class="btn" to="/purchase">Create new</RouterLink>
    </div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="grid">
      <div v-for="p in list" :key="p._id" class="card">
        <div class="row">
          <div>
            <div class="title">{{ p.title }}</div>
            <div class="muted">/{{ p.slug }}</div>
          </div>
          <div class="actions">
            <RouterLink class="btn" :to="{ name: 'owner-production-edit', params: { id: p._id } }">Edit</RouterLink>
            <RouterLink class="btn" :to="`/${p.slug}`">Open Tenant</RouterLink>
            <button class="btn" @click="toggleMembers(p._id)">
              {{ open[p._id] ? 'Hide Members' : 'Manage Members' }}
            </button>
            <button class="btn btn--danger" @click="remove(p)" :disabled="busyId===p._id">Delete</button>
          </div>
        </div>
        <div class="muted small">Updated {{ fmt(p.updatedAt) }}</div>

        <!-- Members panel -->
        <div v-if="open[p._id]" class="members">
          <div class="members__head">
            <h3>Members</h3>
            <span v-if="mLoading[p._id]" class="muted small">Loading…</span>
            <span v-if="mError[p._id]" class="error small">{{ mError[p._id] }}</span>
          </div>

          <!-- List -->
          <div v-if="(members[p._id] || []).length" class="table">
            <div class="thead">
              <div class="th name">Name</div>
              <div class="th email">Email</div>
              <div class="th role">Role</div>
              <div class="th act">Actions</div>
            </div>
            <div class="tbody">
              <div class="tr" v-for="m in members[p._id]" :key="m.userId">
                <div class="td name">{{ m.name || '—' }}</div>
                <div class="td email">{{ m.email }}</div>
                <div class="td role">
                  <select
                    :disabled="savingRole[p._id]===m.userId"
                    :value="(roleDraft[p._id] && roleDraft[p._id][m.userId]) || m.role"
                    @change="e => changeRole(p._id, m.userId, e.target.value)"
                  >
                    <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
                  </select>
                </div>
                <div class="td act">
                  <button
                    class="btn btn--danger"
                    :disabled="removing[p._id]===m.userId"
                    @click="removeMember(p._id, m.userId)"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="muted">No members yet.</div>

          <!-- Add -->
          <form v-if="addForm[p._id]" class="add" @submit.prevent="addMember(p._id)">
            <input
              class="input"
              type="email"
              placeholder="Add by email (creates placeholder if user doesn't exist)"
              v-model.trim="addForm[p._id].email"
              required
            />
            <select class="input" v-model="addForm[p._id].role">
              <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
            </select>
            <button class="btn" :disabled="adding[p._id]">Add</button>
          </form>
        </div>
      </div>

      <div v-if="!list.length" class="muted">No productions yet.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import api from '../api.js';
import OwnerNav from '../components/OwnerNav.vue';

const ROLES = ['admin', 'editor', 'viewer'];

const list = ref([]);
const loading = ref(false);
const error = ref('');
const busyId = ref('');

// per-production UI state
const open = reactive({});            // id -> bool
const members = reactive({});         // id -> array
const mLoading = reactive({});        // id -> bool
const mError = reactive({});          // id -> string
const adding = reactive({});          // id -> bool
const addForm = reactive({});         // id -> { email, role }
const removing = reactive({});        // id -> userId
const savingRole = reactive({});      // id -> userId
const roleDraft = reactive({});       // id -> { [userId]: role }

function fmt(d){ try { return new Date(d).toLocaleString(); } catch { return ''; } }

async function load() {
  loading.value = true; error.value = '';
  try {
    // Owner-scoped endpoint (no x-production-id header required)
    list.value = await api.get('/owner/productions');
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to load productions';
  } finally {
    loading.value = false;
  }
}

function ensureState(id) {
  if (!addForm[id]) addForm[id] = { email: '', role: 'editor' };
  if (!members[id]) members[id] = [];
  if (!roleDraft[id]) roleDraft[id] = {};
}

async function fetchMembers(id) {
  ensureState(id);
  mLoading[id] = true; mError[id] = '';
  try {
    const res = await api.get(`/owner/productions/${id}/members`);
    members[id] = res.members || [];
    // seed roleDraft with current roles
    roleDraft[id] = {};
    for (const m of members[id]) {
      roleDraft[id][m.userId] = m.role;
    }
  } catch (e) {
    mError[id] = e?.body?.error || e?.message || 'Failed to load members';
  } finally {
    mLoading[id] = false;
  }
}

async function toggleMembers(id) {
  ensureState(id);               // ✅ make sure reactive buckets exist before render
  open[id] = !open[id];
  if (open[id] && !(members[id] && members[id].length)) {
    await fetchMembers(id);
  }
}

async function addMember(id) {
  ensureState(id);
  if (!addForm[id].email) return;
  adding[id] = true; mError[id] = '';
  try {
    const res = await api.post(`/owner/productions/${id}/members`, {
      email: addForm[id].email,
      role: addForm[id].role,
    });
    members[id] = res.members || [];
    roleDraft[id] = {};
    for (const m of members[id]) roleDraft[id][m.userId] = m.role;
    addForm[id].email = '';
    addForm[id].role = addForm[id].role || 'editor';
  } catch (e) {
    alert(e?.body?.error || e?.message || 'Add member failed');
  } finally {
    adding[id] = false;
  }
}

async function changeRole(id, userId, role) {
  savingRole[id] = userId;
  try {
    const res = await api.patch(`/owner/productions/${id}/members/${userId}`, { role });
    members[id] = res.members || [];
    roleDraft[id] = {};
    for (const m of members[id]) roleDraft[id][m.userId] = m.role;
  } catch (e) {
    alert(e?.body?.error || e?.message || 'Update role failed');
    await fetchMembers(id); // revert
  } finally {
    savingRole[id] = '';
  }
}

async function removeMember(id, userId) {
  if (!confirm('Remove this member?')) return;
  removing[id] = userId;
  try {
    const res = await api.del(`/owner/productions/${id}/members/${userId}`);
    members[id] = res.members || [];
    roleDraft[id] = {};
    for (const m of members[id]) roleDraft[id][m.userId] = m.role;
  } catch (e) {
    alert(e?.body?.error || e?.message || 'Remove failed');
  } finally {
    removing[id] = '';
  }
}

async function remove(p) {
  if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
  busyId.value = p._id;
  try {
    await api.del(`/owner/productions/${p._id}`);
    list.value = list.value.filter(x => x._id !== p._id);
  } catch (e) {
    alert(e?.body?.error || e?.message || 'Delete failed');
  } finally {
    busyId.value = '';
  }
}

onMounted(load);
</script>

<style scoped>
.container { max-width: 920px; margin: 40px auto; padding: 0 16px; }
.head { display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; }
.grid { display: grid; gap: 12px; }
.card { border:1px solid #e5e7eb; border-radius:10px; padding:12px 14px; background:#fff; }
.row { display:flex; justify-content:space-between; align-items:center; }
.title { font-weight: 600; }
.actions { display: inline-flex; gap: 8px; flex-wrap: wrap; }
.btn { padding: 8px 12px; border:1px solid #ddd; border-radius:8px; background:#fafafa; cursor:pointer; }
.btn--danger { background:#fee2e2; border-color:#fecaca; color:#991b1b; }
.muted { color:#666; }
.small { font-size: 12px; }
.error { color: #b91c1c; }

.members { margin-top: 12px; border-top: 1px dashed #e5e7eb; padding-top: 12px; }
.members__head { display:flex; align-items:center; gap: 10px; margin-bottom: 8px; }

.table { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.thead, .tr { display: grid; grid-template-columns: 2fr 2fr 1fr 1fr; }
.thead { background: #f9fafb; font-weight: 600; font-size: 14px; }
.th, .td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
.tbody .tr:last-child .td { border-bottom: none; }

.add { display: grid; grid-template-columns: 1fr 140px 120px; gap: 8px; margin-top: 10px; }
.input { padding: 10px 12px; border:1px solid #e5e7eb; border-radius:8px; }
select.input { background:#fff; }
@media (max-width: 720px) {
  .thead, .tr { grid-template-columns: 1.5fr 1.5fr 1fr 1fr; }
  .add { grid-template-columns: 1fr; }
}
</style>
