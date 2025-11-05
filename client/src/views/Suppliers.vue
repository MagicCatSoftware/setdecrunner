<template>
  <div>
    <NavBar :me="me" />

    <div class="container">
      <h2>Suppliers</h2>

      <!-- Toolbar -->
      <div class="row toolbar">
        <input v-model="q" placeholder="Search suppliers by name, address, contact" class="input input--grow" />
        <button class="btn" @click="search">Search</button>
        <button class="btn btn--primary" @click="goNew">New Supplier</button>
      </div>

      <input ref="fileEl" type="file" class="hidden" accept=".xlsx,.xls,.csv" @change="onImportFile" />
<button class="btn" @click="fileEl.click()">Import Excel/CSV</button>

      <!-- Map Panel -->
      <div class="card map-card">
        <div class="map-head">
          <div class="map-title">Supplier Locations</div>
          <div class="muted small" v-if="mapStatus">{{ mapStatus }}</div>
        </div>
        <div ref="mapEl" class="map"></div>
      </div>

      <div v-if="error" class="error">{{ error }}</div>
      <div v-else-if="!suppliers.length" class="muted">No suppliers found.</div>

      <!-- List -->
      <ul class="sup-list" v-else>
        <li v-for="s in suppliers" :key="s._id" class="sup-item card">
          <div class="sup-item__main">
            <RouterLink
              class="sup-item__name"
              :to="{ name: 'supplier-edit', params: { slug, id: s._id } }"
            >
              {{ s.name }}
            </RouterLink>
            <div class="muted small">
              <span v-if="s.address">{{ s.address }}</span>
              <span v-if="s.contactName"> · Contact: {{ s.contactName }}</span>
              <span v-if="s.phone"> · Tel: {{ s.phone }}</span>
            </div>
          </div>
          <div class="sup-item__actions">
            <button class="btn" @click="flyTo(s)">Show on Map</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import NavBar from '../components/NavBar.vue';
import api, { apiGet } from '../api.js';

const router = useRouter();
const route = useRoute();
const slug = computed(() => String(route.params.slug || ''));

const me = ref(null);
const q = ref('');
const suppliers = ref([]);
const error = ref('');
const fileEl = ref(null);

async function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const fd = new FormData();
    fd.append('file', file);

    // Pass slug so backend can resolve productionId if needed
    await api.post(`/tenant/suppliers/import?slug=${encodeURIComponent(slug.value)}`, fd, {
      multipart: true
    });

    // reload list + markers
    await load();
    await nextTick();
    updateMarkers();
    alert('Import complete.');
  } catch (err) {
    alert(err?.body?.error || err?.message || 'Import failed');
  } finally {
    // reset input so selecting the same file triggers change again
    e.target.value = '';
  }
}

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

function qs(obj = {}) {
  const s = new URLSearchParams(obj).toString();
  return s ? `?${s}` : '';
}

async function load() {
  try {
    error.value = '';
    const url = `/tenant/suppliers${q.value.trim() ? qs({ q: q.value.trim() }) : ''}`;
    // allow API to return either array or {items}
    const res = await api.get(url);
    suppliers.value = Array.isArray(res) ? res : (res.items || []);
    await nextTick();
    updateMarkers();
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to load suppliers';
  }
}

const search = () => load();
const goNew = () => router.push({ name: 'supplier-new', params: { slug: slug.value } });

/* ============= Google Maps ============= */
const mapEl = ref(null);
let map = null;
let infoWindow = null;
let markers = [];          // { supplierId, marker }
const mapStatus = ref('');

function setStatus(msg) {
  mapStatus.value = msg;
}

function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (!GMAPS_KEY) {
      setStatus('Missing Google Maps API key. Set VITE_GOOGLE_MAPS_API_KEY.');
      return resolve(null);
    }
    if (window.google?.maps) return resolve(window.google);
    const cb = '__gmaps_cb_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GMAPS_KEY)}&callback=${cb}`;
    s.onerror = () => { setStatus('Failed to load Google Maps'); reject(new Error('GMAPS load failed')); };
    window[cb] = () => { delete window[cb]; setStatus('Google Maps loaded'); resolve(window.google); };
    setStatus('Loading Google Maps…');
    document.head.appendChild(s);
  });
}

function extractLatLngFromSupplier(s) {
  if (!s?.location) return null;
  const loc = s.location;

  // GeoJSON: { location: { type:'Point', coordinates:[lng,lat] } } OR nested at location.geo
  if (loc.type === 'Point' && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const [lng, lat] = loc.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (loc.geo?.type === 'Point' && Array.isArray(loc.geo.coordinates) && loc.geo.coordinates.length >= 2) {
    const [lng, lat] = loc.geo.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // Plain lat/lng
  const lat = loc.lat ?? loc.latitude ?? loc.coords?.lat ?? loc.location?.lat;
  const lng = loc.lng ?? loc.longitude ?? loc.coords?.lng ?? loc.location?.lng;
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

  return null;
}

async function initMapIfNeeded() {
  if (map || !mapEl.value) return;
  const g = await loadGoogleMaps().catch(() => null);
  if (!g) return;
  map = new g.maps.Map(mapEl.value, {
    center: { lat: 43.6532, lng: -79.3832 }, // fallback center
    zoom: 10,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });
  infoWindow = new g.maps.InfoWindow();
  setStatus('Map initialized');
}

function clearMarkers() {
  markers.forEach(m => m.marker.setMap(null));
  markers = [];
}

async function buildMarkersFromSuppliers() {
  if (!map) return;
  clearMarkers();

  const bounds = new window.google.maps.LatLngBounds();
  let added = 0;

  for (const s of suppliers.value) {
    const pos = extractLatLngFromSupplier(s);
    if (!pos) continue;

    const marker = new window.google.maps.Marker({
      position: pos,
      map,
      title: s.name || 'Supplier',
    });

    marker.addListener('click', () => {
      const lines = [
        `<div style="min-width:200px">`,
        `<div style="font-weight:700;margin-bottom:2px">${s.name || 'Supplier'}</div>`,
        s.address ? `<div class="small">${s.address}</div>` : '',
        s.phone ? `<div class="small">Tel: ${s.phone}</div>` : '',
        s.contactName ? `<div class="small">Contact: ${s.contactName}</div>` : '',
        `</div>`
      ].filter(Boolean).join('');
      infoWindow.setContent(lines);
      infoWindow.open({ anchor: marker, map });
    });

    markers.push({ supplierId: s._id, marker });
    bounds.extend(marker.getPosition());
    added++;
  }

  if (added > 0) {
    map.fitBounds(bounds);
    setStatus(`${added} supplier location${added === 1 ? '' : 's'} plotted`);
  } else {
    setStatus('No mappable supplier locations');
  }
}

async function updateMarkers() {
  await initMapIfNeeded();
  if (!map) return;
  buildMarkersFromSuppliers();
}

// Jump to a specific supplier on the map
function flyTo(s) {
  const pos = extractLatLngFromSupplier(s);
  if (!map || !pos) return;
  map.panTo(pos);
  map.setZoom(14);
  const entry = markers.find(m => m.supplierId === s._id);
  if (entry) {
    window.google.maps.event.trigger(entry.marker, 'click');
  }
}

/* ====================================== */

onMounted(async () => {
  try {
    me.value = await apiGet('/tenant/tenantauth/me');
  } catch {
    me.value = null;
  }
  
  await load();
  await nextTick();
  updateMarkers();
});

// Refresh markers when the list changes
watch(suppliers, () => updateMarkers());
</script>

<style scoped>
/* ===== Clean Black & White Theme ===== */
:root {
  --bg: #ffffff;          /* page background */
  --panel: #ffffff;       /* cards / panels */
  --elev: #fafafa;        /* slightly raised */
  --ink: #111111;         /* primary text */
  --muted: #555555;       /* secondary text */
  --line: #cccccc;        /* base border */
  --accent: #000000;      /* black for accents */
}

.container {
  padding: 18px 20px 28px;
  background: var(--bg);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

/* Inputs */
.input {
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
  color: var(--ink);
}
.input--grow { width: 100%; }
.input::placeholder { color: var(--muted); }

/* Buttons */
.btn {
  border: 1px solid var(--ink);
  background: var(--bg);
  color: var(--ink);
  padding: 8px 12px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.btn:hover { background: var(--ink); color: var(--bg); }
.btn--primary {
  background: var(--ink);
  color: var(--bg);
}
.btn--primary:hover { background: #333; }

/* Cards */
.card {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

/* Toolbar row */
.row.toolbar {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  align-items: center;
  margin: 10px 0 16px;
}

/* Text helpers */
.muted { color: var(--muted); }
.small { font-size: 12px; }
.error {
  color: #fff;
  background: #d33;
  border: 1px solid #a00;
  padding: 8px 10px;
  border-radius: 6px;
  margin: 10px 0;
}

/* Map panel */
.map-card { margin: 12px 0 18px; overflow: hidden; }
.map-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}
.map-title { font-weight: 700; }
.map { width: 100%; height: 360px; background: #eee; }

/* Supplier list */
.sup-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}
.sup-item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
}
.sup-item__name {
  color: var(--ink);
  text-decoration: none;
  font-weight: 700;
}
.sup-item__name:hover { text-decoration: underline; }
.sup-item__actions { display: flex; gap: 8px; }
</style>

