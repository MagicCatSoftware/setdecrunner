<template>
  <div>
    <NavBar :me="me" />

    <div class="container">
      <!-- People Card -->
      <div class="card">
        <div class="toolbar">
          <h3 class="mini-title">People</h3>
          <span class="spacer"></span>
          <button class="btn btn--primary" @click="goNew">New Person</button>
        </div>

        <hr class="divider" />

        <div class="row row--tight">
          <input
            v-model="q"
            class="input input--grow"
            placeholder="Search by name, email, phone"
          />
          <button class="btn" @click="search">Search</button>
        </div>

        <div v-if="error" class="error">{{ error }}</div>

        <div v-else-if="!people.length" class="empty muted">No people found.</div>

        <div v-else class="list">
          <div v-for="p in people" :key="p._id" class="card">
            <div class="item">
              <div class="item__main">
                <div class="item__title">
                  <img
                    v-if="p.photo"
                    :src="imgaeUrl(p.photo)"
                    alt=""
                    class="thumb" width="96px" height="96px"
                  />
                  <RouterLink
                    class="name"
                    :to="{ name: 'person-edit', params: { slug, id: p._id } }"
                  >
                    {{ p.name }}
                  </RouterLink>
                </div>
                <div class="meta">
                  <span v-if="p.email">Email: {{ p.email }}</span>
                  <span v-if="p.email && p.phone"> · </span>
                  <span v-if="p.phone">Phone: {{ p.phone }}</span>
                </div>
              </div>

              <div class="item__actions">
                <RouterLink
                  class="btn"
                  :to="{ name: 'person-edit', params: { slug, id: p._id } }"
                >
                  Edit
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
      </div> <!-- /card -->
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import NavBar from '../components/NavBar.vue';
import api, { apiGet } from '../api.js';

const router = useRouter();
const route = useRoute();
const slug = computed(() => String(route.params.slug || ''));

const me = ref(null);
const q = ref('');
const people = ref([]);
const error = ref('');

function qs(obj = {}) {
  const s = new URLSearchParams(obj).toString();
  return s ? `?${s}` : '';
}

// Normalize image/url from API (absolute/data OR /uploads/*)
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
    path = '/uploads/' + path.replace(/^\/+/, '');
  }

  // encode just the filename, not the whole path
  const parts = path.split('/');
  const file = parts.pop();
  return (IMAGE_BASE + [...parts, encodeURIComponent(file)].join('/'));
}

async function load() {
  try {
    error.value = '';
    const url = `/tenant/people${q.value.trim() ? qs({ q: q.value.trim() }) : ''}`;
    const res = await api.get(url);
    people.value = Array.isArray(res) ? res : (res.items || []);
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to load people';
  }
}

const search = () => load();
const goNew = () => router.push({ name: 'person-new', params: { slug: slug.value } });

onMounted(async () => {
  try {
    me.value = await apiGet('/tenant/tenantauth/me');
  } catch {
    me.value = null;
  }
  await load();
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

/* ---------- Toolbar ---------- */
.toolbar {
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.mini-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.divider {
  height: 1px;
  background: #eee;
  margin: 0 0 12px;
  border: none;
}

.row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.row--tight { justify-content: flex-start; gap: 8px; }
.spacer { margin-left: auto; }

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

/* ---------- People list items ---------- */
.item {
  padding: 14px 16px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
}

.item__main { min-width: 0; }

.item__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.name {
  font-weight: 600;
  word-break: break-word;
  color: #111;
  text-decoration: none;
}
.name:hover { text-decoration: underline; }

.meta {
  color: #6b7280;
  font-size: 12px;
  margin-top: 2px;
}

.item__actions {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  justify-content: flex-end;
}

/* avatar/thumb (40x40 is set inline; keep shared look) */
.thumb {
  border: 1px solid #eee;
  background: #fafafa;
}

/* ---------- Empty & error ---------- */
.empty {
  padding: 14px;
  text-align: center;
}

.muted { color: #6b7280; font-size: 12px; }

.error {
  margin: 12px;
  color: #b42318;
  background: #fff1f0;
  border: 1px solid #ffd7d5;
  padding: 10px 12px;
  border-radius: 8px;
}

/* ---------- Responsive ---------- */
@media (max-width: 760px) {
  .item { grid-template-columns: 1fr; }
}
</style>
