<template>
  <div>
    <NavBar :me="me" />

    <div class="container">
      <!-- Toolbar -->
      <div class="toolbar card">
        <div class="toolbar-left">
          <button class="btn btn--primary" @click="createRS" :disabled="creating">
            {{ creating ? 'Creating…' : 'New Run Sheet' }}
          </button>

          <button
            class="btn btn--primary"
            @click="createRSByHand"
            :disabled="creatingHand"
            title="Create a new runsheet and open the handwriting canvas"
          >
            {{ creatingHand ? 'Creating…' : '✍️ Runsheet By Hand' }}
          </button>

          <!-- Upload Photo Runsheet -->
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            capture="environment"
            class="hidden"
            @change="onPhotoPicked"
          />
          <button
            class="btn btn--primary"
            :disabled="uploadingPhoto"
            @click="triggerPhotoPicker"
            title="Upload a photo of a runsheet to create a new record"
          >
            {{ uploadingPhoto ? 'Uploading…' : '📷 Upload Photo Runsheet' }}
          </button>
        </div>

        <div class="toolbar-right">
          <select v-model="statusFilter" class="select">
            <option value="">All statuses</option>
            <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
          </select>

          <label class="check">
            <input type="checkbox" v-model="mine" />
            <span>Mine</span>
          </label>
          <label class="check">
            <input type="checkbox" v-model="assignedToMe" />
            <span>Assigned to me</span>
          </label>
          <label class="check">
            <input type="checkbox" v-model="open" />
            <span>Open pool</span>
          </label>
          <label class="check">
            <input type="checkbox" v-model="handOnly" />
            <span>Handwritten only</span>
          </label>

          <select v-model="typeFilter" class="select">
            <option value="">All types</option>
            <option value="purchase">Purchase</option>
            <option value="rental">Rental</option>
          </select>

          <input v-model="q" placeholder="Filter by title" class="input input--grow" />

          <button class="btn" @click="load" :disabled="loading">
            {{ loading ? 'Refreshing…' : 'Refresh' }}
          </button>

          <span class="muted" v-if="lastUpdated">Updated {{ lastUpdated }}</span>
        </div>
      </div>

      <!-- Lists -->
      <div v-if="loading" class="muted">Loading…</div>

      <div v-else class="list">
        <div v-for="r in filteredList" :key="r._id || r.id" class="card item">
          <!-- Left column -->
          <div class="item__left">
            <img
              class="thumb"
              :src="thumbFor(r)"
              :alt="r.title || 'Runsheet'"
              draggable="false"
              @error="onImgError($event)"
            />

            <div>
              <div class="item__title">
                <RouterLink
                  class="link"
                  :to="viewRoute(r)"
                >
                  {{ r.title || 'Untitled' }}
                </RouterLink>

                <span class="badge">{{ r.status }}</span>
                <span v-if="r.purchaseType" class="badge">{{ r.purchaseType }}</span>
                <span v-if="isHandwritten(r)" class="badge badge--hand">Handwritten</span>
                <span v-if="ocrStatus(r)==='queued'" class="badge badge--soft">OCR queued</span>

                <!-- Quick inline link to handwriting editor when available -->
                <RouterLink
                  v-if="isHandwritten(r)"
                  class="badge badge--link"
                  :to="{ name: 'runsheet-by-hand', params: { slug, id: r._id } }"
                  title="Edit the handwritten runsheet"
                >
                  ✍️ Edit Handwriting
                </RouterLink>
              </div>

              <div class="meta">
                <span>Created: {{ shortDate(r.createdAt) }}</span>
                <span v-if="r.date"> · For: {{ shortDate(r.date) }}</span>
                <span> · By: {{ createdByLabel(r) }}</span>
                <span> · Assigned: {{ assignedLabel(r) }}</span>
              </div>
            </div>
          </div>

          <!-- Right column: actions -->
          <div class="item__actions">
            <RouterLink
              class="btn"
              :to="viewRoute(r)"
            >
              View
            </RouterLink>

            <RouterLink
              v-if="isHandwritten(r)"
              class="btn"
              :to="{ name: 'runsheet-handwritten', params: { slug, id: r._id } }"
              title="Open the merged handwritten image"
            >
              View Handwritten
            </RouterLink>

            <RouterLink
              class="btn"
              :to="{ name: 'runsheet-beta', params: { slug, id: r._id } }"
            >
              View Beta
            </RouterLink>

            <RouterLink
              class="btn"
              :to="{ name: 'runsheet-edit', params: { slug: slug.value, id: r._id } }"
            >
              Edit Runsheet
            </RouterLink>

            <!-- Smart editor button: edit if handwritten exists, otherwise open canvas to start -->
            <RouterLink
              class="btn"
              :to="{ name: 'runsheet-by-hand', params: { slug: slug.value, id: r._id } }"
              :title="isHandwritten(r) ? 'Continue handwriting on canvas' : 'Start handwriting on canvas'"
            >
              {{ isHandwritten(r) ? 'Edit Handwriting' : 'Open Canvas' }}
            </RouterLink>

            <!-- Claim (open + unassigned) -->
            <button
              v-if="r.status==='open' && !hasAssignee(r)"
              class="btn"
              :disabled="busyId===r._id"
              @click="claim(r)"
            >
              Claim
            </button>

            <!-- Start / Complete -->
            <button
              v-if="r.status==='assigned' || r.status==='claimed'"
              class="btn"
              :disabled="busyId===r._id"
              @click="setStatus(r,'in_progress')"
            >
              Start
            </button>

            <button
              v-if="r.status==='in_progress'"
              class="btn"
              :disabled="busyId===r._id"
              @click="setStatus(r,'completed')"
            >
              Complete
            </button>

            <!-- Admin: Assign / Reassign -->
            <button
              v-if="isAdmin && canShowAssign(r)"
              class="btn"
              :disabled="busyId===r._id"
              @click="toggleAssign(r)"
            >
              {{ hasAssignee(r) ? 'Reassign' : 'Assign' }}
            </button>

            <!-- Assignee (or Admin) can release back to open -->
            <button
              v-if="canRelease(r)"
              class="btn"
              :disabled="busyId===r._id"
              @click="release(r)"
            >
              Release
            </button>

            <!-- Delete -->
            <button
              class="btn btn--danger"
              :disabled="busyId===r._id"
              @click="del(r)"
            >
              Delete
            </button>
          </div>

          <!-- Inline Assign Panel -->
          <div v-if="assignOpenId===r._id" class="assign card">
            <div class="assign__row">
              <input
                v-model="userQuery"
                class="input"
                placeholder="Search users by name or email"
                @input="debouncedFetchUsers()"
              />
              <select v-model="selectedUserId" class="select">
                <option disabled value="">Select user…</option>
                <option
                  v-for="u in users"
                  :key="u._id"
                  :value="u._id"
                >
                  {{ u.name || u.email }} <span v-if="u.email && u.name">({{ u.email }})</span>
                </option>
              </select>
              <button
                class="btn btn--primary"
                :disabled="!selectedUserId || busyId===r._id"
                @click="assign(r)"
              >
                Assign
              </button>
              <button class="btn" @click="toggleAssign()">
                Cancel
              </button>
            </div>
            <p v-if="assignError" class="error">{{ assignError }}</p>
          </div>

        </div>

        <div v-if="!filteredList.length" class="empty">
          No runsheets match your filters.
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import NavBar from '../components/NavBar.vue';
import api, { apiGet } from '../api.js';

const route = useRoute();
const router = useRouter();

const slug = computed(() => String(route.params.slug || ''));

/* state */
const me = ref(null);
const list = ref([]);
const loading = ref(false);
const error = ref('');
const creating = ref(false);
const creatingHand = ref(false);
const uploadingPhoto = ref(false);
const busyId = ref('');
const details = ref({});
const lastUpdated = ref('');

/* upload input ref */
const fileInput = ref(null);

/* filters */
const mine = ref(false);
const assignedToMe = ref(false);
const open = ref(false);
const handOnly = ref(false);
const statusFilter = ref('');
const typeFilter = ref('');
const q = ref('');
const statuses = ['draft','open','assigned','claimed','in_progress','completed','cancelled'];

/* production scope */
const productionId = ref(localStorage.getItem('currentProductionId') || '');

/* members cache (Production.members) */
const allMembers = ref([]);

/* my identity from legacy User (used only to match against members) */
const myUserId = computed(() => {
  const m = me.value;
  if (!m) return '';
  if (m.user && typeof m.user === 'object') {
    return String(m.user._id || m.user.id || '');
  }
  return String(m._id || m.id || m.userId || '');
});

const myEmail = computed(() => {
  const m = me.value;
  if (!m) return '';
  const email =
    (m.user && m.user.email) ||
    m.email ||
    '';
  return (email || '').toLowerCase();
});

/* Ensure production + header */
async function ensureProductionId() {
  if (productionId.value) {
    api.setProductionId(productionId.value);
    return productionId.value;
  }
  if (!slug.value) return '';
  try {
    const prod = await apiGet(`/productions/by-slug/${slug.value}`);
    productionId.value = prod?._id || '';
    if (productionId.value) {
      localStorage.setItem('currentProductionId', productionId.value);
      api.setProductionId(productionId.value);
    }
  } catch {
    // ignore
  }
  return productionId.value;
}

/* Load production members (Production.members) */
async function loadMembers() {
  try {
    await ensureProductionId();
    const res = await api.get('/tenant/members');

    if (Array.isArray(res)) {
      allMembers.value = res;
    } else if (res && Array.isArray(res.members)) {
      allMembers.value = res.members;
    } else if (res && Array.isArray(res.users)) {
      allMembers.value = res.users;
    } else if (res && Array.isArray(res.items)) {
      allMembers.value = res.items;
    } else if (res && Array.isArray(res.data)) {
      allMembers.value = res.data;
    } else if (res && Array.isArray(res.results)) {
      allMembers.value = res.results;
    } else {
      allMembers.value = [];
    }
  } catch (e) {
    console.error('Failed to load members for runsheets', e);
    allMembers.value = [];
  }
}

/**
 * membershipIndex:
 *  - byMembershipId: keyed by Production.members _id
 *  - byUserId: keyed by underlying User._id or userId
 */
const membershipIndex = computed(() => {
  const byMembershipId = {};
  const byUserId = {};

  for (const m of allMembers.value || []) {
    if (!m) continue;

    const memId = m._id || m.id;
    let userId =
      m.userId ||
      m.user_id ||
      (m.user && typeof m.user === 'object' && (m.user._id || m.user.id)) ||
      (typeof m.user === 'string' && m.user) ||
      '';

    const normalized = {
      membershipId: memId ? String(memId) : '',
      userId: userId ? String(userId) : '',
      email:
        (m.user && typeof m.user === 'object' && m.user.email) ||
        m.email ||
        '',
      name:
        (m.user && typeof m.user === 'object' && (m.user.name || m.user.displayName)) ||
        m.name ||
        '',
      displayName: m.displayName || '',
      raw: m,
      user: m.user && typeof m.user === 'object' ? m.user : null,
    };

    if (normalized.membershipId) {
      byMembershipId[normalized.membershipId] = normalized;
    }
    if (normalized.userId) {
      byUserId[normalized.userId] = normalized;
    }
  }

  return { byMembershipId, byUserId };
});

/** Generic resolver: given any value (membershipId, userId, or object),
 *  try to find the member record in Production.members
 */
function findMemberFromValue(v) {
  if (!v) return null;
  const { byMembershipId, byUserId } = membershipIndex.value;

  // Object case (could be user doc or membership doc)
  if (typeof v === 'object') {
    const memId = v._id || v.id;
    if (memId && byMembershipId[String(memId)]) {
      return byMembershipId[String(memId)];
    }

    const u = v.user || v;
    const uid = u.userId || u._id || u.id;
    if (uid && byUserId[String(uid)]) {
      return byUserId[String(uid)];
    }

    return null;
  }

  // Primitive id
  const id = String(v);
  if (byMembershipId[id]) return byMembershipId[id];
  if (byUserId[id]) return byUserId[id];
  return null;
}

/* 🔹 Does this runsheet have ANY assignee at all? (membership-based first, then raw) */
function hasAssignee(r) {
  if (!r || !r.assignedTo) return false;

  // If we can resolve to a member, it's definitely assigned
  if (findMemberFromValue(r.assignedTo)) return true;

  const v = r.assignedTo;

  // Otherwise, treat any non-empty id/object as "assigned"
  if (typeof v === 'string' || typeof v === 'number') {
    return String(v).trim().length > 0;
  }
  if (typeof v === 'object') {
    if (v._id || v.id || v.userId || v.user) return true;
  }

  return false;
}

/* Is this runsheet assigned to the current user? */
function isAssignedToCurrentUser(r) {
  const myId = myUserId.value;
  const myEm = myEmail.value;
  if (!myId && !myEm) return false;

  const mem = findMemberFromValue(r.assignedTo);
  if (!mem) return false;

  const memUserId = mem.userId;
  const memEmail =
    (mem.email ||
      (mem.user && mem.user.email) ||
      ''
    ).toLowerCase();

  if (myId && memUserId && String(memUserId) === myId) return true;
  if (myEm && memEmail && memEmail === myEm) return true;

  return false;
}

/* helpers */
const isAdmin = computed(() => me.value?.role === 'admin' || me.value?.isAdmin === true);
const stamp = () => { lastUpdated.value = new Date().toLocaleTimeString(); };

/* Build query string (only server-handled filters) */
function qs(obj = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

function paramsForLoad() {
  const params = {};
  if (mine.value)          params.mine = 1;
  // assignedToMe & open are handled client-side
  if (statusFilter.value) params.status = statusFilter.value;
  if (typeFilter.value)   params.purchaseType = typeFilter.value;
  if (handOnly.value)     params.handwritten = 1;
  return params;
}

/* Labels – always try Production.members first; only fallback to raw id string */
function createdByLabel(r) {
  if (!r) return '—';
  const mem = findMemberFromValue(r.createdBy);
  if (mem) {
    const email = mem.email || (mem.user && mem.user.email) || '';
    const name  = mem.name || (mem.user && (mem.user.name || mem.user.displayName)) || mem.displayName || '';
    if (email && name) return `${name} (${email})`;
    return email || name || '—';
  }

  // No matching member; last-resort: show id as-is if string, otherwise blank
  if (typeof r.createdBy === 'string') return r.createdBy;
  return '—';
}

function assignedLabel(r) {
  if (!r || !r.assignedTo) return '—';
  const mem = findMemberFromValue(r.assignedTo);
  if (mem) {
    const email = mem.email || (mem.user && mem.user.email) || '';
    const name  = mem.name || (mem.user && (mem.user.name || mem.user.displayName)) || mem.displayName || '';
    if (email && name) return `${name} (${email})`;
    return email || name || '—';
  }

  // No matching member; last-resort: id string
  if (typeof r.assignedTo === 'string') return r.assignedTo;
  return '—';
}

/* load runsheets */
const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    await ensureProductionId();
    const query = qs(paramsForLoad());
    const res = await api.get(`/tenant/runsheets${query}`);
    list.value = Array.isArray(res) ? res : (res.items || res.results || []);
    stamp();
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to load runsheets';
  } finally {
    loading.value = false;
  }
};

/* images + thumbnails */
const apiBase = (import.meta.env.VITE_API_BASE || `${window.location.origin}/api`).replace(/\/+$/,'');

const PLACEHOLDER_IMG =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="100%" height="100%" fill="#f2f2f2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="14" fill="#999">No Image</text></svg>'
  );

function normalizeImg(src) {
  if (!src) return '';
  let s = String(src).trim();

  if (s.startsWith('data:')) return s;

  if (/^(?:https?:)?\/\//i.test(s) || s.startsWith('//')) {
    if (s.startsWith('//')) s = `https:${s}`;
    if (location.protocol === 'https:' && s.startsWith('http:')) {
      s = s.replace(/^http:/i, 'https:');
    }
    try {
      const u = new URL(s);
      const path = u.pathname || '';
      const tail = `${path}${u.search || ''}${u.hash || ''}`;
      if (path.startsWith('/api/uploads/')) return `${u.origin}${tail}`;
      if (path.startsWith('/uploads/')) return `${u.origin}/api${tail}`;
      return `${u.origin}${tail}`;
    } catch {
      // fall through
    }
  }

  s = s.replace(/\\/g, '/');
  if (!s.startsWith('/')) s = `/${s}`;
  if (s.startsWith('/api/uploads/')) return `${window.location.origin}${s}`;
  if (s.startsWith('/uploads/')) return `${apiBase}${s}`;
  if (s.startsWith('/api/')) return `${window.location.origin}${s}`;
  return `${apiBase}${s}`;
}

function pickFirstImage(obj) {
  if (!obj) return '';
  if (Array.isArray(obj.photos) && obj.photos.length) {
    const first = obj.photos.find(Boolean);
    if (first) return first;
  }
  if (obj.photo) return obj.photo;
  if (obj.image) return obj.image;
  if (typeof obj === 'string') return obj;
  return '';
}

/* handwritten detection */
function isHandwritten(r) {
  if (!r) return false;
  if (r.handwritten === true) return true;

  if (!r.ocr) return false;
  const latest = r.ocr.latest || {};
  if (latest.image || latest.imageUrl || latest.url) return true;
  if (Array.isArray(r.ocr.images) && r.ocr.images.length) return true;
  return false;
}

function ocrStatus(r) {
  return r?.ocr?.latest?.meta?.status || '';
}

function thumbFor(r) {
  if (isHandwritten(r)) {
    const latest = (r.ocr && r.ocr.latest) || {};
    const raw =
      latest.image ||
      latest.imageUrl ||
      latest.url ||
      (Array.isArray(r.ocr?.images) ? r.ocr.images[0] : '');
    const url = normalizeImg(raw);
    return url || PLACEHOLDER_IMG;
  }
  const raw = pickFirstImage(r);
  if (!raw) return PLACEHOLDER_IMG;
  const url = normalizeImg(raw);
  return url || PLACEHOLDER_IMG;
}

function onImgError(e) {
  const img = e?.target;
  if (!img) return;
  img.onerror = null;
  img.src = PLACEHOLDER_IMG;
}

/* create */
const createRS = async () => {
  creating.value = true;
  error.value = '';
  try {
    const pid = await ensureProductionId();
    if (!pid) throw new Error('No production selected');

    const rs = await api.post('/tenant/runsheets', {
      title: 'Untitled',
      status: 'draft',
      productionId: pid
    });

    router.push({ name: 'runsheet-edit', params: { slug: slug.value, id: rs._id } });
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to create runsheet';
  } finally {
    creating.value = false;
  }
};

const createRSByHand = async () => {
  creatingHand.value = true;
  error.value = '';
  try {
    const pid = await ensureProductionId();
    if (!pid) throw new Error('No production selected');

    const rs = await api.post('/tenant/runsheets', {
      title: 'Untitled (By Hand)',
      status: 'draft',
      productionId: pid,
      handwritten: true
    });

    router.push({ name: 'runsheet-by-hand', params: { slug: slug.value, id: rs._id } });
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to create runsheet for By Hand';
  } finally {
    creatingHand.value = false;
  }
};

/* photo upload -> create new runsheet -> upload image -> go to handwritten view */
function triggerPhotoPicker() {
  fileInput.value?.click();
}

async function onPhotoPicked(ev) {
  const file = ev?.target?.files?.[0];
  ev.target.value = '';
  if (!file) return;

  if (!/image\/(png|jpeg|jpg|webp)/i.test(file.type)) {
    error.value = 'Please choose a PNG, JPEG, or WEBP image.';
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    error.value = 'Image is larger than 20 MB. Please choose a smaller file.';
    return;
  }

  uploadingPhoto.value = true;
  error.value = '';

  try {
    const pid = await ensureProductionId();
    if (!pid) throw new Error('No production selected');

    const niceTitle = `Photo Upload ${new Date().toLocaleString()}`;
    const rs = await api.post('/tenant/runsheets', {
      title: niceTitle,
      status: 'draft',
      productionId: pid,
      handwritten: true
    });

    const fd = new FormData();
    fd.append('file', file, file.name || 'runsheet.jpg');
    fd.append('runsheetId', rs._id);

    await api.post('/tenant/ocr/runsheet', fd, { multipart: true });

    await load();

    router.push({ name: 'runsheet-handwritten', params: { slug: slug.value, id: rs._id } });
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to upload photo runsheet';
  } finally {
    uploadingPhoto.value = false;
  }
}

/* item/detail helpers */
const ensureDetails = async (r) => {
  if (details.value[r._id]) return;
  try {
    const full = await api.get(`/tenant/runsheets/${r._id}`);
    details.value = { ...details.value, [r._id]: full };
  } catch {
    // ignore
  }
};

/* assignment + status actions */
const assignOpenId = ref('');
const users = ref([]);
const userQuery = ref('');
const selectedUserId = ref('');
const assignError = ref('');
let assignTimer;

const debouncedFetchUsers = (delay = 300) => {
  clearTimeout(assignTimer);
  assignTimer = setTimeout(fetchUsers, delay);
};

const toggleAssign = (r = null) => {
  assignError.value = '';
  if (!r) {
    assignOpenId.value = '';
    selectedUserId.value = '';
    userQuery.value = '';
    users.value = [];
    return;
  }
  if (assignOpenId.value === r._id) {
    assignOpenId.value = '';
    selectedUserId.value = '';
    userQuery.value = '';
    users.value = [];
  } else {
    assignOpenId.value = r._id;
    selectedUserId.value = '';
    userQuery.value = '';
    users.value = [];
  }
};

const fetchUsers = async () => {
  try {
    const term = userQuery.value?.trim() || '';
    users.value = await api.get(`/tenant/members${term ? `?q=${encodeURIComponent(term)}` : ''}`);
  } catch (e) {
    assignError.value = e?.body?.error || e?.message || 'Failed to search users';
  }
};

const assign = async (r) => {
  if (!selectedUserId.value) return;
  busyId.value = r._id;
  try {
    const updated = await api.post(`/tenant/runsheets/${r._id}/assign`, { userId: selectedUserId.value });
    const idx = list.value.findIndex(x => x._id === r._id);
    if (idx !== -1) list.value[idx] = { ...list.value[idx], ...updated };
  } catch (e) {
    assignError.value = e?.body?.error || e?.message || 'Failed to assign';
  } finally {
    busyId.value = '';
  }
};

const claim = async (r) => {
  busyId.value = r._id;
  try {
    const updated = await api.post(`/tenant/runsheets/${r._id}/claim`);
    const idx = list.value.findIndex(x => x._id === r._id);
    if (idx !== -1) list.value[idx] = { ...list.value[idx], ...updated };
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to claim';
  } finally {
    busyId.value = '';
  }
};

const setStatus = async (r, status) => {
  busyId.value = r._id;
  try {
    const updated = await api.patch(`/tenant/runsheets/${r._id}`, { status });
    const idx = list.value.findIndex(x => x._id === r._id);
    if (idx !== -1) list.value[idx] = { ...list.value[idx], ...updated };
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to update status';
  } finally {
    busyId.value = '';
  }
};

const canShowAssign = (r) => {
  return isAdmin.value && ['open','assigned','claimed','in_progress'].includes(r.status);
};

const canRelease = (r) => {
  return isAdmin.value || isAssignedToCurrentUser(r);
};

const release = async (r) => {
  busyId.value = r._id;
  try {
    const updated = await api.post(`/tenant/runsheets/${r._id}/release`);
    const idx = list.value.findIndex(x => x._id === r._id);
    if (idx !== -1) list.value[idx] = { ...list.value[idx], ...updated };
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to release';
  } finally {
    busyId.value = '';
  }
};

const del = async (r) => {
  if (!confirm('Delete this runsheet?')) return;
  busyId.value = r._id;
  try {
    await api.del(`/tenant/runsheets/${r._id}`);
    list.value = list.value.filter(x => x._id !== r._id);
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to delete';
  } finally {
    busyId.value = '';
  }
};

/* computed + routing */
/* Local filters: q, handOnly, open, assignedToMe; server ones already in paramsForLoad */
const filteredList = computed(() => {
  const term           = q.value.trim().toLowerCase();
  const wantHand       = !!handOnly.value;
  const wantOpen       = !!open.value;
  const wantAssignedMe = !!assignedToMe.value;

  return (list.value || []).filter((r) => {
    const titleOk = !term || (r.title || '').toLowerCase().includes(term);
    const handOk  = !wantHand || isHandwritten(r);

    let openOk = true;
    if (wantOpen) {
      // 🔹 Open pool: ANY status, but must have NO assignee
      openOk = !hasAssignee(r);
    }

    let assignedOk = true;
    if (wantAssignedMe) {
      assignedOk = isAssignedToCurrentUser(r);
    }

    return titleOk && handOk && openOk && assignedOk;
  });
});

function viewRoute(r) {
  if (isHandwritten(r)) {
    return { name: 'runsheet-handwritten', params: { slug: slug.value, id: r._id } };
  }
  return { name: 'runsheet-view', params: { slug: slug.value, id: r._id } };
}

/* utils */
const shortDate = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
};

/* watch filters -> reload from server when they change (server-handled filters only) */
watch(
  [mine, statusFilter, typeFilter],
  () => {
    load();
  }
);

/* boot */
onMounted(async () => {
  try { me.value = await apiGet('/tenant/tenantauth/me'); } catch { me.value = null; }
  await ensureProductionId();
  await Promise.all([
    loadMembers(),
    load(),
  ]);
});
</script>

<style scoped>
.hidden {
  display: none;
}
</style>








<style scoped>
:root{
  --bg:#0f1113;
  --panel:#14171a;
  --elev:#191d21;
  --ink:#f5f6f7;
  --muted:#a4a8ae;
  --line:#2c3137;
  --line-light:#3a4047;
  --accent:#ffffff;
  --focus:#ffffff;
  --shadow-soft:0 6px 16px rgba(0,0,0,.25);
  --shadow-inset:inset 0 1px 0 rgba(255,255,255,.04);
}

*{box-sizing:border-box}

.hidden {
  display: none;
}

/* ---------- Page container ---------- */
.container{
  max-width:1200px;
  margin:0 auto;
  padding:18px 20px 28px;
  background:var(--bg);
  color:var(--ink);
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,"Noto Sans","Helvetica Neue",sans-serif;
}

/* ---------- Toolbar ---------- */
.toolbar{
  display:grid;
  grid-template-columns:auto auto auto auto auto 1fr auto auto;
  gap:10px;
  align-items:center;
  background:var(--panel);
  border:1px solid var(--line-light);
  border-radius:12px;
  padding:12px;
  margin-bottom:16px;
  box-shadow:var(--shadow-soft);
}

.toolbar-left,
.toolbar-right {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}

.toolbar .muted{color:var(--muted)}
.input--grow{width:100%}

/* ---------- Cards / list ---------- */
.list{
  display:grid;
  gap:12px;
}

.card{
  background:var(--panel);
  border:1px solid var(--line-light);
  border-radius:12px;
  box-shadow:var(--shadow-soft);
}

.item{
  display:grid;
  grid-template-columns:1fr auto;
  gap:14px;
  padding:16px;
}

/* Left side: thumb + text */
.item__left{
  display:grid;
  grid-template-columns:72px 1fr;
  gap:12px;
  align-items:start;
}

.thumb{
  width:72px;
  height:72px;
  border-radius:8px;
  object-fit:cover;
  object-position:center;
  background:#fff;
  border:1px solid var(--line-light,#3a4047);
  box-shadow:0 4px 12px rgba(0,0,0,.25);
  user-select:none;
}

/* Title + badges */
.item__title{
  display:flex;
  align-items:baseline;
  gap:8px;
  font-weight:700;
  letter-spacing:.2px;
  flex-wrap:wrap;          /* allow badges to wrap under title */
  min-width:0;             /* enable flex child truncation */
}

.link{
  color:var(--accent);
  text-decoration:none;
  border-bottom:1px solid transparent;
  display:inline-block;
  max-width:100%;
  overflow:hidden;
  text-overflow:ellipsis;
  word-break:break-word;   /* long titles/IDs wrap instead of overflowing */
}
.link:hover{border-bottom-color:var(--accent)}

.meta{
  margin-top:6px;
  color:var(--muted);
  font-size:12px;
  letter-spacing:.2px;
}

.badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:4px 9px;
  border-radius:999px;
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:.6px;
  color:var(--ink);
  background:var(--elev);
  border:1px solid var(--line-light);
  white-space:nowrap;
}
.badge--hand{background:#1f2937;border-color:#4b5563; color:#fff}
.badge--soft{opacity:.8}
.badge--link{
  cursor:pointer;
  background:transparent;
  border-style:dashed;
}

/* ---------- Buttons ---------- */
.btn,
a.btn,
.router-link-active.btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:.4rem;
  text-decoration:none;
  user-select:none;
  cursor:pointer;
  background-color:transparent;
  color:var(--ink);
  border:1px solid var(--line-light);
  border-radius:10px;
  padding:9px 12px;
  font-weight:700;
  letter-spacing:.3px;
  transition:
    transform .04s ease,
    filter .12s ease,
    box-shadow .12s ease,
    border-color .12s ease,
    background-color .12s ease;
  box-shadow:var(--shadow-inset);
}
.btn:hover,
a.btn:hover{background-color:rgba(255,255,255,.06)}
.btn:active,
a.btn:active{transform:translateY(1px)}
.btn:disabled,
a.btn[aria-disabled="true"]{opacity:.65;cursor:not-allowed}

.btn--primary{
  background-color:var(--accent);
  color:#111;
  border-color:#dcdcdc;
  box-shadow:0 4px 10px rgba(0,0,0,.25);
}
.btn--primary:hover{filter:brightness(.96)}

.btn--danger{
  background:#f4f4f4;
  color:#000;
  border-color:#dcdcdc;
}

/* ---------- Inputs & selects ---------- */
.input,
.select{
  width:100%;
  background:var(--elev);
  color:var(--ink);
  border:1px solid var(--line-light);
  border-radius:10px;
  padding:9px 11px;
  outline:none;
  box-shadow:var(--shadow-inset);
}
.input::placeholder{color:var(--muted)}
.input:focus,
.select:focus{
  border-color:var(--focus);
  box-shadow:0 0 0 2px rgba(255,255,255,.08),var(--shadow-inset);
}

/* ---------- Checkboxes ---------- */
.check{
  display:inline-flex;
  align-items:center;
  gap:8px;
  color:var(--ink);
  user-select:none;
}
.check input[type="checkbox"]{
  appearance:none;
  width:18px;
  height:18px;
  cursor:pointer;
  border:2px solid #000;
  border-radius:4px;
  background:var(--elev);
  position:relative;
  box-shadow:var(--shadow-inset);
}
.check input[type="checkbox"]:checked{
  background:var(--accent);
  border-color:#000;
}
.check input[type="checkbox"]:checked::after{
  content:"";
  position:absolute;
  left:5px;
  top:2px;
  width:6px;
  height:10px;
  border:solid #111;
  border-width:0 2px 2px 0;
  transform:rotate(45deg);
}

/* ---------- Actions column ---------- */
.item__actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  align-items:center;
  justify-content:flex-end;
}

/* ---------- Inline assign panel ---------- */
.assign{
  background:var(--panel);
  border:1px dashed var(--line-light);
  border-top:none;
  padding:12px;
  border-radius:0 0 12px 12px;
  box-shadow:var(--shadow-soft) inset;
}
.assign__row{
  display:grid;
  grid-template-columns:1fr 300px auto auto;
  gap:10px;
}
.error{
  color:#fff;
  background:#101216;
  border:1px solid var(--line-light);
  padding:8px 10px;
  border-radius:10px;
  margin-top:10px;
  box-shadow:var(--shadow-soft);
}

/* ---------- Empty state ---------- */
.empty{
  text-align:center;
  color:#fff;
  padding:30px 10px;
  border:1px dashed var(--line-light);
  border-radius:12px;
  background:#111418;
  box-shadow:var(--shadow-soft) inset;
}
.muted{color:var(--muted)}

/* ---------- Focus ring ---------- */
:focus-visible{
  outline:2px solid var(--focus);
  outline-offset:2px;
}

/* ---------- Responsive tweaks ---------- */

/* Tablet + small laptop */
@media (max-width:980px){
  .toolbar{
    grid-template-columns:1fr;
  }

  .toolbar-left,
  .toolbar-right{
    grid-column:1 / -1;
  }

  .item{
    grid-template-columns:1fr;
  }

  .item__actions{
    justify-content:flex-start;
  }

  .assign__row{
    grid-template-columns:1fr;
  }
}

/* Phone-ish widths */
@media (max-width:720px){
  .container{
    padding:14px 12px 22px;
  }

  .toolbar{
    padding:10px;
    gap:8px;
  }

  .toolbar-left,
  .toolbar-right{
    flex-direction:row;
    flex-wrap:wrap;
  }

  .toolbar-left .btn,
  .toolbar-right .btn{
    flex:1 1 100%;       /* big thumb-friendly buttons */
  }

  .toolbar-right .input--grow{
    min-width:0;
    flex:1 1 100%;
  }

  .toolbar-right .select{
    min-width:140px;
    flex:1 1 48%;
  }

  .check{
    font-size:12px;
  }

  .item{
    padding:12px;
  }

  .item__left{
    grid-template-columns:60px 1fr;
    gap:10px;
  }

  .thumb{
    width:60px;
    height:60px;
  }

  .item__actions{
    gap:6px;
  }

  .item__actions .btn{
    flex:1 1 calc(50% - 6px);
    min-width:0;
    padding:8px 10px;
    font-size:13px;
  }
}

/* Very narrow phones */
@media (max-width:480px){
  .toolbar-left .btn,
  .toolbar-right .btn{
    flex:1 1 100%;
  }

  .item__actions .btn{
    flex:1 1 100%;
  }

  .item__left{
    grid-template-columns:1fr;
  }

  .thumb{
    width:100%;
    max-width:220px;
    height:auto;
    justify-self:flex-start;
  }
}
</style>
