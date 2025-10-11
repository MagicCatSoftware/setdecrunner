<template>
  <div>
    <NavBar :me="me" />

    <div class="container">
      <div v-if="loading" class="muted">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <template v-else>
        <!-- Header -->
        <div class="header card">
          <div class="title-row">
            <h2 class="title">{{ rs.title || 'Runsheet (By Hand)' }}</h2>
            <span class="badge">Handwritten</span>
            <span v-if="rs.purchaseType" class="badge">{{ rs.purchaseType }}</span>
          </div>
          <div class="meta">
            <span>Created: {{ shortDate(rs.createdAt) }}</span>
            <span v-if="rs.date"> · For: {{ shortDate(rs.date) }}</span>
            <span> · By: {{ rs.createdBy?.name || '—' }}</span>
          </div>
          <div class="actions">
            <RouterLink class="btn" :to="{ name: 'runsheet-edit', params: { slug, id } }">Edit</RouterLink>
            <RouterLink class="btn" :to="{ name: 'runsheet-beta', params: { slug, id } }">View Beta</RouterLink>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="card toolbar">
          <div class="left">
            <strong>Runsheet By Hand</strong>
            <span class="muted">Draw on the runsheet with a stylus or mouse.</span>
          </div>

          <div class="tools">
            <label class="tool">
              Size
              <input type="range" min="1" max="28" v-model.number="pen.size" />
            </label>

            <label class="tool" v-if="mode === 'pen'">
              Color
              <input type="color" v-model="pen.color" />
            </label>

            <button class="btn" :class="{ 'btn--active': mode==='pen' }"  @click="setMode('pen')">✒️ Pen</button>
            <button class="btn" :class="{ 'btn--active': mode==='eraser' }" @click="setMode('eraser')">🩹 Eraser</button>

            <button class="btn" :disabled="!canUndo" @click="undo">↩ Undo</button>
            <button class="btn" @click="clearCanvasConfirm">🗑 Clear</button>

            <!-- Helpers -->
            <div class="helpers">
              <!-- Supplier helper -->
              <div class="helper"
                   @mouseenter="open.suppliers = true; ensureLoaded('suppliers')"
                   @mouseleave="open.suppliers = false">
                <button class="btn">＋ Supplier</button>
                <div class="popover" v-show="open.suppliers">
                  <input class="input input--search" v-model.trim="q.suppliers" placeholder="Search suppliers…" />
                  <div class="list">
                    <button class="item" v-for="s in filteredSuppliers" :key="s._id || s.id" @click="insertFrom('suppliers', s)">
                      <div class="item__title">{{ s.name }}</div>
                      <div class="item__sub" v-if="s.phone || s.address">
                        <span v-if="s.phone">{{ s.phone }}</span>
                        <span v-if="s.phone && s.address"> · </span>
                        <span v-if="s.address">{{ s.address }}</span>
                      </div>
                    </button>
                    <div class="empty" v-if="!filteredSuppliers.length">No matches</div>
                  </div>
                </div>
              </div>

              <!-- People helper -->
              <div class="helper"
                   @mouseenter="open.people = true; ensureLoaded('people')"
                   @mouseleave="open.people = false">
                <button class="btn">＋ Person</button>
                <div class="popover" v-show="open.people">
                  <input class="input input--search" v-model.trim="q.people" placeholder="Search people…" />
                  <div class="list">
                    <button class="item" v-for="p in filteredPeople" :key="p._id || p.id" @click="insertFrom('people', p)">
                      <div class="item__title">{{ p.name }}</div>
                      <div class="item__sub" v-if="p.email || p.phone">
                        <span v-if="p.email">{{ p.email }}</span>
                        <span v-if="p.email && p.phone"> · </span>
                        <span v-if="p.phone">{{ p.phone }}</span>
                      </div>
                    </button>
                    <div class="empty" v-if="!filteredPeople.length">No matches</div>
                  </div>
                </div>
              </div>

              <!-- Sets helper -->
              <div class="helper"
                   @mouseenter="open.sets = true; ensureLoaded('sets')"
                   @mouseleave="open.sets = false">
                <button class="btn">＋ Set</button>
                <div class="popover" v-show="open.sets">
                  <input class="input input--search" v-model.trim="q.sets" placeholder="Search sets…" />
                  <div class="list">
                    <button class="item" v-for="s in filteredSets" :key="s._id || s.id" @click="insertFrom('sets', s)">
                      <div class="item__title">{{ s.title || s.name }}</div>
                      <div class="item__sub" v-if="s.code || s.location">
                        <span v-if="s.code">{{ s.code }}</span>
                        <span v-if="s.code && s.location"> · </span>
                        <span v-if="s.location">{{ s.location }}</span>
                      </div>
                    </button>
                    <div class="empty" v-if="!filteredSets.length">No matches</div>
                  </div>
                </div>
              </div>

              <!-- Places helper -->
              <div class="helper"
                   @mouseenter="open.places = true; ensureLoaded('places')"
                   @mouseleave="open.places = false">
                <button class="btn">＋ Place</button>
                <div class="popover" v-show="open.places">
                  <input class="input input--search" v-model.trim="q.places" placeholder="Search places…" />
                  <div class="list">
                    <button class="item" v-for="p in filteredPlaces" :key="p._id || p.id" @click="insertFrom('places', p)">
                      <div class="item__title">{{ p.name }}</div>
                      <div class="item__sub" v-if="p.address">{{ p.address }}</div>
                    </button>
                    <div class="empty" v-if="!filteredPlaces.length">No matches</div>
                  </div>
                </div>
              </div>
            </div>

            <button class="btn" :disabled="saving" @click="saveStrokes">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>

            <button class="btn btn--primary" @click="saveAndSend" :disabled="ai.loading">
              {{ ai.loading ? 'Uploading…' : 'Save & Send to AI' }}
            </button>
          </div>
        </div>

        <!-- Canvas Stack -->
        <div class="card canvas-wrap" ref="wrap">
          <img
            ref="bgEl"
            class="bg"
            :src="bgSrc"
            :key="bgSrc"
            alt="Runsheet"
            @load="fitCanvas"
          />

          <!-- Printed details in the white box -->
          <div class="owner-box" :style="ownerBoxStyle">
            {{ ownerLine }}
          </div>

          <canvas ref="inkEl" class="ink" />
        </div>

        <!-- Results (latest OCR) -->
        <div v-if="ocrText || hasFields" class="card ocr">
          <h3>AI Extracted Text</h3>
          <pre>{{ ocrText }}</pre>
          <div v-if="hasFields">
            <h4>Parsed Fields</h4>
            <pre>{{ formattedFields }}</pre>
          </div>
        </div>

        <div class="muted small" v-if="lastSavedAt">
          Last saved {{ new Date(lastSavedAt).toLocaleString() }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import NavBar from '../components/NavBar.vue'
import api, { apiGet } from '../api.js'

// ---- route params ----
const route = useRoute()
const id = String(route.params.id || '')
const slug = String(route.params.slug || '')

// ---- background source from /public (manually cache-busted if needed) ----
const bgSrc = '/runsheet.jpg?v=3'

// ---- refs & state ----
const me = ref(null)
const rs = ref(null)
const prod = ref(null) // Production meta (name, company, phone, address, …)
const error = ref('')
const loading = ref(true)

const wrap  = ref(null)
const inkEl = ref(null)
const bgEl  = ref(null)
const ctx   = ref(null)

const mode = ref('pen') // 'pen' | 'eraser' | 'text'
const pen  = reactive({ size: 4, color: '#0a0a0a' })

const drawing = ref(false)
const last = reactive({ x: 0, y: 0 })
const saving = ref(false)
let saveTimer = null

// ---- normalized strokes + base logical size ----
const baseWidth = ref(0)
const baseHeight = ref(0)
const strokes = ref([]) // [{ tool, color, size, points:[{x,y,p?}]}] or text stamps
const canUndo = computed(() => strokes.value.length > 0)
const lastSavedAt = ref(null)

// ---- latest OCR preview (if any) ----
const ai = reactive({ loading: false })
const ocrText = computed(() => rs.value?.ocr?.latest?.text || '')
const hasFields = computed(() => {
  const f = rs.value?.ocr?.latest?.fields
  return !!f && Object.keys(f).length > 0
})
const formattedFields = computed(() => JSON.stringify(rs.value?.ocr?.latest?.fields || {}, null, 2))

// Keep these in sync with your CSS percentages (owner box placement over the template)
const OWNER_BOX_PCT = { left: 12.0, top: 10.5, width: 62.0, height: 10.0 };

/** Compute owner-box rect in pixels for a target canvas size */
function ownerBoxRectPx(w, h) {
  return {
    x: (OWNER_BOX_PCT.left / 100) * w,
    y: (OWNER_BOX_PCT.top / 100) * h,
    w: (OWNER_BOX_PCT.width / 100) * w,
    h: (OWNER_BOX_PCT.height / 100) * h,
  };
}

/** Draw a solid white box + production text */
function drawOwnerBoxTo(ctx, w, h, text, opts = {}) {
  if (!text) return;
  const { x, y, w: bw, h: bh } = ownerBoxRectPx(w, h);

  // paint the white box (cleans any speckle; no background image is drawn)
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, bw, bh);

  // choose a font size that fits comfortably inside the box
  // ~ 32–40% of the box height tends to look right for a single line
  const px = Math.max(12, Math.min(bh * 0.38, 64));
  ctx.font = `${px}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';

  // simple inset padding
  const padX = Math.max(6, bw * 0.02);
  const padY = Math.max(4, bh * 0.12);

  // single-line truncate if too long
  const maxWidth = bw - padX * 2;
  let toDraw = text;
  if (ctx.measureText(toDraw).width > maxWidth) {
    // naive ellipsis
    while (toDraw.length && ctx.measureText(toDraw + '…').width > maxWidth) {
      toDraw = toDraw.slice(0, -1);
    }
    toDraw += '…';
  }

  ctx.fillText(toDraw, x + padX, y + padY);
  ctx.restore();
}

// ---------------- Canvas sizing & render ----------------
function fitCanvas () {
  const c = inkEl.value
  const img = bgEl.value
  if (!c || !img || !img.naturalWidth) return

  // Logical pixels (match the background natural size)
  c.width  = img.naturalWidth
  c.height = img.naturalHeight

  // CSS sizing: fill the wrapper exactly; preserve aspect via img
  c.style.width = '100%'
  c.style.height = '100%'

  ctx.value = c.getContext('2d')
  ctx.value.lineJoin = 'round'
  ctx.value.lineCap  = 'round'

  if (!baseWidth.value || !baseHeight.value) {
    baseWidth.value = c.width
    baseHeight.value = c.height
  }

  renderAll()
}

// ---------- helper popovers ----------
const open = reactive({ suppliers: false, people: false, sets: false, places: false })
const q = reactive({ suppliers: '', people: '', sets: '', places: '' })

const lists = reactive({ suppliers: [], people: [], sets: [], places: [] })
const loaded = reactive({ suppliers: false, people: false, sets: false, places: false })
const loadingLists = reactive({ suppliers: false, people: false, sets: false, places: false })

const ENDPOINTS = {
  suppliers: '/tenant/suppliers',
  people: '/tenant/people',
  sets: '/tenant/sets',
  places: '/tenant/places'
}

async function ensureLoaded (kind) {
  if (loaded[kind] || loadingLists[kind]) return
  loadingLists[kind] = true
  try {
    const res = await apiGet(ENDPOINTS[kind], { limit: 500, fields: 'name,title,code,phone,email,address,location' })
    lists[kind] = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : [])
    loaded[kind] = true
  } catch (e) {
    console.warn(`Failed to load ${kind}:`, e?.message || e)
    lists[kind] = []
  } finally {
    loadingLists[kind] = false
  }
}

// ---------- filters ----------
const filteredSuppliers = computed(() => {
  const s = (q.suppliers || '').toLowerCase()
  return lists.suppliers.filter(x =>
    !s ||
    (x.name && x.name.toLowerCase().includes(s)) ||
    (x.phone && String(x.phone).toLowerCase().includes(s)) ||
    (x.address && x.address.toLowerCase().includes(s))
  ).slice(0, 100)
})
const filteredPeople = computed(() => {
  const s = (q.people || '').toLowerCase()
  return lists.people.filter(x =>
    !s ||
    (x.name && x.name.toLowerCase().includes(s)) ||
    (x.email && x.email.toLowerCase().includes(s)) ||
    (x.phone && String(x.phone).toLowerCase().includes(s))
  ).slice(0, 100)
})
const filteredSets = computed(() => {
  const s = (q.sets || '').toLowerCase()
  return lists.sets.filter(x => {
    const title = x.title || x.name || ''
    return !s ||
      title.toLowerCase().includes(s) ||
      (x.code && String(x.code).toLowerCase().includes(s)) ||
      (x.location && x.location.toLowerCase().includes(s))
  }).slice(0, 100)
})
const filteredPlaces = computed(() => {
  const s = (q.places || '').toLowerCase()
  return lists.places.filter(x =>
    !s ||
    (x.name && x.name.toLowerCase().includes(s)) ||
    (x.address && x.address.toLowerCase().includes(s))
  ).slice(0, 100)
})

// ---------- text-stamp (optional tool) ----------
const pendingText = ref('')

function formatStamp (kind, item) {
  switch (kind) {
    case 'suppliers': {
      const bits = [item.name, item.phone, item.address].filter(Boolean)
      return bits.join(' · ')
    }
    case 'people': {
      const bits = [item.name, item.email, item.phone].filter(Boolean)
      return bits.join(' · ')
    }
    case 'sets': {
      const title = item.title || item.name
      const bits = [title, item.code, item.location].filter(Boolean)
      return bits.join(' · ')
    }
    case 'places': {
      const bits = [item.name, item.address].filter(Boolean)
      return bits.join(' · ')
    }
    default:
      return ''
  }
}

function insertFrom (kind, item) {
  const text = formatStamp(kind, item)
  if (!text) return
  pendingText.value = text
  mode.value = 'text'
  open.suppliers = open.people = open.sets = open.places = false
}

// ---------- render ----------
function renderAll () {
  if (!ctx.value || !inkEl.value) return
  const c = inkEl.value
  ctx.value.clearRect(0, 0, c.width, c.height)
  renderStrokesTo(ctx.value, c.width, c.height)
}

/**
 * Render strokes to a given context.
 * opts.forceBlack → true to force all content to black (for export)
 */
function renderStrokesTo (targetCtx, w, h, opts = {}) {
  if (!strokes.value.length) return;

  const {
    forceBlack = false,
    eraserAsWhite = false,   // <-- new
    minStrokePx = 2          // <-- new (ensure visibility for OCR)
  } = opts;

  const bw = baseWidth.value || w;
  const bh = baseHeight.value || h;
  const sx = w / bw;
  const sy = h / bh;
  const sScale = (sx + sy) / 2;

  targetCtx.save();
  targetCtx.lineJoin = 'round';
  targetCtx.lineCap  = 'round';
  targetCtx.globalAlpha = 1;

  for (const s of strokes.value) {
    // Text stamps
    if (s.tool === 'text' && s.text && s.at) {
      targetCtx.save();
      targetCtx.globalCompositeOperation = 'source-over';
      targetCtx.fillStyle = forceBlack ? '#000' : (s.color || '#000');
      const px = Math.max(12, (s.size || 14) * sScale * 3);
      targetCtx.font = `${px}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
      targetCtx.textBaseline = 'top';
      targetCtx.fillText(String(s.text), s.at.x * w, s.at.y * h);
      targetCtx.restore();
      continue;
    }

    // Pen/Eraser strokes
    if (!s?.points?.length) continue;
    const isEraser = s.tool === 'eraser';

    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1];
      const b = s.points[i];
      const pA = (a.p && a.p > 0 ? a.p : 1);
      const pB = (b.p && b.p > 0 ? b.p : 1);
      const segPressure = (pA + pB) / 2;

      // For export: prefer solid colors on a white bg
      if (isEraser && eraserAsWhite) {
        targetCtx.globalCompositeOperation = 'source-over';
        targetCtx.strokeStyle = '#fff';                // paint white over ink
      } else {
        targetCtx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
        targetCtx.strokeStyle = isEraser
          ? 'rgba(0,0,0,1)'
          : (forceBlack ? '#000' : (s.color || '#000'));
      }

      targetCtx.lineWidth = Math.max(minStrokePx, (s.size || 4) * segPressure * sScale);

      targetCtx.beginPath();
      targetCtx.moveTo(a.x * w, a.y * h);
      targetCtx.lineTo(b.x * w, b.y * h);
      targetCtx.stroke();
    }
  }

  targetCtx.globalCompositeOperation = 'source-over';
  targetCtx.restore();
}

// ---------- pointer helpers ----------
function toCanvasXY (e) {
  const rect = inkEl.value.getBoundingClientRect()
  const scaleX = inkEl.value.width  / rect.width
  const scaleY = inkEl.value.height / rect.height
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
}
function toNorm (p) {
  const c = inkEl.value
  if (!c || !c.width || !c.height) return { x: 0, y: 0 }
  return { x: p.x / c.width, y: p.y / c.height }
}
function setMode (m) { mode.value = m }

let currentStroke = null

function start (e) {
  if (!ctx.value || !inkEl.value) return

  if (mode.value === 'text' && pendingText.value) {
    const p = toCanvasXY(e)
    const norm = toNorm(p)
    strokes.value.push({
      tool: 'text',
      text: pendingText.value,
      color: pen.color,
      size: pen.size,
      at: norm
    })
    pendingText.value = ''
    renderAll()
    scheduleSave(300)
    e.preventDefault()
    return
  }

  drawing.value = true
  const pxy = toCanvasXY(e)
  last.x = pxy.x; last.y = pxy.y

  const pressure = e.pressure && e.pressure > 0 ? e.pressure : 1
  currentStroke = {
    tool: mode.value,
    color: pen.color,
    size: pen.size,
    points: [{ ...toNorm(pxy), p: pressure }]
  }
  strokes.value.push(currentStroke)
  e.preventDefault()
}

function move (e) {
  if (mode.value === 'text') return
  if (!drawing.value || !ctx.value || !currentStroke) return

  const pxy = toCanvasXY(e)
  const pressure = e.pressure && e.pressure > 0 ? e.pressure : 1
  const isEraser = mode.value === 'eraser'

  // live preview while drawing (device pixels)
  ctx.value.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over'
  ctx.value.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : pen.color
  ctx.value.lineWidth = pen.size * pressure

  ctx.value.beginPath()
  ctx.value.moveTo(last.x, last.y)
  ctx.value.lineTo(pxy.x, pxy.y)
  ctx.value.stroke()
  ctx.value.globalCompositeOperation = 'source-over'

  // record normalized point + pressure for later re-render/export
  currentStroke.points.push({ ...toNorm(pxy), p: pressure })
  last.x = pxy.x; last.y = pxy.y
  e.preventDefault()
}

function end () {
  drawing.value = false
  currentStroke = null
  scheduleSave(600)
}

// ---- undo/clear ----
function undo () {
  if (!canUndo.value) return
  strokes.value.pop()
  renderAll()
  scheduleSave(400)
}
function clearCanvasConfirm () {
  if (!confirm('Clear all handwriting?')) return
  strokes.value = []
  renderAll()
  scheduleSave(0)
}

// ---------------- Persistence ----------------
async function saveStrokes () {
  if (!inkEl.value || !bgEl.value) return
  saving.value = true
  try {
    const payload = {
      baseWidth: baseWidth.value || bgEl.value.naturalWidth || inkEl.value.width,
      baseHeight: baseHeight.value || bgEl.value.naturalHeight || inkEl.value.height,
      strokes: strokes.value
    }
    const saved = await api.put(`/tenant/runsheetsbyhand/${id}/hand`, payload)
    lastSavedAt.value = saved?.hand?.lastSavedAt || new Date().toISOString()
  } catch (e) {
    alert(e?.body?.error || e?.message || 'Failed to save handwriting')
  } finally {
    saving.value = false
  }
}
function scheduleSave (delay = 500) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveStrokes() }, delay)
}

// ---------------- Export & send to AI (ink-only, black) ----------------
async function saveAndSend () {
  ai.loading = true;
  try {
    await saveStrokes();

    const img = bgEl.value;
    const scale = 2;
    const off = document.createElement('canvas');
    off.width  = img.naturalWidth  * scale;
    off.height = img.naturalHeight * scale;
    const octx = off.getContext('2d', { willReadFrequently: true });

    // A) Solid white background (critical for OCR)
    octx.save();
    octx.fillStyle = '#fff';
    octx.fillRect(0, 0, off.width, off.height);
    octx.restore();

    // B) Burn the production info box (white box + black text)
    drawOwnerBoxTo(octx, off.width, off.height, ownerLine.value);

    // C) Draw handwriting in black; eraser paints white; enforce min width
    renderStrokesTo(octx, off.width, off.height, {
      forceBlack: true,
      eraserAsWhite: true,
      minStrokePx: 2.5
    });

    // D) Export and send
    const blob = await new Promise((res) => off.toBlob(res, 'image/png', 0.95));
    const fd = new FormData();
    fd.append('file', blob, `runsheet-${id}-ink-only-with-owner.png`);
    fd.append('runsheetId', id || '');
    fd.append('slug', slug || '');

    await api.post('/tenant/ocr/runsheet', fd, { multipart: true });

    rs.value = await apiGet(`/tenant/runsheetsbyhand/${id}/hand`);
  } catch (e) {
    alert(typeof e === 'string' ? e : (e?.message || 'Upload failed'));
  } finally {
    ai.loading = false;
  }
}

// ---------------- data loading ----------------
function shortDate (d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString() } catch { return '—' } }

async function loadRunsheet () {
  loading.value = true
  error.value = ''
  try {
    rs.value = await apiGet(`/tenant/runsheets/${id}`)
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to load runsheet'
  } finally {
    loading.value = false
  }
}

async function loadHand () {
  try {
    const res = await apiGet(`/tenant/runsheetsbyhand/${id}/hand`)
    const hand = res?.hand || {}
    baseWidth.value = hand.baseWidth || 0
    baseHeight.value = hand.baseHeight || 0
    strokes.value = Array.isArray(hand.strokes) ? hand.strokes : []
    lastSavedAt.value = hand.lastSavedAt || null
    renderAll()
  } catch { /* non-fatal */ }
}

// ---- Production details (from DB) for overlay ----
// Try a tenant endpoint first; fall back to public slug endpoint.
// (Some public endpoints only return name/slug, so we still prefer rs fields.)
async function loadProductionMeta () {
  try {
    const p1 = await apiGet(`/tenant/getproductions/by_slug/${encodeURIComponent(slug)}`)
    prod.value = p1 || null
  } catch {
   
  }
}

// ---------- overlay field helpers ----------
// Pick first non-empty value by alias list (tries case-insensitive too)
// ---------- overlay field helpers ----------
function pick (obj, keys) {
  if (!obj) return ''
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  // case-insensitive pass
  const lower = Object.create(null)
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v
  for (const k of keys) {
    const v = lower[k.toLowerCase()]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}


const ownerName = computed(() =>
  pick(prod.value, ['name', 'productionName']) 
  
)

const ownerCompany = computed(() =>
  pick(prod.value, ['company', 'productionCompany']) 
 
)

const ownerPhone = computed(() =>
  pick(prod.value, ['phone', 'productionPhone', 'contactPhone']) 
  
)

const ownerAddress = computed(() =>
  pick(prod.value, ['address', 'productionAddress', 'location']) 

)

// Single wrapped line with commas; only include non-empty parts
const ownerLine = computed(() => {
  const parts = [
    ownerName.value,
    ownerCompany.value,
    ownerPhone.value,
    ownerAddress.value
  ].map(s => String(s || '').trim()).filter(Boolean)
  return parts.join(', ')
})

/**
 * Box position (percentages) over the template image.
 * Adjust if your template shifts.
 */
const ownerBoxStyle = computed(() => ({
  top: '10%',
  left: '3.5%',
  width: '45%',
  height: '24%'
}))

// ---- lifecycle ----
onMounted(async () => {
  try { me.value = await apiGet('/tenant/tenantauth/me') } catch { me.value = null }
  await Promise.all([loadRunsheet(), loadProductionMeta()])

  const el = inkEl.value
  el.addEventListener('pointerdown', start, { passive: false })
  window.addEventListener('pointermove', move, { passive: false })
  window.addEventListener('pointerup', end, { passive: true })
  window.addEventListener('pointercancel', end, { passive: true })

  await loadHand()
})

onBeforeUnmount(() => {
  const el = inkEl.value
  if (el) el.removeEventListener('pointerdown', start)
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', end)
  window.removeEventListener('pointercancel', end)
})
</script>

<style scoped>
/* Layout */
.container { max-width: 980px; margin: 0 auto; padding: 16px; }
.card { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
.muted { color: #666; }
.small { font-size: 12px; }
.error { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; padding: 8px 10px; border-radius: 6px; }
.title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

/* Header card */
.header { display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; align-items: center; }
.header .title { margin: 0; font-size: 18px; }
.header .meta { grid-column: 1 / span 1; color: #6b7280; font-size: 13px; }
.header .actions { grid-column: 2 / span 1; display: inline-flex; gap: 8px; }
@media (max-width: 680px) {
  .header { grid-template-columns: 1fr; }
  .header .actions { grid-column: 1 / -1; }
}

/* Toolbar */
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.tool { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; }

/* Buttons / pills */
.btn { padding: 6px 10px; border: 1px solid #ddd; border-radius: 6px; background: #fafafa; cursor: pointer; transition: background .15s, border-color .15s, box-shadow .15s; }
.btn:hover { background: #f3f4f6; border-color: #d1d5db; }
.btn:disabled { opacity: .6; cursor: not-allowed; }
.btn--primary { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.btn--primary:hover { background: #2563eb; border-color: #2563eb; }
.btn--active { box-shadow: inset 0 0 0 2px #3b82f6; }

/* Badges */
.badge { background: #eef2ff; color: #3730a3; border-radius: 9999px; padding: 2px 8px; font-size: 12px; margin-left: 8px; }

/* Inputs */
input[type="range"] { accent-color: #3b82f6; }
.input { width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; }
.input:focus { outline: none; border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
.input--search { width: 100%; margin-bottom: 6px; }

/* Helpers UI */
.helpers { display: inline-flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.helper { position: relative; }
.popover {
  position: absolute;
  top: 110%;
  left: 0;
  z-index: 50;
  min-width: 320px;
  max-height: 320px;
  overflow: auto;
  padding: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.08);
}
.list { display: grid; gap: 4px; }
.item {
  text-align: left;
  border: 1px solid #eef0f3;
  background: #fafafa;
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  transition: background .12s, border-color .12s;
}
.item:hover { background: #f0f4ff; border-color: #dbe7ff; }
.item__title { font-weight: 600; }
.item__sub { font-size: 12px; color: #666; }
.empty { padding: 10px; color: #777; text-align: center; }

/* Canvas stack */
.canvas-wrap {
  position: relative;
  width: 100%;
  padding: 0;
  overflow: hidden;

  /* Tune these 4 variables to match the white owner box on your template image */
  --owner-left: 12.0;   /* % from the left edge of the image */
  --owner-top:  10.5;   /* % from the top edge of the image */
  --owner-width: 62.0;  /* % of image width */
  --owner-height: 10.0; /* % of image height */
}
.bg { display: block; width: 100%; height: auto; pointer-events: none; user-select: none; z-index: 1; }
.ink {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  background: transparent !important;
  pointer-events: auto; touch-action: none;
  z-index: 2;
}

/* Owner overlay: strictly contained in the white box */
.owner-box {
  position: absolute;
  z-index: 3;
  pointer-events: none;

  /* Position + size in % so it scales with the image */
  left: calc(var(--owner-left) * 1%);
  top: calc(var(--owner-top) * 1%);
  width: calc(var(--owner-width) * 1%);
  height: calc(var(--owner-height) * 1%);
  box-sizing: border-box;

  /* Keep text inside and readable */
  overflow: hidden;
  padding: 0.6% 1%;
  color: #0f172a;
  font-weight: 700;
  line-height: 1.25;
  font-size: clamp(18px, 1.25vw, 16px);
  word-break: break-word;
  white-space: normal;
  text-shadow: 0 1px 0 rgba(255,255,255,.85);
}

/* OCR card formatting */
.ocr pre {
  margin: 8px 0 0;
  background: #0b1020;
  color: #e5edf9;
  padding: 10px 12px;
  border-radius: 6px;
  overflow: auto;
  max-height: 360px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.45;
}

/* Print */
@media print {
  .no-print { display: none !important; }
  .card { border: none; box-shadow: none; }
  .toolbar, .helpers, .popover, .btn { display: none !important; }
  .owner-box { font-size: 12pt; text-shadow: none; }
}
</style>