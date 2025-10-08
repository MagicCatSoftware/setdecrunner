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
            <RouterLink class="btn" :to="{ name: 'runsheet-by-hand', params: { slug, id } }">Open Canvas</RouterLink>
            <RouterLink class="btn" :to="{ name: 'runsheet-edit', params: { slug, id } }">Edit</RouterLink>
            <RouterLink class="btn" :to="{ name: 'runsheet-beta', params: { slug, id } }">View Beta</RouterLink>
          </div>
        </div>

        <div v-if="imageUrl" class="card image-viewer">
          <div class="image-toolbar">
            <a class="btn" :href="imageUrl" target="_blank" rel="noopener">Open Original</a>
            <a class="btn" :href="imageUrl" :download="downloadName">Download</a>
          </div>
          <div class="image-frame">
            <img :src="imageUrl" alt="Runsheet (By Hand)" @error="onImgError" />
          </div>

          <details v-if="ocrText || hasFields" class="ocr-details">
            <summary>Show OCR Text</summary>
            <pre class="mono">{{ ocrText }}</pre>
            <div v-if="hasFields">
              <h4>Parsed Fields</h4>
              <pre class="mono">{{ formattedFields }}</pre>
            </div>
          </details>
        </div>

        <div v-else class="card empty">
          <p>No handwritten image has been uploaded yet.</p>
          <RouterLink class="btn" :to="{ name: 'runsheet-by-hand', params: { slug, id } }">Open Canvas</RouterLink>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import NavBar from '../components/NavBar.vue';
import { apiGet } from '../api.js';

const route = useRoute();
const id = String(route.params.id || '');
const slug = String(route.params.slug || '');

const me = ref(null);
const rs = ref(null);
const error = ref('');
const loading = ref(true);

/**
 * Always serve uploads from /api/uploads on the same origin.
 * - If the value is absolute (http/https) and points at /uploads, rewrite to /api/uploads.
 * - If it's already /api/uploads, leave it.
 * - If it's relative and starts with /uploads, prefix /api.
 * - Data URIs pass through.
 */
function normalizeImg(src) {
  if (!src) return '';
  let s = String(src).trim();
  const origin = window.location.origin;
  const apiPrefix = `${origin}/api`;

  if (s.startsWith('data:')) {
    return s;
  }

  if (/^https?:\/\//i.test(s) || s.startsWith('//')) {
    if (s.startsWith('//')) s = `https:${s}`;
    if (location.protocol === 'https:' && s.startsWith('http:')) {
      s = s.replace(/^http:/i, 'https:');
    }
    try {
      const u = new URL(s);
      const path = u.pathname || '';
      const tail = `${path}${u.search || ''}${u.hash || ''}`;
      if (path.startsWith('/api/uploads/')) {
        return `${u.origin}${tail}`;
      }
      if (path.startsWith('/uploads/')) {
        return `${u.origin}/api${tail}`;
      }
      return `${u.origin}${tail}`;
    } catch {
      // fall through to relative handling
    }
  }

  s = s.replace(/\\/g, '/');
  if (!s.startsWith('/')) s = `/${s}`;

  if (s.startsWith('/api/uploads/')) {
    return `${origin}${s}`;
  }
  if (s.startsWith('/uploads/')) {
    return `${apiPrefix}${s}`;
  }
  if (s.startsWith('/api/')) {
    return `${origin}${s}`;
  }
  return `${apiPrefix}${s}`;
}

const imageUrl = computed(() => {
  const img = rs.value?.ocr?.latest?.image || '';
  return img ? normalizeImg(img) : '';
});

const ocrText = computed(() => rs.value?.ocr?.latest?.text || '');
const hasFields = computed(() => {
  const f = rs.value?.ocr?.latest?.fields || null;
  return !!f && Object.keys(f).length > 0;
});
const formattedFields = computed(() => JSON.stringify(rs.value?.ocr?.latest?.fields || {}, null, 2));
const downloadName = computed(() => {
  const p = (rs.value?.ocr?.latest?.image || '').split('/').pop() || `runsheet-${id}.png`;
  return p;
});

function onImgError(e) {
  const img = e?.target;
  if (!img) return;
  img.onerror = null;
  img.alt = 'Image unavailable';
}

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

onMounted(async () => {
  try { me.value = await apiGet('/auth/tenantauth/me'); } catch { me.value = null; }
  await loadRunsheet();
});
</script>

<style scoped>
.container { display: grid; gap: 16px; }
.card {
  background: #fff; border: 1px solid #ececec; border-radius: 12px;
  padding: 12px; box-shadow: 0 2px 10px rgba(0,0,0,.04);
}

.header .title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.title { margin: 0; font-size: 20px; }
.meta { color: #555; font-size: 12px; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.actions { margin-top: 10px; display: flex; gap: 8px; }

.badge { background: #f1f1f1; border: 1px solid #e5e5e5; padding: 2px 8px; border-radius: 999px; font-size: 12px; }

.image-viewer { display: grid; gap: 10px; }
.image-toolbar { display: flex; gap: 8px; }
.image-frame { width: 100%; max-width: 1100px; margin: 0 auto; }
.image-frame img { width: 100%; height: auto; display: block; border-radius: 8px; border: 1px solid #eee; }

.btn { padding: 8px 12px; border: 1px solid #ddd; border-radius: 10px; background: #fff; }
.error { color: #b00020; }
.muted { color: #666; }
.mono { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }

.empty { text-align: center; }
</style>
