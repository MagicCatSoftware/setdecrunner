<template>
    <div class="page">
      <div class="no-print">
        <NavBar :me="me"/>
      </div>
  
      <div class="container">
        <!-- Header -->
        <div class="card head">
          <div class="head__left">
            <h1 class="title">{{ rs?.title || 'Untitled' }}</h1>
            <div class="meta">
              <span class="badge">{{ rs?.status || 'draft' }}</span>
              <span v-if="rs?.purchaseType" class="badge badge--ghost">{{ rs.purchaseType }}</span>
              <span class="dot"></span>
              <span>Created: {{ shortDate(rs?.createdAt) || '—' }}</span>
              <span v-if="rs?.date" class="sep">·</span>
              <span v-if="rs?.date">For: {{ shortDate(rs?.date) }}</span>
              <span class="sep">·</span>
              <span>By: {{ rs?.createdBy?.name || '—' }}</span>
              <span class="sep">·</span>
              <span>Assigned: {{ rs?.assignedTo?.name || '—' }}</span>
            </div>
          </div>
          <div class="head__right">
            <RouterLink v-if="rs?._id" class="btn" :to="{ name: 'runsheet-edit', params: { id: rs._id } }">Edit</RouterLink>
            <button class="btn" @click="print">Print</button>
            <button class="btn" @click="share">Share</button>
          </div>
        </div>
  
        <!-- Dates -->
        <div class="grid grid--2">
          <div class="card">
            <div class="label">Pick-Up Date</div>
            <div class="big">{{ shortDate(rs?.pickupDate) || '—' }}</div>
          </div>
          <div class="card">
            <div class="label">Return Date</div>
            <div class="big">{{ shortDate(rs?.returnDate) || '—' }}</div>
          </div>
        </div>
  
        <!-- Supplier / Destination / Set -->
        <div class="grid grid--3">
          <div class="card">
            <div class="card__head"><h3>Supplier</h3></div>
            <div v-if="supplierObj" class="kv">
              <div class="kv__row"><div class="k">Name</div><div class="v">{{ supplierObj.name }}</div></div>
              <div class="kv__row" v-if="supplierObj.address"><div class="k">Address</div><div class="v">{{ supplierObj.address }}</div></div>
              <div class="kv__row" v-if="supplierObj.phone"><div class="k">Phone</div><div class="v">{{ supplierObj.phone }}</div></div>
              <div class="kv__row" v-if="supplierObj.contactName"><div class="k">Contact</div><div class="v">{{ supplierObj.contactName }}</div></div>
              <div class="kv__row" v-if="supplierObj.hours"><div class="k">Hours</div><div class="v">{{ supplierObj.hours }}</div></div>
            </div>
            <div v-else class="muted">No supplier selected.</div>
          </div>
  
          <div class="card">
            <div class="card__head"><h3>Destination (Take To)</h3></div>
            <div v-if="takeToObj" class="kv">
              <div class="kv__row"><div class="k">Place</div><div class="v">{{ takeToObj.name }}</div></div>
              <div class="kv__row" v-if="takeToObj.address"><div class="k">Address</div><div class="v">{{ takeToObj.address }}</div></div>
            </div>
            <div v-else class="muted">No destination selected.</div>
          </div>
  
          <div class="card">
            <div class="card__head"><h3>Set</h3></div>
            <div v-if="rs?.set" class="big">
              <span v-if="typeof rs.set==='object'">{{ (rs.set.number || '') + (rs.set.name ? ' — ' + rs.set.name : '') }}</span>
              <span v-else>#{{ rs.set }}</span>
            </div>
            <div v-else class="muted">No set selected.</div>
          </div>
        </div>
  
        <!-- Google Map -->
        <div class="card">
          <div class="card__head map-head">
            <h3>Route & Stops</h3>
            <div class="spacer"></div>
            <button class="btn" :disabled="!gmReady" @click="rebuildMap">Refresh Map</button>
          </div>
  
          <div class="map-wrap">
            <div ref="mapEl" class="map"></div>
            <div class="map-side">
              <div class="muted mb-1">Route order: Supplier → Stops → Destination</div>
              <ol class="stoplist">
                <li v-for="(pt, i) in routePoints" :key="i">
                  <span class="dotnum">{{ i+1 }}</span>
                  <span class="stopline">
                    <strong>{{ pt.name }}</strong>
                    <span v-if="pt.address" class="addr"> — {{ pt.address }}</span>
                  </span>
                  <a class="link" :href="openInMapsHref(pt.raw)" target="_blank" rel="noopener">Open</a>
                </li>
              </ol>
              <div v-if="!routePoints.length" class="muted">Nothing to map yet.</div>
            </div>
          </div>
          <div v-if="mapError" class="error mt-1">{{ mapError }}</div>
        </div>
  
        <!-- Stops -->
        <div class="card">
          <div class="card__head"><h3>Stops ({{ rs?.stops?.length || 0 }})</h3></div>
          <div v-if="!rs?.stops?.length" class="muted">No stops yet.</div>
          <div v-else class="stops">
            <div v-for="(s, idx) in rs.stops" :key="s._id || idx" class="stop">
              <div class="stop__head">
                <div>
                  <div class="stop__title">{{ s.title || s.place?.name || 'Stop' }}</div>
                  <div v-if="s.place?.address" class="stop__addr">{{ s.place.address }}</div>
                  <div v-if="s.instructions" class="stop__instr">{{ s.instructions }}</div>
                </div>
                <div class="stop__actions">
                  <a v-if="s.place" class="btn btn--small" :href="openInMapsHref(s.place)" target="_blank" rel="noopener">
                    Open in Google Maps
                  </a>
                </div>
              </div>
  
              <div class="items" v-if="s.items?.length">
                <div v-for="(ri, i) in s.items" :key="i" class="item">
                  <div class="item__name">{{ ri.name || 'Item' }}</div>
                  <div class="item__meta"><span class="badge badge--ghost">Qty: {{ ri.quantity ?? 1 }}</span></div>
                  <div v-if="ri.notes" class="item__notes">{{ ri.notes }}</div>
                  <div v-if="ri.photos?.length" class="thumbs">
                    <img v-for="p in ri.photos" :key="p" :src="imageUrl(p)" class="thumb" />
                  </div>
                </div>
              </div>
              <div v-else class="muted">No items at this stop.</div>
            </div>
          </div>
        </div>
  
        <!-- Photos / Receipts -->
        <div class="grid grid--2">
          <div class="card">
            <div class="card__head"><h3>Photos</h3></div>
            <div class="thumbs">
              <img v-for="p in rs?.photos || []" :key="p" :src="imageUrl(p)" class="thumb" />
              <div v-if="!rs?.photos?.length" class="muted">No photos.</div>
            </div>
          </div>
          <div class="card">
            <div class="card__head"><h3>Receipts</h3></div>
            <div class="thumbs">
              <template v-for="p in rs?.receipts || []" :key="p">
                <img v-if="isImage(p)" :src="imageUrl(p)" class="thumb" />
                <a v-else class="btn btn--small" :href="imageUrl(p)" target="_blank" rel="noopener">Open receipt</a>
              </template>
              <div v-if="!rs?.receipts?.length" class="muted">No receipts.</div>
            </div>
          </div>
        </div>
  
        <!-- Contact -->
        <div class="card">
          <div class="card__head"><h3>Primary Contact</h3></div>
          <div v-if="contactRow" class="contact">
            <div class="contact__name">{{ contactRow.name }}</div>
            <div class="contact__line">
              <span v-if="contactRow.phone">{{ contactRow.phone }}</span>
              <span v-if="contactRow.phone && contactRow.email" class="dot"></span>
              <span v-if="contactRow.email">{{ contactRow.email }}</span>
            </div>
          </div>
          <div v-else class="muted">No contact selected.</div>
        </div>
  
        <!-- Post-Run -->
        <div class="card">
          <div class="card__head"><h3>Post-Run Destination</h3></div>
          <div class="kv">
            <div class="kv__row"><div class="k">Location</div><div class="v">{{ postLocationLabel }}</div></div>
            <div class="kv__row" v-if="rs?.postLocation==='address_below' && rs?.postAddress">
              <div class="k">Address</div><div class="v">{{ rs.postAddress }}</div>
            </div>
            <div class="kv__row" v-if="rs?.postPlace">
              <div class="k">Place</div>
              <div class="v">
                <span v-if="typeof rs.postPlace==='object'">{{ rs.postPlace.name }}</span>
                <span v-else>#{{ rs.postPlace }}</span>
              </div>
            </div>
          </div>
        </div>
  
        <!-- Purchase / Payment -->
        <div class="card">
          <div class="card__head"><h3>Purchase / Payment</h3></div>
          <div class="grid grid--4">
            <div><div class="label">Get Invoice</div><div class="big">{{ yesNo(rs?.getInvoice) }}</div></div>
            <div><div class="label">Get Deposit</div><div class="big">{{ yesNo(rs?.getDeposit) }}</div></div>
            <div><div class="label">Paid</div><div class="big">{{ yesNo(rs?.paid) }}</div></div>
            <div><div class="label">Amount</div><div class="big">{{ money(rs?.amount) || '—' }}</div></div>
          </div>
          <div class="grid grid--3 mt-1">
            <div><div class="label">Cheque #</div><div class="mono">{{ rs?.chequeNumber || '—' }}</div></div>
            <div><div class="label">PO #</div><div class="mono">{{ rs?.poNumber || '—' }}</div></div>
            <div><div class="label">Cheque/Cash Rec’d By</div><div>{{ rs?.paymentReceivedBy || rs?.receivedBy || '—' }}</div></div>
          </div>
        </div>
  
        <!-- Pickup / Delivering -->
        <div class="card">
          <div class="card__head"><h3>Pickup / Delivering</h3></div>
          <div class="grid grid--4">
            <div><div class="label">Service</div><div>{{ rs?.pdType || '—' }}</div></div>
            <div><div class="label">Payment</div><div>{{ rs?.pdPaymentMethod || '—' }}</div></div>
            <div><div class="label">Date</div><div>{{ shortDate(rs?.pdDate) || '—' }}</div></div>
            <div><div class="label">Time</div><div>{{ rs?.pdTime || '—' }}</div></div>
          </div>
          <div class="mt-1"><div class="label">Instructions</div><div>{{ rs?.pdInstructions || '—' }}</div></div>
          <div class="grid grid--2 mt-1">
            <div><div class="label">Completed By</div><div>{{ userLabel(rs?.pdCompletedBy) || '—' }}</div></div>
            <div><div class="label">Date</div><div>{{ shortDate(rs?.pdCompletedOn) || '—' }}</div></div>
          </div>
        </div>
  
        <!-- Return / Drop Off -->
        <div class="card">
          <div class="card__head"><h3>Return / Drop Off</h3></div>
          <div class="grid grid--4">
            <div><div class="label">Service</div><div>{{ rs?.rdType || '—' }}</div></div>
            <div><div class="label">Cheque</div><div>{{ yesNo(rs?.rdCheque) }}</div></div>
            <div><div class="label">Date</div><div>{{ shortDate(rs?.rdDate) || '—' }}</div></div>
            <div><div class="label">Time</div><div>{{ rs?.rdTime || '—' }}</div></div>
          </div>
          <div class="mt-1"><div class="label">Instructions</div><div>{{ rs?.rdInstructions || '—' }}</div></div>
          <div class="grid grid--2 mt-1">
            <div><div class="label">Completed By</div><div>{{ userLabel(rs?.rdCompletedBy) || '—' }}</div></div>
            <div><div class="label">Completed On</div><div>{{ shortDate(rs?.rdCompletedOn) || '—' }}</div></div>
          </div>
        </div>
  
        <!-- QC -->
        <div class="card">
          <div class="card__head"><h3>QC on Return</h3></div>
          <div class="grid grid--3">
            <div><div class="label">Items Returned In Good Condition</div><div class="big">{{ ternary(rs?.qcItemsGood) }}</div></div>
            <div><div class="label">Signature</div><div><img v-if="rs?.qcSignatureData" :src="rs.qcSignatureData" class="sig" /><span v-else class="muted">—</span></div></div>
            <div><div class="label">QC Date</div><div>{{ shortDate(rs?.rdCompletedOn || rs?.pdCompletedOn) || '—' }}</div></div>
          </div>
        </div>
  
        <div class="footer-spacer"></div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, computed, watch } from 'vue';
  import { useRoute, RouterLink } from 'vue-router';
  import NavBar from '../components/NavBar.vue';
  import api from '../api.js';
  import { useAuth } from '../auth.js';
  
  const route = useRoute();
  const auth  = useAuth();
  const me    = ref(null);
  const rs    = ref(null);
  
  /* ------------------------- Load RS ------------------------- */
  onMounted(async () => {
    try { me.value = await auth.fetchMe(); } catch {}
    const data = await api.get(`/tenant/runsheets/${route.params.id}`);
    rs.value = data;
  
    await Promise.all([
      hydrateIfId('supplier', '/suppliers/'),
      hydrateIfId('takeTo', '/places/'),
      hydrateIfId('set', '/sets/'),
      hydrateIfId('contact', '/people/'),
      hydrateStopsPlaces(),
    ]);
  
    const ok = await ensureGoogleMaps();
    gmReady.value = ok;
    if (!ok) {
      mapError.value = 'Google Maps failed to load. Please refresh, or ensure the API script/key is configured.';
      return;
    }
    await rebuildMap();
  });
  
  async function hydrateIfId(field, base) {
    const v = rs.value?.[field];
    if (!v || typeof v !== 'string') return;
    try { rs.value[field] = await api.get(`${base}${v}`); } catch {}
  }
  async function hydrateStopsPlaces() {
    const jobs = (rs.value?.stops || [])
      .filter(s => s.place && typeof s.place === 'string')
      .map(async s => { try { s.place = await api.get(`/tenant/places/${s.place}`); } catch {} });
    await Promise.all(jobs);
  }
  
  /* ------------------------- Company bits ------------------------- */
  const supplierObj = computed(() => rs.value?.supplier || null);
  const takeToObj   = computed(() => rs.value?.takeTo || null);
  const contactRow  = computed(() => {
    const c = rs.value?.contact; if (!c) return null;
    if (typeof c === 'string') return { name: `#${c}`, phone: '', email: '' };
    return { name: c.name || c.email || '—', phone: c.phone || '', email: c.email || '' };
  });
  const postLocationLabel = computed(() => {
    const v = rs.value?.postLocation;
    return v === 'hold_on_truck' ? 'Hold on Truck'
      : v === 'office' ? 'Office'
      : v === 'setdec_storage' ? 'Set Dec Storage'
      : v === 'address_below' ? 'Address Below'
      : '—';
  });
  
  /* ------------------------- Google Maps ------------------------- */
  const mapEl = ref(null);
  const gmReady = ref(false);
  const map = ref(null);
  const mapError = ref('');
  const markers = ref([]);
  const dirsRenderers = ref([]);
  let geocoder;
  
  function loadGoogleScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src^="${src.split('?')[0]}"]`)) {
        resolve(); return;
      }
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }
  function waitForGoogle(maxMs = 4000, step = 100) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (window.google && window.google.maps) return resolve(true);
        if (Date.now() - start > maxMs) return resolve(false);
        setTimeout(tick, step);
      };
      tick();
    });
  }
  async function ensureGoogleMaps() {
    if (await waitForGoogle(600, 60)) return true;
  
    const key =
      (import.meta?.env && import.meta.env.VITE_GOOGLE_MAPS_API_KEY) ||
      window.GOOGLE_MAPS_API_KEY ||
      '';
  
    if (!key) return false;
  
    const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    try {
      await loadGoogleScript(src);
      return await waitForGoogle(8000, 100);
    } catch {
      return false;
    }
  }
  
  function hasLL(o){
    const lat = o?.lat ?? o?.latitude;
    const lng = o?.lng ?? o?.longitude;
    return Number.isFinite(lat) && Number.isFinite(lng);
  }
  function eqLL(a,b){
    const al= a.lat ?? a.latitude, bl= b.lat ?? b.latitude;
    const ag= a.lng ?? a.longitude, bg= b.lng ?? b.longitude;
    return Math.abs(al-bl) < 1e-9 && Math.abs(ag-bg) < 1e-9;
  }
  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  
  const routePoints = computed(() => {
    const pts = [];
    const add = (raw, label) => {
      if (!raw) return;
      const name = raw.name || label || 'Location';
      const address = raw.address || '';
      pts.push({ name, address, raw });
    };
    if (supplierObj.value) add(supplierObj.value, 'Supplier');
    (rs.value?.stops || []).forEach(s => s.place && add(s.place, s.title || 'Stop'));
    if (takeToObj.value) add(takeToObj.value, 'Destination');
  
    const out = [];
    let last = null;
    for (const p of pts) {
      const same =
        last &&
        (
          (hasLL(p.raw) && hasLL(last.raw) && eqLL(p.raw, last.raw)) ||
          (p.name === last.name && p.address === last.address)
        );
      if (!same) out.push(p);
      last = p;
    }
    return out;
  });
  
  function openInMapsHref(obj){
    if (!obj) return 'https://maps.google.com/';
    const q = hasLL(obj)
      ? `${obj.lat ?? obj.latitude},${obj.lng ?? obj.longitude}`
      : (obj.address || obj.name || '');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  
  async function rebuildMap(){
    mapError.value = '';
    if (!gmReady.value || !mapEl.value) return;
    if (!window.google || !window.google.maps) return;
  
    const gmaps = window.google.maps;
    if (!map.value) {
      map.value = new gmaps.Map(mapEl.value, {
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoom: 11,
        center: { lat: 43.6532, lng: -79.3832 }
      });
      geocoder = new gmaps.Geocoder();
    }
  
    markers.value.forEach(m => m.setMap(null));
    markers.value = [];
    dirsRenderers.value.forEach(r => r.setMap(null));
    dirsRenderers.value = [];
  
    const pts = routePoints.value;
    if (!pts.length) {
      map.value.setZoom(10);
      return;
    }
  
    const resolved = [];
    for (let i=0;i<pts.length;i++){
      const p = pts[i];
      // eslint-disable-next-line no-await-in-loop
      const ll = await resolveLL(p.raw);
      if (!ll) continue;
      resolved.push({ ...p, ll });
    }
    if (!resolved.length) {
      mapError.value = 'Could not resolve any locations on the map.';
      return;
    }
  
    const bounds = new gmaps.LatLngBounds();
    resolved.forEach((p, idx) => {
      bounds.extend(p.ll);
      const marker = new gmaps.Marker({
        position: p.ll,
        map: map.value,
        label: `${idx+1}`,
        title: p.name
      });
      const iw = new gmaps.InfoWindow({
        content: `
          <div style="min-width:220px">
            <div style="font-weight:700;margin-bottom:2px">${escapeHtml(p.name)}</div>
            ${p.address ? `<div style="color:#6b7280;margin-bottom:6px">${escapeHtml(p.address)}</div>` : ''}
            <a target="_blank" rel="noopener" href="${openInMapsHref(p.raw)}">Open in Google Maps</a>
          </div>`
      });
      marker.addListener('click', () => iw.open({ map: map.value, anchor: marker }));
      markers.value.push(marker);
    });
    map.value.fitBounds(bounds, 50);
  
    try {
      await drawDirections(resolved.map(p => p.ll));
    } catch (e) {
      mapError.value = 'Could not draw directions (showing markers only).';
    }
  }
  
  async function resolveLL(raw){
    if (!window.google || !window.google.maps) return null;
    const gmaps = window.google.maps;
    if (hasLL(raw)) {
      return new gmaps.LatLng(raw.lat ?? raw.latitude, raw.lng ?? raw.longitude);
    }
    const q = raw?.address || raw?.name;
    if (!q) return null;
    try {
      const res = await geocoder.geocode({ address: q });
      const r = res?.results?.[0];
      return r?.geometry?.location || null;
    } catch { return null; }
  }
  
  async function drawDirections(latLngs){
    if (!window.google || !window.google.maps) return;
    const gmaps = window.google.maps;
    if (latLngs.length < 2) return;
  
    const svc = new gmaps.DirectionsService();
  
    const MAX = 25;
    let start = 0;
    while (start < latLngs.length - 1) {
      const end = Math.min(start + (MAX - 1), latLngs.length - 1);
      const origin = latLngs[start];
      const destination = latLngs[end];
      const wps = latLngs.slice(start + 1, end).map(ll => ({ location: ll, stopover: true }));
  
      // eslint-disable-next-line no-await-in-loop
      const resp = await svc.route({
        origin,
        destination,
        waypoints: wps,
        travelMode: gmaps.TravelMode.DRIVING,
        optimizeWaypoints: false
      });
  
      const renderer = new gmaps.DirectionsRenderer({
        map: map.value,
        suppressMarkers: true,
        preserveViewport: true
      });
      renderer.setDirections(resp);
      dirsRenderers.value.push(renderer);
  
      start = end;
    }
  }
  
  watch(() => rs.value?.stops, async () => {
    if (!gmReady.value) return;
    await rebuildMap();
  }, { deep: true });
  
  /* ------------------------- Misc helpers ------------------------- */
  function shortDate(d){ if(!d) return ''; const dt = new Date(d); return isNaN(dt)?'':dt.toLocaleDateString(); }
  function yesNo(v){ return v ? 'Yes' : 'No'; }
  function ternary(v){ return v===true ? 'Yes' : v===false ? 'No' : '—'; }
  function money(n){
    if(typeof n!=='number'||!isFinite(n)) return '';
    try { return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n); }
    catch { return `$${Number(n).toFixed(2)}`; }
  }
  function userLabel(u){ if(!u) return ''; if(typeof u==='string') return `#${u}`; return u.name || u.email || u._id || ''; }
  function isImage(url){ return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url || ''); }
  
  /** Public URL builder for /uploads */
  const API_BASE = (() => {
    const guess =
      (api && (api.baseURL || api.defaults?.baseURL)) ||
      (import.meta?.env && import.meta.env.VITE_API_BASE_URL) ||
      window.API_BASE_URL ||
      '';
    return String(guess || '').replace(/\/+$/,'');
  })();
  const DEV = !!(import.meta?.env && import.meta.env.DEV);
  
const IMAGE_BASE = import.meta.env.IMAGE_BASE || '/api'; // leave empty for same-origin

function imageUrl(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p; // already absolute
  let path = String(p);

  // normalize to /uploads/...
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  if (!path.startsWith('/uploads/')) {
    path = '/uploads/' + path.replace(/^\/+/, '/api/');
  }

  console.log(path);

  // encode just the filename, not the whole path
  const parts = path.split('/');
  const file = parts.pop();
  return (IMAGE_BASE + [...parts, encodeURIComponent(file)].join('/'));
}
  
  function print(){ window.print(); }
  async function share(){ try { await navigator.share?.({ title: rs.value?.title || 'Runsheet', url: location.href }); } catch {} }
  </script>
  
  
  
  <style scoped>
  /* Layout base */
  .container { max-width: 1100px; margin: 0 auto; padding: 16px; }
  .page { background: #f7f8fa; min-height: 100vh; }
  .no-print { position: sticky; top: 0; z-index: 10; }
  
  /* Cards / UI */
  .card { background: #fff; border: 1px solid #e6e8eb; border-radius: 10px; padding: 14px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .card__head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .title { margin: 0; font-size: 22px; }
  .meta { color: #6b7280; font-size: 13px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #eef2ff; color: #374151; border: 1px solid #e5e7eb; }
  .badge--ghost { background: #f7f7f7; }
  .sep::before { content: '·'; margin: 0 6px; color: #c0c4c9; }
  .dot::before { content: '•'; margin: 0 6px; color: #c0c4c9; }
  .btn { padding: 8px 12px; border: 1px solid #cfd3d8; border-radius: 8px; background: #f8f9fb; cursor: pointer; font-weight: 600; font-size: 14px; }
  .btn:hover { background: #f1f3f6; }
  .btn--small { padding: 6px 10px; font-size: 13px; }
  .muted { color: #6b7280; font-size: 13px; }
  .label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
  .big { font-weight: 700; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  
  /* Header layout */
  .head { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; }
  .head__right { display: flex; gap: 8px; }
  
  /* Grid helpers */
  .grid { display: grid; gap: 12px; }
  .grid--2 { grid-template-columns: repeat(2, 1fr); }
  .grid--3 { grid-template-columns: repeat(3, 1fr); }
  .grid--4 { grid-template-columns: repeat(4, 1fr); }
  @media (max-width: 900px){ .grid--3 { grid-template-columns: 1fr; } .grid--4 { grid-template-columns: 1fr 1fr; } }
  
  /* Key-value */
  .kv { display: grid; gap: 6px; }
  .kv__row { display: grid; grid-template-columns: 120px 1fr; gap: 8px; }
  .k { color: #6b7280; font-size: 13px; }
  .v { }
  
  /* Map */
  .map-head { align-items: center; }
  .map-wrap { display: grid; grid-template-columns: 1fr 320px; gap: 12px; }
  .map { width: 100%; height: 420px; border-radius: 8px; border: 1px solid #e5e7eb; }
  .map-side { display: flex; flex-direction: column; gap: 8px; }
  .stoplist { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
  .stopline { display: inline-block; margin: 0 8px 0 6px; }
  .addr { color: #6b7280; }
  .dotnum { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; font-size: 12px; border-radius: 50%; background: #eef2ff; border: 1px solid #e5e7eb; }
  @media (max-width: 1000px){ .map-wrap { grid-template-columns: 1fr; } .map { height: 360px; } }
  
  /* Stops / Items */
  .stops { display: grid; gap: 10px; }
  .stop { padding: 10px; border: 1px dashed #e5e7eb; border-radius: 8px; background: #fafafa; }
  .stop__head { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
  .stop__title { font-weight: 700; }
  .stop__addr { color: #6b7280; font-size: 13px; }
  .stop__instr { margin-top: 4px; }
  .stop__actions { display: flex; align-items: center; gap: 8px; }
  .items { margin-top: 8px; display: grid; gap: 8px; }
  .item { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 8px; }
  .item__name { font-weight: 600; }
  .item__notes { margin-top: 4px; color: #374151; }
  .thumbs { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
  .thumb { max-width: 140px; max-height: 100px; border: 1px solid #eee; border-radius: 6px; }
  
  .sig { max-width: 320px; max-height: 120px; border: 1px solid #eee; border-radius: 6px; }
  
  .link { color: #0d6efd; text-decoration: none; }
  
  /* Errors / spacing */
  .error { color: #b42318; }
  .mb-1 { margin-bottom: 8px; }
  .mt-1 { margin-top: 8px; }
  .spacer { flex: 1; }
  .footer-spacer { height: 28px; }
  </style>
  