<template>
  <div>
    <NavBar :me="me" />

    <div class="container">
      <div v-if="loading" class="muted">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <template v-else>
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

        <!-- Canvas Stack -->
        <div class="card canvas-wrap" ref="wrap">
          <img
            ref="bgEl"
            class="bg"
            :src="bgSrc"
            alt="Runsheet"
            @load="fitCanvas"
            @error="bgFallbackErrored = true"
          />
          <canvas ref="inkEl" class="ink" />
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

            <button class="btn" :disabled="saving" @click="saveStrokes">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>

            <button class="btn btn--primary" @click="saveAndSend" :disabled="ai.loading">
              {{ ai.loading ? 'Uploading…' : 'Save & Send to AI' }}
            </button>
          </div>
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

        <!-- Save status -->
        <div class="muted small" v-if="lastSavedAt">
          Last saved {{ new Date(lastSavedAt).toLocaleString() }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import NavBar from '../components/NavBar.vue';
import api, { apiGet } from '../api.js';

// ---- route params ----
const route = useRoute();
const id = String(route.params.id || '');
const slug = String(route.params.slug || '');

// ---- background source (prefer template endpoint) ----
const bgFallbackErrored = ref(false);
const templateUrl = `/api/runsheets/${encodeURIComponent(id)}/template-image`;
const fallbackUrl  = `/runsheet.jpg`;
const bgSrc = computed(() => (bgFallbackErrored.value ? fallbackUrl : templateUrl));

// ---- refs & state ----
const me = ref(null);
const rs = ref(null);
const error = ref('');
const loading = ref(true);

const wrap  = ref(null);
const inkEl = ref(null);
const bgEl  = ref(null);
const ctx   = ref(null);

const mode = ref('pen'); // 'pen' | 'eraser'
const pen  = reactive({ size: 4, color: '#0a0a0a' });

const drawing = ref(false);
const last = reactive({ x: 0, y: 0 });
const saving = ref(false);
let saveTimer = null;

// ---- normalized strokes + base logical size ----
const baseWidth = ref(0);
const baseHeight = ref(0);
const strokes = ref([]); // [{ tool, color, size, points:[{x,y}]}]
const canUndo = computed(() => strokes.value.length > 0);
const lastSavedAt = ref(null);

// ---- latest OCR preview (if any) ----
const ai = reactive({ loading: false });
const ocrText = computed(() => rs.value?.ocr?.latest?.text || '');
const hasFields = computed(() => {
  const f = rs.value?.ocr?.latest?.fields;
  return !!f && Object.keys(f).length > 0;
});
const formattedFields = computed(() => JSON.stringify(rs.value?.ocr?.latest?.fields || {}, null, 2));

// ---------------- Canvas sizing & render ----------------
function fitCanvas() {
  const c = inkEl.value;
  const img = bgEl.value;
  if (!c || !img || !img.naturalWidth) return;

  // Logical pixels (match the background natural size)
  c.width  = img.naturalWidth;
  c.height = img.naturalHeight;

  // CSS sizing: fill the wrapper exactly; no aspect math here
  c.style.width = '100%';
  c.style.height = '100%';

  ctx.value = c.getContext('2d');
  ctx.value.lineJoin = 'round';
  ctx.value.lineCap  = 'round';

  if (!baseWidth.value || !baseHeight.value) {
    baseWidth.value = c.width;
    baseHeight.value = c.height;
  }

  renderAll();
}

function renderAll() {
  if (!ctx.value || !inkEl.value) return;
  const c = inkEl.value;
  ctx.value.clearRect(0, 0, c.width, c.height);
  renderStrokesTo(ctx.value, c.width, c.height);
}

function renderStrokesTo(targetCtx, w, h) {
  if (!strokes.value.length) return;
  const bw = baseWidth.value || w;
  const bh = baseHeight.value || h;
  const sx = w / bw;
  const sy = h / bh;
  const sScale = (sx + sy) / 2; // thickness scale

  targetCtx.save();
  targetCtx.lineJoin = 'round';
  targetCtx.lineCap  = 'round';

  for (const s of strokes.value) {
    if (!s?.points?.length) continue;

    const isEraser = s.tool === 'eraser';
    targetCtx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    targetCtx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : (s.color || '#000');
    targetCtx.lineWidth = Math.max(1, (s.size || 4) * sScale);

    targetCtx.beginPath();
    const first = s.points[0];
    targetCtx.moveTo(first.x * w, first.y * h);
    for (let i = 1; i < s.points.length; i++) {
      const p = s.points[i];
      targetCtx.lineTo(p.x * w, p.y * h);
    }
    targetCtx.stroke();
  }

  targetCtx.globalCompositeOperation = 'source-over';
  targetCtx.restore();
}

// ---------------- Pointer helpers ----------------
function toCanvasXY(e) {
  const rect = inkEl.value.getBoundingClientRect();
  const scaleX = inkEl.value.width  / rect.width;
  const scaleY = inkEl.value.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY,
  };
}

function toNorm(p) {
  const c = inkEl.value;
  if (!c || !c.width || !c.height) return { x: 0, y: 0 };
  return { x: p.x / c.width, y: p.y / c.height };
}

function setMode(m) { mode.value = m; }

let currentStroke = null;

function start(e) {
  if (!ctx.value || !inkEl.value) return;
  drawing.value = true;
  const p = toCanvasXY(e);
  last.x = p.x; last.y = p.y;

  currentStroke = {
    tool: mode.value,
    color: pen.color,
    size: pen.size,
    points: [ toNorm(p) ],
  };
  strokes.value.push(currentStroke);

  e.preventDefault();
}

function move(e) {
  if (!drawing.value || !ctx.value || !currentStroke) return;
  const p = toCanvasXY(e);
  const pressure = e.pressure && e.pressure > 0 ? e.pressure : 1;

  const isEraser = mode.value === 'eraser';
  ctx.value.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
  ctx.value.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : pen.color;
  ctx.value.lineWidth = pen.size * pressure;

  ctx.value.beginPath();
  ctx.value.moveTo(last.x, last.y);
  ctx.value.lineTo(p.x, p.y);
  ctx.value.stroke();
  ctx.value.globalCompositeOperation = 'source-over';

  currentStroke.points.push(toNorm(p));

  last.x = p.x; last.y = p.y;
  e.preventDefault();
}

function end() {
  drawing.value = false;
  currentStroke = null;
  scheduleSave(600);
}

// ---- undo/clear ----
function undo() {
  if (!canUndo.value) return;
  strokes.value.pop();
  renderAll();
  scheduleSave(400);
}

function clearCanvasConfirm() {
  if (!confirm('Clear all handwriting?')) return;
  strokes.value = [];
  renderAll();
  scheduleSave(0);
}

// ---------------- Persistence ----------------
async function saveStrokes() {
  if (!inkEl.value || !bgEl.value) return;
  saving.value = true;
  try {
    const payload = {
      baseWidth: baseWidth.value || bgEl.value.naturalWidth || inkEl.value.width,
      baseHeight: baseHeight.value || bgEl.value.naturalHeight || inkEl.value.height,
      strokes: strokes.value,
    };
    const saved = await api.put(`/tenant/runsheetsbyhand/${id}/hand`, payload);
    lastSavedAt.value = saved?.hand?.lastSavedAt || new Date().toISOString();
  } catch (e) {
    alert(e?.body?.error || e?.message || 'Failed to save handwriting');
  } finally {
    saving.value = false;
  }
}

function scheduleSave(delay = 500) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveStrokes();
  }, delay);
}

// ---------------- Export & send to AI ----------------
async function saveAndSend() {
  ai.loading = true;
  try {
    await saveStrokes();

    // Hi-DPI export (2x)
    const img = bgEl.value;
    const scale = 2;
    const off = document.createElement('canvas');
    off.width  = img.naturalWidth  * scale;
    off.height = img.naturalHeight * scale;
    const octx = off.getContext('2d');

    // draw background
    octx.drawImage(img, 0, 0, off.width, off.height);
    // replay strokes at export scale using normalized points
    renderStrokesTo(octx, off.width, off.height);

    const blob = await new Promise((res) => off.toBlob(res, 'image/png', 0.95));

    const fd = new FormData();
    fd.append('file', blob, `runsheet-${id}.png`);
    fd.append('runsheetId', id || '');
    fd.append('slug', slug || '');

    await api.post('/tenant/ocr/runsheet', fd, { multipart: true });

    // Refresh rs (to show OCR queued)
    rs.value = await apiGet(`/tenant/runsheetsbyhand/${id}/hand`);
  } catch (e) {
    alert(typeof e === 'string' ? e : (e?.message || 'Upload failed'));
  } finally {
    ai.loading = false;
  }
}

// ---------------- data loading ----------------
function shortDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
}

async function loadRunsheet() {
  loading.value = true;
  error.value = '';
  try {
    rs.value = await apiGet(`/tenant/runsheets/${id}`);
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to load runsheet';
  } finally {
    loading.value = false;
  }
}

async function loadHand() {
  try {
    const res = await apiGet(`/tenant/runsheetsbyhand/${id}/hand`);
    const hand = res?.hand || {};
    baseWidth.value = hand.baseWidth || 0;
    baseHeight.value = hand.baseHeight || 0;
    strokes.value = Array.isArray(hand.strokes) ? hand.strokes : [];
    lastSavedAt.value = hand.lastSavedAt || null;
    renderAll();
  } catch {
    // not fatal
  }
}

// ---- lifecycle ----
onMounted(async () => {
  try { me.value = await apiGet('/auth/me'); } catch { me.value = null; }
  await loadRunsheet();

  const el = inkEl.value;
  el.addEventListener('pointerdown', start, { passive: false });
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', end, { passive: true });
  window.addEventListener('pointercancel', end, { passive: true });

  await loadHand();
});

onBeforeUnmount(() => {
  const el = inkEl.value;
  if (el) el.removeEventListener('pointerdown', start);
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', end);
  window.removeEventListener('pointercancel', end);
});
</script>

<style scoped>
.container { max-width: 980px; margin: 0 auto; padding: 16px; }
.card { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.tool { display: inline-flex; align-items: center; gap: 8px; }
.btn { padding: 6px 10px; border: 1px solid #ddd; border-radius: 6px; background: #fafafa; cursor: pointer; }
.btn--primary { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.btn--active { box-shadow: inset 0 0 0 2px #3b82f6; }
.badge { background: #eef2ff; color: #3730a3; border-radius: 9999px; padding: 2px 8px; font-size: 12px; margin-left: 8px; }
.muted { color: #666; }
.small { font-size: 12px; }
.title-row { display: flex; align-items: center; gap: 10px; }

/* ✅ Critical fixes for alignment */
.canvas-wrap { position: relative; width: 100%; padding: 0; }         /* override .card padding */
.canvas-wrap.card { padding: 0; }                                     /* ensure zero padding */
.bg { width: 100%; height: auto; display: block; pointer-events: none; user-select: none; }
.ink { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
</style>

