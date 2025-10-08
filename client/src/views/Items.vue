<template>
  <div>
    <NavBar :me="me" @logout="logout" />

    <div class="container">
      <!-- Toolbar -->
      <div class="toolbar card">
        <input v-model="q" placeholder="Search items (name, text index)" class="input input--grow" />
        <select v-model="filterPlaceId" class="select">
          <option :value="''">All places</option>
          <option v-for="p in placeFilterOpts" :key="p._id" :value="p._id">{{ p.name }}</option>
        </select>
        <button class="btn" @click="load">Search</button>
        <button class="btn btn--primary" @click="createItem">New Item</button>
        <span class="spacer"></span>
        <span class="muted" v-if="lastUpdated">Updated {{ lastUpdated }}</span>
      </div>

      <!-- Map Panel -->
      <div class="card map-card">
        <div class="map-head">
          <div class="map-title">Item Locations</div>
          <div class="muted small" v-if="mapStatus">{{ mapStatus }}</div>
        </div>
        <div ref="mapEl" class="map"></div>
      </div>

      <!-- List -->
      <div v-if="loading" class="muted">Loading…</div>

      <div v-else class="list">
        <div v-for="it in list" :key="it._id" class="card item">
          <div class="item__main">
            <div class="item__title">
              <div class="name">{{ it.name }}</div>
              <span class="qty">(x{{ it.quantity }})</span>
            </div>
            <div class="meta" v-if="it.location?.name">{{ it.location.name }}</div>
            <div class="desc" v-if="it.description">{{ it.description }}</div>

            <div class="thumbs">
              <img
                v-for="p in it.photos || []"
                :key="p"
                :src="imageUrl(p)"
                class="thumb"
                alt="Item photo"
              />
            </div>
          </div>

        <div class="item__actions">
          <button class="btn" @click="edit(it)">Edit</button>
          <button class="btn btn--danger" @click="del(it)">Delete</button>
        </div>
      </div>

      <div v-if="!list.length && !loading" class="card empty muted">
        No items found. Try a different search.
      </div>
    </div>

    <!-- Editor Modal -->
    <div v-if="editing" class="modal">
      <div class="modal__backdrop" @click="editing=null"></div>

      <div class="modal__card">
        <div class="modal__head">
          <h3 class="title">{{ editing._id ? 'Edit Item' : 'New Item' }}</h3>
          <button
  class="btn"
  @click="() => { editing=null; $router.push(`/${slug}/items`) }"
>
  Close
</button>
        </div>

        <div class="grid">
          <!-- Name -->
          <div class="field">
            <label class="label">Name</label>
            <input v-model.trim="editing.name" class="input" placeholder="Lamp, sofa, etc." />
          </div>

          <!-- Quantity -->
          <div class="field">
            <label class="label">Quantity</label>
            <input type="number" v-model.number="editing.quantity" min="0" class="input" />
          </div>

          <!-- Description -->
          <div class="field field--full">
            <label class="label">Description</label>
            <textarea v-model="editing.description" rows="3" class="textarea" placeholder="Notes, condition, color, measurements…"></textarea>
          </div>

          <!-- Location Picker -->
          <div class="divider field--full"></div>
          <div class="field field--full">
            <div class="row">
              <div class="mini-title">Location</div>
              <div class="muted">Selected: {{ editing.location?.name || '(none)' }}</div>
            </div>
            <div class="row row--tight">
              <input v-model="placeQ" placeholder="Search places…" class="input input--grow" />
              <button class="btn" @click="searchPlaces">Search</button>
              <button v-if="editing.location" class="btn" @click="clearLocation">Clear</button>
            </div>
            <div class="pillbar">
              <button
                v-for="p in placeResults"
                :key="p._id"
                class="pill"
                @click="setLocation(p)"
              >
                {{ p.name }}
              </button>
            </div>
          </div>

          <!-- Photos -->
          <div class="divider field--full"></div>
          <div class="field field--full">
            <div class="row row--tight">
              <div class="mini-title">Photos</div>
              <input type="file" multiple @change="uploadItemPhotos" />
            </div>

            <div class="thumbs thumbs--edit">
              <div v-for="p in editing.photos || []" :key="p" class="thumbwrap">
                <img :src="imageUrl(p)" class="thumb thumb--lg" alt="Item photo" />
                <button class="chip chip--x" @click="removeItemPhoto(p)" title="Remove">×</button>
              </div>
            </div>
          </div>
        </div>

        <div class="modal__foot">
          <button class="btn btn--primary" @click="save" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import NavBar from '../components/NavBar.vue';
import api, { apiGet } from '../api.js';

const router = useRouter();
const route = useRoute();
const slug = computed(() => String(route.params.slug || ''));

const me = ref(null);
const q = ref('');
const filterPlaceId = ref('');
const placeFilterOpts = ref([]);
const list = ref([]);
const loading = ref(false);
const error = ref('');
const lastUpdated = ref('');
const editing = ref(null);
const saving = ref(false);

const placeQ = ref('');
const placeResults = ref([]);

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api').replace(/\/+$/, '');
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '') || window.location.origin;

const logout = () => {
  router.replace({ name: 'tenant-logout', params: { slug: slug.value } });
};

const apiBase = (import.meta.env.IMAGE_BASE || '');
const IMAGE_BASE = import.meta.env.VITE_IMAGE_BASE || '/api'; // leave empty for same-origin

function imageUrl(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p; // already absolute
  let path = String(p);

  // normalize to /uploads/...
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  if (!path.startsWith('/uploads/')) {
    path = '/uploads/' + path.replace(/^\/+/, '');
  }

  // encode just the filename, not the whole path
  const parts = path.split('/');
  const file = parts.pop();
  return (IMAGE_BASE + [...parts, encodeURIComponent(file)].join('/'));
}

const stamp = () => { lastUpdated.value = new Date().toLocaleTimeString(); };

const qs = (obj = {}) => {
  const s = new URLSearchParams(obj).toString();
  return s ? `?${s}` : '';
};

const loadPlacesForFilter = async () => {
  try {
    const res = await api.get('/tenant/places' + qs({ q: '' }));
    placeFilterOpts.value = Array.isArray(res) ? res : (res.items || []);
  } catch {}
};

const load = async () => {
  loading.value = true; error.value = '';
  try {
    const params = {};
    if (q.value.trim()) params.q = q.value.trim();
    if (filterPlaceId.value) params.placeId = filterPlaceId.value;

    const res = await api.get('/tenant/items' + qs(params));
    list.value = Array.isArray(res) ? res : (res.items || []);
    stamp();
    await nextTick();
    updateMarkers();
  } catch (e) {
    error.value = e?.body?.error || e.message || 'Failed to load items';
  } finally {
    loading.value = false;
  }
};

const createItem = () => {
  editing.value = { name: 'Untitled', quantity: 1, description: '', photos: [], location: null };
};
const edit = (it) => { editing.value = JSON.parse(JSON.stringify(it)); };

const save = async () => {
  if (!editing.value?.name?.trim()) { error.value = 'Name is required'; return; }
  saving.value = true; error.value = '';
  try {
    const payload = { ...editing.value };
    if (payload.location && payload.location._id) payload.location = payload.location._id;
    if (!payload.photos) payload.photos = [];
    if (editing.value._id) {
      editing.value = await api.patch(`/tenant/items/${editing.value._id}`, payload);
    } else {
      editing.value = await api.post('/tenant/items', payload);
    }
    await load();
  } catch (e) {
    error.value = e?.body?.error || 'Failed to save';
  } finally {
    saving.value = false;
  }
};

const del = async (it) => {
  if (!confirm(`Delete "${it.name}"?`)) return;
  try {
    await api.delete(`/tenant/items/${it._id}`);
    await load();
  } catch (e) {
    error.value = e?.body?.error || 'Failed to delete';
  }
};

// Photos (use raw fetch so FormData sets its own boundary + headers)
const uploadItemPhotos = async (e) => {
  try {
    if (!editing.value?._id) {
      await save();
      if (!editing.value?._id) return;
    }
    const fd = new FormData();
    [...e.target.files].forEach(f => fd.append('photos', f));

    const token  = localStorage.getItem('token') || '';
    const prodId = localStorage.getItem('currentProductionId') || '';
    const res = await fetch(`${API_BASE}/tenant/items/${editing.value._id}/photos`, {
      method: 'POST',
      headers: {
        ...(token  ? { Authorization: `Bearer ${token}` } : {}),
        ...(prodId ? { 'x-production-id': prodId } : {}),
        // No Content-Type: browser sets it for FormData
      },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Upload failed');

    editing.value = data;
    await load();
  } catch (e2) {
    error.value = e2?.message || 'Failed to upload photos';
  } finally {
    e.target.value = '';
  }
};

const removeItemPhoto = async (url) => {
  try {
    const token  = localStorage.getItem('token') || '';
    const prodId = localStorage.getItem('currentProductionId') || '';
    const res = await fetch(`${API_BASE}/tenant/items/${editing.value._id}/photos`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token  ? { Authorization: `Bearer ${token}` } : {}),
        ...(prodId ? { 'x-production-id': prodId } : {}),
      },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to remove photo');
    editing.value = data;
    await load();
  } catch (e) {
    error.value = e?.message || 'Failed to remove photo';
  }
};

// Location picker
const searchPlaces = async () => {
  try {
    const res = await api.get('/tenant/places' + qs({ q: placeQ.value.trim() || '' }));
    placeResults.value = Array.isArray(res) ? res : (res.items || []);
  } catch (e) {
    error.value = e?.body?.error || 'Failed to search places';
  }
};
const setLocation = (p) => { editing.value.location = p; };
const clearLocation = () => { editing.value.location = null; };

/* =======================
   Google Maps integration
   ======================= */
const mapEl = ref(null);
let map = null;
let infoWindow = null;
let markers = [];
const mapStatus = ref('');
const placeCache = new Map();

function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (!GMAPS_KEY) {
      mapStatus.value = 'Missing Google Maps API key';
      return resolve(null);
    }
    if (window.google?.maps) return resolve(window.google);
    const cbName = '__gmaps_cb_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GMAPS_KEY)}&callback=${cbName}`;
    s.onerror = () => reject(new Error('Failed to load Google Maps'));
    window[cbName] = () => {
      delete window[cbName];
      resolve(window.google);
    };
    document.head.appendChild(s);
  });
}

function extractLatLngFromPlace(place) {
  if (!place) return null;

  if (place.geo?.type === 'Point' && Array.isArray(place.geo.coordinates) && place.geo.coordinates.length >= 2) {
    const [lng, lat] = place.geo.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  const lat = place.lat ?? place.latitude ?? place.location?.lat ?? place.coords?.lat;
  const lng = place.lng ?? place.longitude ?? place.location?.lng ?? place.coords?.lng;
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

  return null;
}

async function ensurePlaceDetail(locRef) {
  if (locRef && typeof locRef === 'object' && locRef._id) {
    return locRef;
  }
  const id = typeof locRef === 'string' ? locRef : locRef?._id;
  if (!id) return null;
  if (placeCache.has(id)) return placeCache.get(id);
  try {
    const p = await api.get(`/tenant/places/${id}`);
    placeCache.set(id, p);
    return p;
  } catch {
    return null;
  }
}

async function buildMarkersFromList() {
  if (!map || !Array.isArray(list.value)) return;

  markers.forEach(m => m.setMap(null));
  markers = [];

  const bounds = new google.maps.LatLngBounds();
  let added = 0;

  for (const it of list.value) {
    const place = await ensurePlaceDetail(it.location);
    const pos = extractLatLngFromPlace(place);
    if (!pos) continue;

    const marker = new google.maps.Marker({
      position: pos,
      map,
      title: it.name || 'Item',
    });

    marker.addListener('click', () => {
      const html = `
        <div style="min-width:180px">
          <div style="font-weight:700">${it.name || 'Item'}</div>
          <div class="small">Qty: ${it.quantity ?? 1}</div>
          <div class="small">${place?.name || 'Unknown place'}</div>
        </div>`;
      infoWindow.setContent(html);
      infoWindow.open({ anchor: marker, map });
    });

    markers.push(marker);
    bounds.extend(marker.getPosition());
    added++;
  }

  if (added > 0) {
    map.fitBounds(bounds);
    mapStatus.value = `${added} location${added === 1 ? '' : 's'} plotted`;
  } else {
    map.setCenter({ lat: 43.6532, lng: -79.3832 });
    map.setZoom(10);
    mapStatus.value = 'No mappable item locations';
  }
}

async function initMapIfNeeded() {
  if (map || !mapEl.value) return;
  const g = await loadGoogleMaps().catch(() => null);
  if (!g) return;
  map = new g.maps.Map(mapEl.value, {
    center: { lat: 43.6532, lng: -79.3832 },
    zoom: 10,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });
  infoWindow = new g.maps.InfoWindow();
}

async function updateMarkers() {
  await initMapIfNeeded();
  if (!map) return;
  buildMarkersFromList();
}

/* ======================= */

onMounted(async () => {
  try {
    me.value = await apiGet('/tenant/tenantauth/me');
  } catch {
    me.value = null;
  }
  await Promise.all([load(), loadPlacesForFilter()]);
  await nextTick();
  updateMarkers();
});

watch([list, filterPlaceId], () => {
  updateMarkers();
});
</script>



  
  <style scoped>
  /* ---------- Layout ---------- */
  .container {
    max-width: 1120px;
    margin: 0 auto;
    padding: 24px 16px;
  }
  
  .list {
    display: grid;
    gap: 12px;
  }
  
  .card {
    background: #fff;
    border: 1px solid #ececec;
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,.04);
  }
  
  .toolbar {
    padding: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  
  /* ---------- Inputs ---------- */
  .input,
  .select,
  .textarea {
    border: 1px solid #d6d6d6;
    background: #fff;
    color: #111;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
  }
  .input { height: 34px; }
  .input--grow { width: 280px; }
  @media (max-width: 720px) { .input--grow { width: 100%; } }
  .textarea { width: 100%; resize: vertical; }
  .spacer { margin-left: auto; }
  
  /* ---------- Buttons ---------- */
  .btn {
    appearance: none;
    border: 1px solid #d6d6d6;
    background: #f7f7f7;
    color: #1f2937;
    font: inherit;
    font-size: 14px;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    transition: background .15s ease, border-color .15s ease, transform .02s ease;
  }
  .btn:hover { background: #efefef; border-color: #cdcdcd; }
  .btn:active { transform: translateY(1px); }
  .btn--primary {
    background: #111827;
    color: #fff;
    border-color: #111827;
  }
  .btn--primary:hover { background: #0b1220; border-color: #0b1220; }
  .btn--danger {
    background: #fff;
    color: #b42318;
    border-color: #f1b3ac;
  }
  .btn--danger:hover { background: #fff5f5; border-color: #eba79f; }
  
  /* ---------- Item cards ---------- */
  .item {
    padding: 14px 16px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
  }
  .item__main { min-width: 0; }
  .item__actions {
    display: flex; gap: 8px; align-items: flex-start; justify-content: flex-end;
  }
  .item__title { display: flex; align-items: baseline; gap: 8px; }
  .name { font-weight: 600; word-break: break-word; }
  .qty { font-size: 12px; color: #6b7280; }
  .meta { color: #6b7280; font-size: 12px; margin-top: 2px; }
  .desc { margin-top: 6px; white-space: pre-wrap; font-size: 14px; color: #1f2937; }
  
  .thumbs {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .thumb {
    width: 56px; height: 56px;
    object-fit: cover;
    border: 1px solid #eee;
    border-radius: 8px;
    background: #fafafa;
  }
  
  /* ---------- Empty state ---------- */
  .empty {
    padding: 14px;
    text-align: center;
  }
  
  /* ---------- Modal ---------- */
  .modal {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.4);
    display: grid; place-items: center;
    z-index: 50;
  }
  .modal__card {
    background: #fff;
    width: 100%;
    max-width: 720px;
    border-radius: 12px;
    border: 1px solid #ececec;
    box-shadow: 0 20px 60px rgba(0,0,0,.25);
    padding: 16px;
    display: grid;
    gap: 12px;
  }
  .modal__head,
  .modal__foot {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
  }
  .title { font-size: 18px; font-weight: 600; margin: 0; }
  
  /* ---------- Editor grid ---------- */
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0,1fr));
    gap: 12px;
  }
  .field { display: grid; gap: 6px; }
  .field--full { grid-column: 1 / -1; }
  .label { font-size: 12px; color: #6b7280; }
  .mini-title { font-size: 14px; font-weight: 600; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .row--tight { justify-content: flex-start; gap: 8px; }
  .divider { height: 1px; background: #eee; margin: 8px 0; border: none; }
  
  /* ---------- Editor photos ---------- */
  .thumbs--edit { gap: 10px; margin-top: 8px; }
  .thumbwrap { position: relative; width: 80px; height: 80px; }
  .thumb--lg {
    width: 100%; height: 100%;
    border-radius: 10px; border: 1px solid #ececec; object-fit: cover; background: #fafafa;
  }
  .chip {
    position: absolute; top: -6px; right: -6px;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid #dcdcdc;
    display: grid; place-items: center;
    cursor: pointer;
  }
  .chip--x { font-weight: 600; }
  
  /* ---------- Helpers ---------- */
  .muted { color: #6b7280; font-size: 12px; }
  .error {
    margin-top: 12px;
    color: #b42318;
    background: #fff1f0;
    border: 1px solid #ffd7d5;
    padding: 10px 12px;
    border-radius: 8px;
  }

  .map-card {
  margin-bottom: 16px;
  border-radius: 12px;
  border: 1px solid var(--line-light, #3a4047);
  overflow: hidden;
}

/* simple header above the map */
.map-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line-light, #3a4047);
}
.map-title { font-weight: 700; letter-spacing: .2px; }
.small { font-size: 12px; }

.map {
  width: 100%;
  height: 360px;       /* 👈 important: give it height */
  background: #0f1113; /* matches your theme bg so it doesn’t flash white */
}
  
  /* ---------- Responsive ---------- */
  @media (max-width: 760px) {
    .item { grid-template-columns: 1fr; }
    .modal__card { max-width: 94vw; }
    .grid { grid-template-columns: 1fr; }
  }
  </style>
  