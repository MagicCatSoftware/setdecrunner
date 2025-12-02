<template>
  <div>
    <NavBar :me="me" />

    <div class="dash container">
      <!-- Welcome / Quick actions -->
      <section class="panel">
  <div class="header-row">
    <h1 class="title">Welcome, {{ me?.name || '—' }}</h1>

    <div class="spacer"></div>

    <div class="actions">
      <!-- Primary actions -->
      <RouterLink
        class="btn btn--primary"
        :to="{ name: 'runsheets', params: { slug } }"
        draggable="false"
      >
        Runsheets
      </RouterLink>

      <RouterLink
        class="btn btn--primary"
        :to="{ name: 'runsheet-new', params: { slug } }"
        draggable="false"
      >
        + New Runsheet
      </RouterLink>

      <!-- Secondary shortcuts -->
      <RouterLink
        class="btn btn--ghost"
        :to="{ name: 'items', params: { slug } }"
        draggable="false"
      >
        Items
      </RouterLink>

      <RouterLink
        class="btn btn--ghost"
        :to="{ name: 'places', params: { slug } }"
        draggable="false"
      >
        Places
      </RouterLink>

      <RouterLink
        class="btn btn--ghost"
        :to="{ name: 'people', params: { slug } }"
        draggable="false"
      >
        People
      </RouterLink>

      <RouterLink
        class="btn btn--ghost"
        :to="{ name: 'sets', params: { slug } }"
        draggable="false"
      >
        Sets
      </RouterLink>

      <RouterLink
        class="btn btn--ghost"
        :to="{ name: 'driver', params: { slug } }"
        draggable="false"
      >
        Driver View
      </RouterLink>

      <!-- Admin only -->
      <RouterLink
        v-if="me?.role === 'admin'"
        class="btn btn--danger"
        :to="{ name: 'admin-users', params: { slug } }"
        draggable="false"
      >
        Admin Users
      </RouterLink>
    </div>
  </div>

  <p class="muted">Tap a button above to jump into the most common tools.</p>
</section>

      <!-- Stats -->
      <section class="stats">
        <div class="stat card">
          <div class="stat__label">Assigned to me</div>
          <div class="stat__value">{{ counts.assignedToMe }}</div>
        </div>
        <div class="stat card">
          <div class="stat__label">Open pool</div>
          <div class="stat__value">{{ counts.openPool }}</div>
        </div>
        <div class="stat card">
          <div class="stat__label">Items</div>
          <div class="stat__value">{{ counts.items }}</div>
        </div>
        <div class="stat card">
          <div class="stat__label">Places</div>
          <div class="stat__value">{{ counts.places }}</div>
        </div>
      </section>

      <!-- Map: All Places -->
      <section class="panel">
        <div class="row">
          <h2 class="subtitle">Map — All Places</h2>
          <button class="btn" @click="refreshPlaces" :disabled="mapLoading">
            {{ mapLoading ? 'Loading…' : 'Reload Places' }}
          </button>
        </div>

        <!-- The map container (no styles) -->
        <div ref="mapEl" id="dashboard-map" aria-label="Map of saved places"></div>

        <p v-if="mapError" class="error">{{ mapError }}</p>
      </section>

      <!-- Recent runsheets -->
      <section class="panel">
        <div class="row">
          <h2 class="subtitle">Recent Run Sheets</h2>
          <button class="btn" @click="load" :disabled="loading">
            {{ loading ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>

        <div v-if="loading" class="muted">Loading…</div>

        <div v-else class="list">
          <div
            v-for="r in recent"
            :key="r._id"
            class="card list__item"
          >
            <!-- Runsheet photo (first available) -->
            <img
              v-if="thumbFor(r)"
              :src="thumbFor(r)"
              :alt="`Photo for ${r.title || 'Run Sheet'}`"
              loading="lazy"
            />

            <div class="item__main">
              <div class="item__title">
                <!-- FIX: include slug in the route -->
                <RouterLink
                  class="link"
                  :to="`/${slug}/runsheets/${r._id}`"
                >
                  {{ r.title || 'Untitled' }}
                </RouterLink>
                <span class="badge">{{ r.status }}</span>
              </div>
              <div class="meta">
                <span>Created: {{ shortDate(r.createdAt) }}</span>
                <span v-if="r.date">For: {{ shortDate(r.date) }}</span>
                <span>Assigned: {{ r.assignedTo?.name || '—' }}</span>
              </div>
            </div>

            <div class="item__actions">
              <!-- FIX: include slug in the route -->
              <RouterLink
                class="btn"
                :to="`/${slug}/runsheets/${r._id}`"
              >
                Open
              </RouterLink>

              <button
                v-if="r.status === 'open' && !r.assignedTo"
                class="btn"
                :disabled="busyId === r._id"
                @click="claim(r)"
              >
                Claim
              </button>
              <button
                v-if="r.status === 'assigned' || r.status === 'claimed'"
                class="btn"
                :disabled="busyId === r._id"
                @click="setStatus(r, 'in_progress')"
              >
                Start
              </button>
              <button
                v-if="r.status === 'in_progress'"
                class="btn"
                :disabled="busyId === r._id"
                @click="setStatus(r, 'completed')"
              >
                Complete
              </button>
            </div>
          </div>

          <div v-if="!recent.length" class="card muted center">
            No recent runsheets. Create one to get started.
          </div>
        </div>
      </section>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuth } from '../auth.js';
import NavBar from '../components/NavBar.vue';
import api from '../api.js';

const auth = useAuth();
const route = useRoute();
const router = useRouter();

// Current production slug from the route
const slug = computed(() => route.params.slug);

// State
const me = ref(null);
const loading = ref(false);
const creating = ref(false);
const busyId = ref('');
const error = ref('');

const list = ref([]); // recent runsheets
const counts = ref({ assignedToMe: 0, openPool: 0, items: 0, places: 0 });

/* Base URL + image resolver (same pattern as Items view) */
const apiBase = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api');
const imageUrl = (p) => {
  if (!p) return '';
  // If already absolute (http/https/data), return as-is
  if (/^(https?:)?\/\//i.test(p) || /^data:/i.test(p)) return p;
  // If relative like "/uploads/...", prefix server origin (remove "/api" if needed)
  if (p.startsWith('/')) return apiBase.replace('', '') + p;
  // Otherwise, assume it's already resolvable
  return p;
};

/* ----------------------- Map / Places ----------------------- */
const mapEl = ref(null);
const map = ref(null);
const markers = ref([]);
const places = ref([]);
const mapError = ref('');
const mapLoading = ref(false);

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

/** Load the Google Maps JS API once. */
const loadGoogleMaps = () => {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) return resolve(window.google.maps);
    if (!GOOGLE_KEY) return reject(new Error('Missing Google Maps API key'));
    const existing = document.querySelector('script[data-gmaps-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps));
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.setAttribute('data-gmaps-loader', '1');
    s.onload = () => resolve(window.google.maps);
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
};

/** Normalize many possible API shapes to a flat array of places */
const normalizePlacesResponse = (data) => {
  if (Array.isArray(data)) return data;
  if (data?.items && Array.isArray(data.items)) return data.items;
  if (data?.results && Array.isArray(data.results)) return data.results;
  if (data?.data && Array.isArray(data.data)) return data.data;
  return []; // unknown shape
};

/** Try to normalize various schema shapes into {lat, lng} */
const getLatLng = (p) => {
  // top-level lat/lng
  if ((p?.lat ?? p?.lng) !== undefined) {
    const la = Number(p.lat), ln = Number(p.lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
  }

  const raw =
    p?.location ||
    p?.coords ||
    p?.geometry?.location ||
    p?.geo ||
    null;

  if (!raw) {
    if (p?.type === 'Point' && Array.isArray(p?.coordinates)) {
      const [lng, lat] = p.coordinates.map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    if (p?.location?.type === 'Point' && Array.isArray(p?.location?.coordinates)) {
      const [lng, lat] = p.location.coordinates.map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    return null;
  }

  if (typeof raw.lat === 'function' && typeof raw.lng === 'function') {
    return { lat: Number(raw.lat()), lng: Number(raw.lng()) };
  }

  if (raw?.type === 'Point' && Array.isArray(raw?.coordinates)) {
    const [lng, lat] = raw.coordinates.map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  const lat = raw.lat ?? raw.latitude;
  const lng = raw.lng ?? raw.longitude;
  if (lat != null && lng != null) {
    const la = Number(lat), ln = Number(lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
  }

  if (Array.isArray(raw) && raw.length >= 2) {
    const a = Number(raw[0]);
    const b = Number(raw[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lng: a }; // [lng,lat]
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b }; // [lat,lng]
    }
  }

  return null;
};

const clearMarkers = () => {
  markers.value.forEach(m => m.setMap(null));
  markers.value = [];
};

const escapeHtml = (s) => String(s).replace(/[&<>"'`=\/]/g, (c) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'
}[c]));

const renderMarkers = (gmaps) => {
  if (!map.value) return;
  clearMarkers();

  const bounds = new gmaps.LatLngBounds();
  let added = 0;

  places.value.forEach((p) => {
    const ll = getLatLng(p);
    if (!ll) return;

    const marker = new gmaps.Marker({
      position: ll,
      map: map.value,
      title: p.name || 'Place',
    });

    const content = `
      <div>
        <div><strong>${escapeHtml(p.name || 'Unnamed')}</strong></div>
        ${p.address ? `<div>${escapeHtml(p.address)}</div>` : ''}
      </div>
    `;
    const iw = new gmaps.InfoWindow({ content });
    marker.addListener('click', () => iw.open({ anchor: marker, map: map.value }));
    markers.value.push(marker);
    bounds.extend(ll);
    added++;
  });

  if (added > 0) {
    map.value.fitBounds(bounds);
  } else {
    map.value.setCenter({ lat: 44.739, lng: -63.293 });
    map.value.setZoom(8);
  }
};

/** Fetch places and (re)render markers */
const refreshPlaces = async () => {
  mapLoading.value = true; mapError.value = '';
  try {
    const data = await api.get('/tenant/places', { q: '', limit: 1000, sort: 'createdAt:desc' });
    places.value = normalizePlacesResponse(data);
    const gmaps = window.google?.maps || await loadGoogleMaps();
    renderMarkers(gmaps);
  } catch (e) {
    mapError.value = e?.response?.data?.error || e.message || 'Failed to load places';
  } finally {
    mapLoading.value = false;
  }
};

const initMap = async () => {
  try {
    const gmaps = await loadGoogleMaps();
    await nextTick();
    const el = mapEl.value;
    if (!el) return;

    // Ensure the container has size (no CSS file/classes added)
    if (!el.offsetHeight) el.style.height = '420px';
    if (!el.offsetWidth) el.style.width = '100%';

    map.value = new gmaps.Map(el, {
      center: { lat: 44.739, lng: -63.293 },
      zoom: 8,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

    setTimeout(() => {
      if (map.value) gmaps.event.trigger(map.value, 'resize');
    }, 0);
  } catch (e) {
    mapError.value = e?.message || 'Failed to initialize map';
  }
};

/* ----------------------- Dashboard core ----------------------- */

const shortDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString();
};

/* Choose a runsheet thumbnail URL and normalize it via imageUrl() */
const thumbFor = (r) => {
  if (!r) return '';
  const pick = (val) => (typeof val === 'string' && val) ? imageUrl(val) : '';

  // Try common fields
  const direct =
    pick(r.photo) ||
    pick(r.coverPhoto) ||
    pick(r.image) ||
    pick(r.thumbnail) ||
    pick(r.cover?.url) ||
    pick(r.hero?.url);

  if (direct) return direct;

  // Try arrays
  if (Array.isArray(r.photos) && r.photos.length) return pick(r.photos[0]);
  if (Array.isArray(r.images) && r.images.length) return pick(r.images[0]);

  // Nothing found
  return '';
};

const load = async () => {
  loading.value = true; error.value = '';
  try {
    const [assigned, open, items, placesCount, recent] = await Promise.all([
      api.get('/tenant/runsheets', { assignedToMe: 1 }),
      api.get('/tenant/runsheets', { open: 1 }),
      api.get('/tenant/items', { q: '' }),
      api.get('/tenant/places', { q: '', limit: 1 }),
      api.get('/tenant/runsheets') // server should sort by createdAt desc
    ]);
    counts.value = {
      assignedToMe: assigned.length,
      openPool: open.length,
      items: items.length,
      places: Array.isArray(placesCount) ? placesCount.length
        : (placesCount?.total ?? (placesCount?.count ?? (placesCount?.items?.length ?? 0)))
    };
    list.value = recent.slice(0, 5);
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Failed to load dashboard';
  } finally {
    loading.value = false;
  }
};

const createRS = async () => {
  creating.value = true; error.value = '';
  try {
    const rs = await api.post('/tenant/runsheets', { title: 'Untitled', status: 'draft' });
    // FIX: include slug in the navigation
    await router.push(`/${slug.value}/runsheets/${rs._id}`);
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to create runsheet';
  } finally {
    creating.value = false;
  }
};

const claim = async (r) => {
  busyId.value = r._id; error.value = '';
  try {
    await api.post(`/tenant/runsheets/${r._id}/claim`);
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Could not claim runsheet';
  } finally {
    busyId.value = '';
  }
};

const setStatus = async (r, status) => {
  busyId.value = r._id; error.value = '';
  try {
    await api.patch(`/tenant/runsheets/${r._id}`, { status });
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Could not update status';
  } finally {
    busyId.value = '';
  }
};

const recent = computed(() => list.value);

onMounted(async () => {
  try {
    // FIX: use api.get instead of apiGet
    me.value = await api.get('/tenant/tenantauth/me');
  } catch {
    me.value = null;
  }
  await load();
  await initMap();
  await refreshPlaces();
});
</script>



  
<style scoped>
/* ==========================
   ROOT LAYOUT
========================== */

.dash {
  width: 100%;
  max-width: 100%;
}

.container {
  max-width: 1120px;
  width: 100%;
  margin: 0 auto;
  padding: 24px 16px;
  display: grid;
  gap: 24px;
  box-sizing: border-box;
}

/* ==========================
   PANELS
========================== */

.panel {
  background: #fff;
  border: 1px solid #e9e9e9;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,.04);
  padding: 16px 18px;
  max-width: 100%;
  box-sizing: border-box;
}

/* ==========================
   HEADER / ACTIONS
========================== */

.header-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}

.spacer {
  flex: 1;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.actions .btn {
  min-width: 120px;
  justify-content: center;
  text-align: center;
}

/* ==========================
   ROWS
========================== */

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}

/* ==========================
   TYPOGRAPHY
========================== */

.title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.subtitle {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.muted {
  color: #6b7280;
  font-size: 12px;
}

.error {
  color: #b42318;
  background: #fff1f0;
  border: 1px solid #ffd7d5;
  padding: 10px 12px;
  border-radius: 8px;
}

/* ==========================
   BUTTONS
========================== */

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
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background .15s ease, border-color .15s ease, transform .02s ease;
}

.btn:hover {
  background: #efefef;
  border-color: #cdcdcd;
}

.btn:active {
  transform: translateY(1px);
}

.btn[disabled] {
  opacity: .6;
  cursor: not-allowed;
}

.btn--primary {
  background: #111827;
  color: #fff;
  border-color: #111827;
}

.btn--primary:hover {
  background: #0b1220;
  border-color: #0b1220;
}

.btn--ghost {
  background: #fff;
  border: 1px solid #e5e7eb;
}

.btn--ghost:hover {
  background: #f3f4f6;
}

/* ==========================
   STATS
========================== */

.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (min-width: 760px) {
  .stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.card {
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,.04);
  padding: 14px 16px;
  max-width: 100%;
  box-sizing: border-box;
}

.stat__label {
  color: #6b7280;
  font-size: 12px;
  margin-bottom: 6px;
}

.stat__value {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
}

/* ==========================
   MAP
========================== */

#dashboard-map {
  width: 100%;
  max-width: 100%;
  height: 420px;
  border: 1px solid #ececec;
  border-radius: 10px;
  background: #f8fafc;
  box-sizing: border-box;
}

/* ==========================
   RECENT LIST
========================== */

.list {
  display: grid;
  gap: 12px;
}

.list__item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}

/* Thumbnail */
.list__item > img {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #ececec;
  background: #f7f7f7;
  flex-shrink: 0;
}

.list__item > img:not([src]),
.list__item > img[src=""] {
  display: none;
}

/* Main text */
.item__main {
  flex: 1 1 auto;
  min-width: 0;
}

.item__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;          /* allow title + badge to wrap on small screens */
}

.item__title .link {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  /* white-space: nowrap;  <-- REMOVE this */
  word-break: break-word;   /* allow long words/IDs to wrap instead of overflowing */
}

/* Optional: keep badge from stretching strangely */
.item__title .badge {
  flex: 0 0 auto;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
  color: #6b7280;
  font-size: 12px;
}

/* Actions */
.item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.center {
  text-align: center;
}

/* ==========================
   MOBILE RESPONSIVE
========================== */

@media (max-width: 820px) {
  .list__item > img {
    width: 84px;
    height: 84px;
  }
}

@media (max-width: 680px) {

  .container {
    padding: 16px 12px;
  }

  .header-row {
    flex-direction: column;
    align-items: stretch;
  }

  .actions {
    width: 100%;
  }

  .actions .btn {
    flex: 1 1 calc(50% - 6px);
    min-width: unset;
  }

  .stats {
    grid-template-columns: 1fr;
  }

  .list__item {
    flex-direction: column;
    align-items: flex-start;
  }

  .item__actions {
    width: 100%;
    justify-content: stretch;
  }

  .item__actions .btn {
    flex: 1 1 100%;
  }

  #dashboard-map {
    height: 300px;
  }
}

</style>

