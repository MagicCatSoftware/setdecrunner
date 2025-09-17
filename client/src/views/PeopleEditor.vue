<template>
    <div>
      <NavBar :me="me" @logout="logout" />
  
      <div class="container">
        <div class="row">
          <RouterLink class="btn" to="/people">Back to People</RouterLink>
          <span class="spacer"></span>
          <button class="btn btn--danger" v-if="!isNew && me?.role==='admin'" @click="destroy">Delete</button>
        </div>
  
        <h2>{{ isNew ? 'Create Person' : 'Edit Person' }}</h2>
  
        <div v-if="error" class="error">{{ error }}</div>
  
        <!-- Photo -->
        <div class="field">
          <div class="label">Photo</div>
          <div v-if="s.photo" class="person-photo-wrapper">
  <img :src="imageUrl(s.photo)" alt="Person photo" class="person-photo" />
  <button class="btn" :disabled="isNew" @click="removePhoto">Remove Photo</button>
</div>
          <div style="margin-top:8px;">
            <input type="file" accept="image/*" :disabled="isNew" @change="uploadPhoto" />
            <div class="muted" v-if="isNew">Save first to enable photo upload.</div>
          </div>
        </div>
  
        <div class="field">
          <label class="label" for="p-name">Name</label>
          <input id="p-name" v-model="s.name" />
        </div>
  
        <div class="field">
          <label class="label" for="p-email">Email</label>
          <input id="p-email" v-model="s.email" />
        </div>
  
        <div class="field">
          <label class="label" for="p-phone">Phone</label>
          <input id="p-phone" v-model="s.phone" />
        </div>
  
        <div class="field">
          <label class="label" for="p-role">Role/Title</label>
          <input id="p-role" v-model="s.role" placeholder="e.g. On-set contact" />
        </div>
  
        <div class="field">
          <label class="label" for="p-notes">Notes</label>
          <textarea id="p-notes" v-model="s.notes" rows="3" placeholder="Any extra info for this person"></textarea>
        </div>
  
        <!-- Link to App User (optional) -->
        <section class="panel">
          <h3 class="subtitle">Link to App User (optional)</h3>
          <div class="row row--tight">
            <input v-model="userQuery" placeholder="Search users…" />
            <button class="btn" @click="searchUsers">Search</button>
            <div class="muted" v-if="s.user">Linked: {{ linkedUserLabel }}</div>
          </div>
  
          <div class="pillbar">
            <button
              v-for="u in userResults"
              :key="u._id"
              class="pill"
              @click="linkUser(u)"
            >
              Link {{ u.name || u.email }}
            </button>
            <button v-if="s.user" class="pill" @click="clearUser">Unlink</button>
          </div>
        </section>
  
        <button class="btn btn--primary" @click="save" :disabled="saving">
          {{ saving ? 'Saving…' : (isNew ? 'Create' : 'Save') }}
        </button>
        <span class="muted" v-if="savedAt">Saved {{ savedAt }}</span>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, computed } from 'vue';
  import { useRoute, useRouter, RouterLink } from 'vue-router';
  import NavBar from '../components/NavBar.vue';
  import { useAuth } from '../auth.js';
  import api from '../api.js';
  
  const route = useRoute();
  const router = useRouter();
  const auth = useAuth();
  
  const me = ref(null);
  const s = ref({ name: '', email: '', phone: '', role: '', notes: '', user: null, photo: null });
  
  const saving = ref(false);
  const savedAt = ref('');
  const error = ref('');
  
  const isNew = computed(() => route.name === 'person-new');
  const logout = () => auth.logout();
  const stamp = () => { savedAt.value = new Date().toLocaleTimeString(); };
  
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
  
  
  const load = async () => {
    if (isNew.value) return;
    try {
      s.value = await api.get(`/tenant/people/${route.params.id}`);
    } catch (e) {
      error.value = e?.response?.data?.error || 'Failed to load person';
    }
  };
  
  const save = async () => {
    try {
      saving.value = true; error.value = '';
  
      const payload = {
        name: s.value.name,
        email: s.value.email,
        phone: s.value.phone,
        role: s.value.role,
        notes: s.value.notes,
        user: s.value.user?._id ?? s.value.user ?? null,
      };
  
      if (isNew.value) {
        const created = await api.post('/tenant/people', payload);
        s.value = created;
        stamp();
        router.replace({ name: 'person-edit', params: { id: created._id } });
      } else {
        s.value = await api.patch(`/tenant/people/${s.value._id}`, payload);
        stamp();
      }
    } catch (e) {
      error.value = e?.response?.data?.error || (isNew.value ? 'Failed to create' : 'Failed to save');
    } finally {
      saving.value = false;
    }
  };
  
  const destroy = async () => {
    if (!confirm('Delete this person?')) return;
    try {
      await api.del(`/tenant/people/${s.value._id}`);
      router.push('/people');
    } catch (e) {
      error.value = e?.response?.data?.error || 'Failed to delete';
    }
  };
  
  // ---- photo upload / remove ----
  const uploadPhoto = async (ev) => {
    if (!s.value?._id) return; // guard
    const file = ev.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const updated = await api.post(`/tenant/people/${s.value._id}/photo`, fd, {
        
      });
      s.value = updated;
      stamp();
    } catch (e) {
      error.value = e?.response?.data?.error || 'Failed to upload photo';
    } finally {
      ev.target.value = '';
    }
  };
  
  const removePhoto = async () => {
    if (!s.value?._id) return;
    try {
      const updated = await api.del(`/tenant/people/${s.value._id}/photo`);
      s.value = updated;
      stamp();
    } catch (e) {
      error.value = e?.response?.data?.error || 'Failed to remove photo';
    }
  };
  
  // ---- link to user ----
  const userQuery = ref('');
  const userResults = ref([]);
  const searchUsers = async () => {
    try {
      userResults.value = await api.get('/tenant/users', userQuery.value ? { q: userQuery.value } : undefined);
    } catch (e) {
      error.value = e?.response?.data?.error || 'Failed to search users';
    }
  };
  const linkUser = (u) => { s.value.user = u; };
  const clearUser = () => { s.value.user = null; };
  const linkedUserLabel = computed(() => {
    const u = s.value.user;
    if (!u) return '';
    if (typeof u === 'string') return `#${u}`;
    return u.name || u.email || u._id;
  });
  
  onMounted(async () => {
    me.value = await auth.fetchMe();
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

h2 {
  font-size: 20px;
  font-weight: 700;
  margin: 12px 0 16px;
  color: #111827;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.spacer { margin-left: auto; }

/* ---------- Panels ---------- */
.panel {
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,.04);
  padding: 14px 16px;
  margin: 16px 0;
  display: grid;
  gap: 12px;
}
.subtitle {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 6px;
}

/* ---------- Fields ---------- */
.field { display: grid; gap: 6px; margin: 12px 0; }
.label { font-size: 12px; color: #6b7280; }

/* Base inputs (works for plain <input>, <select>, and those with classes) */
input,
select,
textarea,
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
input,
.input { height: 34px; }
textarea,
.textarea { width: 100%; resize: vertical; }

/* ---------- Pretty file input ---------- */
input[type="file"] {
  padding: 6px 8px; /* surround the filename text */
}

input[type="file"]::file-selector-button {
  margin-right: 10px;
  border: 1px solid #111827;
  background: #111827;
  color: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, transform .02s ease;
}
input[type="file"]::file-selector-button:hover {
  background: #0b1220;
  border-color: #0b1220;
}
input[type="file"]::file-selector-button:active {
  transform: translateY(1px);
}

/* Safari/WebKit */
input[type="file"]::-webkit-file-upload-button {
  margin-right: 10px;
  border: 1px solid #111827;
  background: #111827;
  color: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, transform .02s ease;
}
input[type="file"]::-webkit-file-upload-button:hover {
  background: #0b1220;
  border-color: #0b1220;
}
input[type="file"]::-webkit-file-upload-button:active {
  transform: translateY(1px);
}

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

/* ---------- Pills (user link UI) ---------- */
.pillbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.pill {
  padding: 6px 10px;
  border: 1px solid #e6e6e6;
  border-radius: 999px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.pill:hover { background: #fafafa; }

/* ---------- Helpers ---------- */
.muted { color: #6b7280; font-size: 12px; }

.error {
  margin: 12px 0;
  color: #b42318;
  background: #fff1f0;
  border: 1px solid #ffd7d5;
  padding: 10px 12px;
  border-radius: 8px;
}

.person-photo {
  width: 64px;   /* smaller than 96px */
  height: 64px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #e5e7eb; /* subtle border to match your UI */
}

/* ---------- Responsive ---------- */
@media (max-width: 760px) {
  .row { gap: 8px; }
}
</style>

