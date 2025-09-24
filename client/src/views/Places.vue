<template>
  <div>
    <NavBar :me="me"/>

    <div class="container">
      <!-- Toolbar -->
      <div class="toolbar card">
        <input
          v-model="q"
          placeholder="Search places (name/address)"
          class="input input--grow"
        />
        <button class="btn" @click="load">Search</button>
        <button class="btn btn--primary" @click="createPlace">New Place</button>

        <span class="spacer"></span>

        <!-- Google Places (toolbar) -->
        <div class="gm">
          <input
            ref="gmSearchEl"
            :disabled="!gmReady"
            :placeholder="gmReady ? 'Search Google Places…' : gmPlaceholder"
            class="input gm__input"
          />
          <button
            class="btn"
            :disabled="!gmReady || !toolbarSelected"
            @click="applyToolbarSelection"
            title="Create a new place from the selected Google result"
          >
            Use selection
          </button>
        </div>

        <button
          v-if="!gmReady"
          class="btn"
          @click="retryGoogle"
          :title="gmError || 'Try reloading the Google Maps script'"
        >
          Reload Google
        </button>

        <!-- Optional: raw import by place_id -->
        <details class="tiny">
          <summary>Import by Place ID</summary>
          <div class="tiny__row">
            <input
              v-model="importPlaceId"
              placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
              class="input"
            />
            <button class="btn" @click="importFromGoogle" :disabled="importing">
              {{ importing ? 'Importing…' : 'Import' }}
            </button>
          </div>
        </details>
      </div>

      <!-- Map Panel -->
      <div class="card map-card">
        <div class="map-head">
          <div class="map-title">Places Map</div>
          <div class="muted small" v-if="mapStatus">{{ mapStatus }}</div>
          <div class="warn small" v-if="!gmReady">
            Google Maps unavailable. You can still create and edit places. Click “Reload Google” to try again.
          </div>
        </div>
        <div ref="mapEl" class="map"></div>
      </div>

      <div v-if="loading" class="muted">Loading…</div>

      <!-- List -->
      <div v-else class="list">
        <div v-for="p in list" :key="p._id" class="card item">
          <div class="item__main">
            <div class="item__title">
              <div class="name">{{ p.name }}</div>
            </div>
            <div class="meta" v-if="p.address">{{ p.address }}</div>

            <div class="thumbs">
              <img
                v-for="ph in p.photos || []"
                :key="ph"
                :src="imageUrl(ph)"
                class="thumb"
                alt=""
              />
            </div>
          </div>

          <div class="item__actions">
            <button class="btn" @click="openEditor(p)">Edit</button>
            <button class="btn" @click="openItemsAt(p)">Items</button>
            <button class="btn btn--danger" @click="del(p)">Delete</button>
          </div>
        </div>

        <div v-if="!list.length" class="card empty muted">
          No places found. Try a different search or use Google Places above.
        </div>
      </div>

      <!-- Editor Modal -->
      <div v-if="editing" class="modal">
        <div class="modal__card">
          <div class="modal__head">
            <h3 class="title">{{ creatingNew ? 'New Place' : (editing._id ? 'Edit Place' : 'New Place') }}</h3>
            <button class="btn" @click="closeEditor">Close</button>
          </div>

          <!-- Google Places inside editor -->
          <div class="gm gm--modal">
            <input
              ref="gmEditorEl"
              :disabled="!gmReady"
              :placeholder="gmReady ? 'Search Google Places to prefill…' : gmPlaceholder"
              class="input input--grow"
            />
            <button
              class="btn"
              :disabled="!gmReady || !editorSelected"
              @click="applyEditorSelection"
            >
              Apply selection
            </button>
            <button
              v-if="!gmReady"
              class="btn"
              @click="retryGoogle"
              :title="gmError || 'Try reloading the Google Maps script'"
            >
              Reload Google
            </button>
          </div>

          <div class="grid">
            <div class="field">
              <label class="label">Name</label>
              <input v-model="editing.name" class="input" placeholder="Vendor / prop house / location name" />
            </div>

            <div class="field">
              <label class="label">Phone</label>
              <input v-model="editing.phone" class="input" placeholder="+1 ..." />
            </div>

            <div class="field field--full">
              <label class="label">Address</label>
              <input v-model="editing.address" class="input" placeholder="123 Example St, City, State" />
            </div>

            <div class="field">
              <label class="label">Latitude</label>
              <input type="number" step="any" v-model.number="editing.lat" class="input" />
            </div>
            <div class="field">
              <label class="label">Longitude</label>
              <input type="number" step="any" v-model.number="editing.lng" class="input" />
            </div>

            <div class="field field--full">
              <label class="label">Website</label>
              <input v-model="editing.website" class="input" placeholder="https://..." />
            </div>

            <div class="field field--full">
              <label class="label">Notes</label>
              <textarea v-model="editing.notes" rows="3" class="textarea" placeholder="Access codes, loading instructions, hours, contact names…"></textarea>
            </div>

            <!-- Photos -->
            <div class="divider field--full"></div>
            <div class="field field--full">
              <div class="row row--tight">
                <div class="mini-title">Photos</div>
                <input type="file" multiple @change="uploadPhotos" />
              </div>
              <div class="thumbs thumbs--edit">
                <div v-for="ph in editing.photos || []" :key="ph" class="thumbwrap">
                  <img :src="imageUrl(ph)" class="thumb thumb--lg" />
                  <button class="chip chip--x" @click="removePhoto(ph)">×</button>
                </div>
              </div>
            </div>
          </div>

          <div class="modal__foot">
            <a
              v-if="editing.lat && editing.lng"
              class="link"
              :href="mapsUrl(editing.lat, editing.lng)"
              target="_blank"
              rel="noopener"
            >
              Open in Google Maps
            </a>
            <span class="spacer"></span>
            <button class="btn btn--primary" @click="save" :disabled="saving">
              {{ saving ? 'Saving…' : (creatingNew ? 'Create' : 'Save') }}
            </button>
          </div>

          <!-- Invisible div for PlacesService -->
          <div ref="gmSvcEl" style="width:0;height:0;overflow:hidden;"></div>
        </div>
      </div>

      <!-- Items at Place Modal -->
      <div v-if="itemsAt" class="modal">
        <div class="modal__card modal__card--wide">
          <div class="modal__head">
            <h3 class="title">Items at: {{ itemsAt.name }}</h3>
            <button class="btn" @click="closeItemsAt">Close</button>
          </div>

          <div class="toolbar toolbar--tight card card--flat">
            <input v-model="itemQ" placeholder="Search items at this place" class="input input--grow" />
            <button class="btn" @click="loadItemsAt">Search</button>

            <span class="spacer"></span>

            <input v-model="quickItemName" placeholder="Quick add item name" class="input input--narrow" />
            <input v-model.number="quickItemQty" type="number" min="1" class="input input--num" />
            <button class="btn btn--primary" @click="quickAddItem" :disabled="addingItem">
              {{ addingItem ? 'Adding…' : 'Add Item Here' }}
            </button>
          </div>

          <div v-if="itemsLoading" class="muted">Loading…</div>
          <div v-else class="list">
            <div v-for="it in itemsList" :key="it._id" class="card item">
              <div class="item__main">
                <div class="item__title">
                  <div class="name">
                    {{ it.name }} <span class="qty">(x{{ it.quantity }})</span>
                  </div>
                </div>
                <div class="meta" v-if="it.description">{{ it.description }}</div>
                <div class="thumbs">
                  <img v-for="ph in it.photos || []" :key="ph" :src="imageUrl(ph)" class="thumb" />
                </div>
              </div>

              <div class="item__actions">
                <button class="btn" @click="detachItem(it)">Remove from this location</button>
              </div>
            </div>

            <div v-if="!itemsList.length" class="card empty muted">
              No items found at this location.
            </div>
          </div>

          <p v-if="itemsError" class="error">{{ itemsError }}</p>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavBar from '../components/NavBar.vue';
import api, { apiGet } from '../api.js';

const route = useRoute();
const router = useRouter();
const slug = computed(() => String(route.params.slug || ''));

const me = ref(null);

const q = ref('');
const list = ref([]);
const loading = ref(false);
const error = ref('');
const saving = ref(false);

const editing = ref(null);
const creatingNew = ref(false);

const importPlaceId = ref('');
const importing = ref(false);

const itemsAt = ref(null);
const itemsList = ref([]);
const itemQ = ref('');
const itemsLoading = ref(false);
const itemsError = ref('');
const quickItemName = ref('');
const quickItemQty = ref(1);
const addingItem = ref(false);

const IMAGE_BASE_ORIGIN = (import.meta.env.VITE_API_BASE || '');

function imageUrl(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p) || p.startsWith('data:')) return p;
  let path = String(p);
  if (!path.startsWith('/')) path = '/' + path;
  if (!path.startsWith('/uploads/')) path = '/uploads' + path; // normalize
  return (IMAGE_BASE_ORIGIN || '') + path;
}

const mapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const qs = (obj = {}) => { const s = new URLSearchParams(obj).toString(); return s ? `?${s}` : ''; };

/* ---------------- Google Maps / Places integration (robust) ---------------- */
const gmApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const gmReady = ref(false);
const gmError = ref('');
const gmStatus = ref('');
const gmPlaceholder = computed(() =>
  gmApiKey ? (gmError.value ? `Google disabled (${gmError.value})` : 'Google Places disabled') : 'Google Places disabled (no API key)'
);

const gmSearchEl = ref(null);
const gmEditorEl = ref(null);
const gmSvcEl = ref(null);
let toolbarAC = null;
let editorAC = null;
let placesSvc = null;

// Single loader instance with retry
let googleLoadPromise = null;
function loadGoogleOnce(apiKey, { retries = 1 } = {}) {
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (googleLoadPromise) return googleLoadPromise;

  googleLoadPromise = new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error('Missing API key'));
    const id = 'gmaps-sdk';
    let s = document.getElementById(id);
    if (!s) {
      s = document.createElement('script');
      s.id = id;
      s.async = true;
      s.defer = true;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`;
      s.onerror = () => reject(new Error('Failed to load Google JS'));
      document.head.appendChild(s);
    } else if (s.getAttribute('data-failed') === '1') {
      // previous failure: replace the tag
      s.remove();
      const s2 = document.createElement('script');
      s2.id = id;
      s2.async = true;
      s2.defer = true;
      s2.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`;
      s2.onerror = () => reject(new Error('Failed to load Google JS'));
      document.head.appendChild(s2);
      s = s2;
    }
    s.onload = () => resolve(window.google);
  })
  .catch(async (err) => {
    googleLoadPromise = null;
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 800));
      return loadGoogleOnce(apiKey, { retries: retries - 1 });
    }
    throw err;
  });

  return googleLoadPromise;
}

function ensurePlacesService() {
  if (!window.google?.maps?.places) return null;
  if (!placesSvc) {
    const node = gmSvcEl.value || document.createElement('div');
    placesSvc = new window.google.maps.places.PlacesService(node);
  }
  return placesSvc;
}

function getDetailsById(placeId) {
  return new Promise((resolve) => {
    const svc = ensurePlacesService();
    if (!svc || !window.google?.maps?.places) return resolve(null);
    svc.getDetails(
      { placeId, fields: ['name','formatted_address','geometry','formatted_phone_number','website','place_id'] },
      (res, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && res) resolve(res);
        else resolve(null);
      }
    );
  });
}

function toDraftFromPlace(g) {
  const name = g?.name || '';
  const address = g?.formatted_address || '';
  const lat = g?.geometry?.location?.lat?.();
  const lng = g?.geometry?.location?.lng?.();
  const googlePlaceId = g?.place_id || '';
  if (googlePlaceId) lastGooglePlaceId.value = googlePlaceId;

  return {
    name,
    address,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    googlePlaceId
  };
}

async function enrichWithDetails(place) {
  const base = toDraftFromPlace(place);
  const details = place?.place_id ? await getDetailsById(place.place_id) : null;
  const merged = {
    ...base,
    phone: details?.formatted_phone_number || '',
    website: details?.website || ''
  };
  if (merged.googlePlaceId) lastGooglePlaceId.value = merged.googlePlaceId;
  if (editing.value && merged.googlePlaceId) editing.value.googlePlaceId = merged.googlePlaceId;
  return merged;
}

function bindEditorAutocomplete() {
  if (!gmReady.value || !gmEditorEl.value || !window.google?.maps?.places) return;

  try {
    if (editorAC && window.google?.maps?.event) {
      window.google.maps.event.clearInstanceListeners(editorAC);
    }
  } catch {}

  editorAC = new window.google.maps.places.Autocomplete(gmEditorEl.value, {
    fields: ['place_id','name','formatted_address','geometry']
  });

  editorAC.addListener('place_changed', async () => {
    const place = editorAC.getPlace();
    if (!place) return;

    if (place.place_id) lastGooglePlaceId.value = place.place_id;

    const data = await enrichWithDetails(place);

    if (editing.value?._id && !creatingNew.value) {
      creatingNew.value = true;
      editing.value = { ...blankPlace(), ...data };
    } else {
      editing.value = { ...(editing.value || blankPlace()), ...data };
    }

    if (!editing.value.googlePlaceId && lastGooglePlaceId.value) {
      editing.value.googlePlaceId = lastGooglePlaceId.value;
    }

    if (gmEditorEl.value) gmEditorEl.value.value = '';
    nextTick(bindEditorAutocomplete);
    gmEditorEl.value?.focus();
  });
}

function initToolbarAutocomplete() {
  if (!gmReady.value || !gmSearchEl.value || toolbarAC || !window.google?.maps?.places) return;
  toolbarAC = new window.google.maps.places.Autocomplete(
    gmSearchEl.value,
    { fields: ['place_id','name','formatted_address','geometry'] }
  );
  toolbarAC.addListener('place_changed', () => {
    const place = toolbarAC.getPlace() || null;
    toolbarSelected.value = place;
    if (place?.place_id) lastGooglePlaceId.value = place.place_id;
  });
}

const toolbarSelected = ref(null);
const editorSelected = ref(null);
const lastGooglePlaceId = ref('');

async function applyToolbarSelection() {
  if (!toolbarSelected.value) return;
  if (!editing.value) {
    await createPlace();
  }
  const data = await enrichWithDetails(toolbarSelected.value);
  Object.assign(editing.value, data);
}

async function applyEditorSelection() {
  // If editorSelected was set via your own UI; the AC path already handles selection
  if (!editorSelected.value) return;
  const data = await enrichWithDetails(editorSelected.value);
  if (!editing.value) editing.value = blankPlace();
  Object.assign(editing.value, data);
}

async function setupGoogle() {
  gmError.value = '';
  gmStatus.value = 'Loading Google…';
  try {
    await loadGoogleOnce(gmApiKey, { retries: 2 });
    gmReady.value = !!(window.google?.maps?.places);
    if (!gmReady.value) throw new Error('Google API unavailable');
    initToolbarAutocomplete();
    await initMapIfNeeded();
    updateMarkers();
    gmStatus.value = '';
  } catch (e) {
    gmReady.value = false;
    gmError.value = e?.message || 'Failed to load Google JS';
    gmStatus.value = '';
  }
}

function retryGoogle() {
  toolbarAC = null;
  editorAC = null;
  placesSvc = null;
  setupGoogle();
}
/* ------------------------------------------------------------------ */

const load = async () => {
  loading.value = true; error.value = '';
  try {
    const res = await api.get('/tenant/places', { params: q.value ? { q: q.value } : undefined });
    list.value = Array.isArray(res) ? res : (res.items || []);
    updateMarkers();
  } catch (e) {
    error.value = e?.response?.data?.error || e?.body?.error || e?.message || 'Failed to load places';
  } finally {
    loading.value = false;
  }
};

const blankPlace = () => ({
  name: '',
  address: '',
  lat: null,
  lng: null,
  phone: '',
  website: '',
  notes: '',
  photos: [],
  googlePlaceId: ''
});

const createPlace = async () => {
  creatingNew.value = true;
  editing.value = blankPlace();
  await nextTick();
  bindEditorAutocomplete();

  if (toolbarSelected.value) {
    const data = await enrichWithDetails(toolbarSelected.value);
    Object.assign(editing.value, data);
  }

  if (!editing.value.googlePlaceId && lastGooglePlaceId.value) {
    editing.value.googlePlaceId = lastGooglePlaceId.value;
  }

  gmEditorEl.value?.focus();
};

const closeEditor = () => {
  editing.value = null;
  router.push({ name: 'places', params: { slug: slug.value } });
};

const openEditor = async (p) => {
  creatingNew.value = false;
  editing.value = JSON.parse(JSON.stringify(p));
  await nextTick();
  bindEditorAutocomplete();
  gmEditorEl.value?.focus();
};

function normalizePayloadForSave(src) {
  const payload = { ...src };
  if (!payload.googlePlaceId && lastGooglePlaceId.value) payload.googlePlaceId = lastGooglePlaceId.value;
  if (!payload.googlePlaceId) delete payload.googlePlaceId;
  delete payload._id;
  return payload;
}

const save = async () => {
  if (!editing.value?.name?.trim()) {
    error.value = 'Name is required';
    return;
  }
  saving.value = true;
  error.value = '';

  try {
    const payload = normalizePayloadForSave(editing.value);
    const path = creatingNew.value ? '/tenant/places' : `/tenant/places/${editing.value._id}`;
    const data = creatingNew.value
      ? await api.post(path, payload)
      : await api.patch(path, payload);

    editing.value = data;
    creatingNew.value = false;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error || e?.body?.error || e?.message || 'Failed to save place';
  } finally {
    saving.value = false;
  }
};

const del = async (p) => {
  if (!confirm(`Delete place "${p.name}"?`)) return;
  try {
    await api.del(`/tenant/places/${p._id}`);
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error || e?.body?.error || 'Failed to delete place';
  }
};

// Photos
const uploadPhotos = async (e) => {
  if (!editing.value?._id) {
    await save(); // create first to get _id
    if (!editing.value?._id) return;
  }
  const fd = new FormData();
  [...e.target.files].forEach(f => fd.append('photos', f));

  try {
    const data = await api.fetch('POST', `/tenant/places/${editing.value._id}/photos`, { body: fd });
    editing.value = data;
    await load();
  } catch (e2) {
    error.value = e2?.response?.data?.error || e2?.message || 'Failed to upload photos';
  } finally {
    e.target.value = '';
  }
};

const removePhoto = async (url) => {
  try {
    const data = await api.fetch('DELETE', `/tenant/places/${editing.value._id}/photos`, { body: { url } });
    editing.value = data;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to remove photo';
  }
};

// Import from Google Place ID
const importFromGoogle = async () => {
  if (!importPlaceId.value.trim()) return;
  importing.value = true; error.value = '';
  try {
    const p = await api.post('/tenant/places/import', { googlePlaceId: importPlaceId.value.trim() });
    importPlaceId.value = '';
    list.value.unshift(p);
    await openEditor(p);
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to import place';
  } finally {
    importing.value = false;
  }
};

/* -------- Items at a place -------- */
const openItemsAt = (p) => { itemsAt.value = p; loadItemsAt(); };
const closeItemsAt = () => {
  itemsAt.value = null;
  itemsList.value = [];
  itemQ.value = '';
  quickItemName.value = '';
  quickItemQty.value = 1;
  itemsError.value = '';
};

const loadItemsAt = async () => {
  if (!itemsAt.value?._id) return;
  itemsLoading.value = true; itemsError.value = '';
  try {
    const params = { placeId: itemsAt.value._id };
    if (itemQ.value) params.q = itemQ.value;
    const res = await api.get('/tenant/items', { params });
    itemsList.value = Array.isArray(res) ? res : (res.items || []);
  } catch (e) {
    itemsError.value = e?.response?.data?.error || e?.message || 'Failed to load items at this place';
  } finally {
    itemsLoading.value = false;
  }
};

const quickAddItem = async () => {
  if (!itemsAt.value?._id || !quickItemName.value.trim()) return;
  addingItem.value = true; itemsError.value = '';
  try {
    await api.post('/tenant/items', {
      name: quickItemName.value.trim(),
      quantity: Number(quickItemQty.value) || 1,
      location: itemsAt.value._id,
      photos: []
    });
  } catch (e) {
    itemsError.value = e?.response?.data?.error || e?.message || 'Failed to add item';
  } finally {
    addingItem.value = false;
    quickItemName.value = '';
    quickItemQty.value = 1;
    await loadItemsAt();
  }
};

const detachItem = async (it) => {
  try {
    await api.patch(`/tenant/items/${it._id}`, { location: null });
    await loadItemsAt();
  } catch (e) {
    itemsError.value = e?.response?.data?.error || e?.message || 'Failed to remove item from location';
  }
};

/* ======================= Google Map (markers) ======================= */
const mapEl = ref(null);
let map = null;
let infoWindow = null;
let markers = [];
const mapStatus = ref('');

function extractLatLng(p) {
  const lat = p?.lat ?? p?.location?.lat ?? p?.coords?.lat;
  const lng = p?.lng ?? p?.location?.lng ?? p?.coords?.lng;
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

  if (p?.geo?.type === 'Point' && Array.isArray(p?.geo?.coordinates) && p.geo.coordinates.length >= 2) {
    const [lng2, lat2] = p.geo.coordinates;
    if (Number.isFinite(lat2) && Number.isFinite(lng2)) return { lat: lat2, lng: lng2 };
  }
  return null;
}

async function initMapIfNeeded() {
  if (!gmApiKey || !gmReady.value) return;
  if (map || !mapEl.value) return;
  if (!window.google?.maps) return;

  map = new window.google.maps.Map(mapEl.value, {
    center: { lat: 43.6532, lng: -79.3832 },
    zoom: 10,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });
  infoWindow = new window.google.maps.InfoWindow();
}

function clearMarkers() {
  markers.forEach(m => m.setMap?.(null));
  markers = [];
}

async function updateMarkers() {
  await initMapIfNeeded();
  if (!map || !Array.isArray(list.value) || !window.google?.maps) return;

  clearMarkers();
  const bounds = new window.google.maps.LatLngBounds();
  let added = 0;

  for (const p of list.value) {
    const pos = extractLatLng(p);
    if (!pos) continue;

    const marker = new window.google.maps.Marker({
      position: pos,
      map,
      title: p.name || 'Place',
    });
    marker.addListener('click', () => {
      const html = `
        <div style="min-width:200px">
          <div style="font-weight:700">${p.name || 'Place'}</div>
          ${p.address ? `<div class="small">${p.address}</div>` : ''}
          ${Number.isFinite(p.lat) && Number.isFinite(p.lng)
            ? `<div class="small"><a href="${mapsUrl(p.lat, p.lng)}" target="_blank" rel="noopener">Open in Google Maps</a></div>`
            : ''}
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
    mapStatus.value = `${added} place${added === 1 ? '' : 's'} plotted`;
  } else {
    map.setCenter({ lat: 43.6532, lng: -79.3832 });
    map.setZoom(10);
    mapStatus.value = 'No mappable places';
  }
}
/* ======================= */

async function ensureProductionHeader() {
  // Make sure api helper has x-production-id before first write
  let pid = localStorage.getItem('currentProductionId') || '';
  if (!pid && slug.value) {
    try {
      const p = await apiGet(`/tenant/productions/${slug.value}`);
      pid = p?._id || '';
      if (pid) {
        localStorage.setItem('currentProductionId', pid);
        api.setProductionId(pid);
      }
    } catch {}
  } else if (pid) {
    api.setProductionId(pid);
  }
}

// Re-try Google load when tab refocuses (in case adblock/network cleared up)
function onVisChange() {
  if (document.visibilityState === 'visible' && !gmReady.value) {
    retryGoogle();
  }
}

onMounted(async () => {
  await ensureProductionHeader();

  try {
    me.value = await apiGet('/auth/me');
  } catch {
    me.value = null;
  }

  await load();
  if (gmApiKey) await setupGoogle();

  try { document.addEventListener('visibilitychange', onVisChange); } catch {}
});

watch(list, () => updateMarkers());
</script>



  
  
  
  
<style scoped>
/* ---------- Layout ---------- */
.container {
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px 16px;
}

/* ---------- Cards / blocks ---------- */
.card {
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,.04);
}
.card--flat { box-shadow: none; }

.toolbar {
  padding: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.toolbar--tight { padding: 10px; gap: 8px; }

.list {
  display: grid;
  gap: 12px;
}

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
.item__title { display: flex; align-items: center; gap: 8px; }
.name { font-weight: 600; word-break: break-word; }
.meta { color: #6b7280; font-size: 12px; margin-top: 2px; }
.empty { padding: 14px; text-align: center; }

/* ---------- Map panel ---------- */
.map-card { padding: 0; overflow: hidden; }
.map-head {
  display: flex; align-items: baseline; gap: 10px;
  padding: 10px 12px; border-bottom: 1px solid #ececec;
}
.map-title { font-weight: 700; }
.map { width: 100%; height: 380px; }

/* ---------- Inputs & controls ---------- */
.input,
.textarea,
.select {
  border: 1px solid #d6d6d6;
  background: #fff;
  color: #111;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.input { height: 34px; }
.input--grow { width: 280px; }
.input--narrow { width: 220px; }
.input--num { width: 80px; text-align: center; }
@media (max-width: 720px) { .input--grow { width: 100%; } }
.textarea { width: 100%; resize: vertical; }
.select { height: 34px; }
.spacer { margin-left: auto; }

.btn {
  appearance: none;
  border: 1px solid #d6d6d6;
  background: #f7f7f7;
  color: #111;
  font: inherit;
  font-size: 14px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
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

/* ---------- Google places bar ---------- */
.gm {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.gm__input { width: 280px; }
.gm--modal { margin: 8px 0 2px; }

/* Keep Google Autocomplete suggestions above modals */
:global(.pac-container) { z-index: 9999; }

/* ---------- Tiny disclosure ---------- */
.tiny { margin-left: 8px; }
.tiny summary { cursor: pointer; font-size: 12px; color: #374151; }
.tiny__row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }

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
.modal__card--wide { max-width: 900px; }
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

/* ---------- Thumbs ---------- */
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
.thumb--lg {
  width: 80px; height: 80px;
  border-radius: 10px;
  border: 1px solid #ececec;
  object-fit: cover;
  background: #fafafa;
}
.thumbwrap { position: relative; width: 80px; height: 80px; }
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
.link {
  color: #0f172a; text-decoration: none; border-bottom: 1px solid transparent;
}
.link:hover { border-bottom-color: #0f172a; }
.small { font-size: 12px; }
.muted { color: #6b7280; font-size: 12px; }
.error {
  margin-top: 12px;
  color: #b42318;
  background: #fff1f0;
  border: 1px solid #ffd7d5;
  padding: 10px 12px;
  border-radius: 8px;
}

/* ---------- Responsive ---------- */
@media (max-width: 760px) {
  .item { grid-template-columns: 1fr; }
  .modal__card { max-width: 94vw; }
  .grid { grid-template-columns: 1fr; }
  .gm__input { width: 100%; }
}
</style>

  