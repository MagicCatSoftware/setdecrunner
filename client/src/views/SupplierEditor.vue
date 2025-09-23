<template>
    <div>
      <NavBar :me="me" />
  
      <div class="container">
        <div class="row">
          <RouterLink
                  class="link"
                  :to="{ name: 'suppliers', params: { slug } }"
                >
                  
                  Back To Suppliers
                </RouterLink>
          <span class="spacer"></span>
          <button class="btn btn--danger" v-if="!isNew" @click="destroy">Delete</button>
        </div>
  
        <h2>{{ isNew ? 'Create Supplier' : 'Edit Supplier' }}</h2>
  
        <div v-if="error" class="error">{{ error }}</div>
  
        <div class="field">
          <label class="label" for="sup-name">Name</label>
          <input id="sup-name" v-model="s.name" />
        </div>
  
        <div class="field">
          <label class="label">Select Location (Google Maps)</label>
          <PlaceSearch @select="applyPlace" />
          <p class="muted" v-if="s.location && (s.location.lat || s.location.lng)">
            Lat: {{ s.location.lat }} — Lng: {{ s.location.lng }}
          </p>
        </div>
  
        <div class="field">
          <label class="label" for="sup-address">Address</label>
          <input id="sup-address" v-model="s.address" />
        </div>
  
        <div class="field">
          <label class="label" for="sup-phone">Telephone</label>
          <input id="sup-phone" v-model="s.phone" />
        </div>
  
        <div class="field">
          <label class="label" for="sup-contact">Contact Name</label>
          <input id="sup-contact" v-model="s.contactName" />
        </div>
  
        <div class="field">
          <label class="label" for="sup-hours">Hours of Operation</label>
          <textarea id="sup-hours" v-model="s.hours" rows="3" placeholder="e.g. Mon–Fri 9–5, Sat 10–2, Sun closed"></textarea>
        </div>
  
        <button class="btn btn--primary" @click="save" :disabled="saving">
          {{ saving ? 'Saving…' : (isNew ? 'Create' : 'Save') }}
        </button>
        <span class="muted" v-if="savedAt">Saved {{ savedAt }}</span>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, computed } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import NavBar from '../components/NavBar.vue';
  import PlaceSearch from '../components/PlaceSearch.vue';
  import { useAuth } from '../auth.js';
  import api from '../api.js';
  
  const route = useRoute();
  const router = useRouter();
  const auth = useAuth();
  
  const me = ref(null);
  const s = ref({ name: '', address: '', phone: '', contactName: '', hours: '', location: { lat: null, lng: null } });
  const saving = ref(false);
  const savedAt = ref('');
  const error = ref('');
  
  const isNew = computed(() => route.name === 'supplier-new');
  
  const stamp = () => { savedAt.value = new Date().toLocaleTimeString(); };
  
  const load = async () => {
    if (isNew.value) return; // no load in "create" mode
    try {
      s.value = await api.get(`/tenant/suppliers/${route.params.id}`);
      s.value.location = s.value.location || { lat: null, lng: null };
    } catch (e) {
      error.value = e?.response?.data?.error || 'Failed to load supplier';
    }
  };
  
  const applyPlace = (place) => {
    if (!s.value.name || s.value.name === 'New Supplier') s.value.name = place.name || s.value.name;
    if (place.address) s.value.address = place.address;
    if (place.lat != null && place.lng != null) {
      s.value.location = { lat: place.lat, lng: place.lng };
    }
  };
  
  const save = async () => {
    try {
      saving.value = true; error.value = '';
  
      if (isNew.value) {
        // CREATE
        const created = await api.post('/tenant/suppliers', s.value);
        s.value = created;
        stamp();
        // move the URL to /suppliers/:id so future saves are PATCH
        router.replace({ name: 'supplier-edit', params: { id: created._id } });
      } else {
        // UPDATE
        s.value = await api.patch(`/suppliers/${s.value._id}`, s.value);
        stamp();
      }
    } catch (e) {
      error.value = e?.response?.data?.error || (isNew.value ? 'Failed to create' : 'Failed to save');
    } finally {
      saving.value = false;
    }
  };
  
  const destroy = async () => {
    if (!confirm('Delete this supplier?')) return;
    try {
      await api.del(`/tenant/suppliers/${s.value._id}`);
      router.push('/tenant/suppliers');
    } catch (e) {
      error.value = e?.response?.data?.error || 'Failed to delete';
    }
  };
  
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
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.spacer { margin-left: auto; }

/* ---------- Fields ---------- */
.field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}
.label {
  font-size: 12px;
  color: #6b7280;
}

/* ---------- Inputs ---------- */
:where(
  input[type="text"],
  input[type="search"],
  input[type="tel"],
  input[type="email"],
  input:not([type])
) {
  border: 1px solid #d6d6d6;
  background: #fff;
  color: #111;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  height: 34px;
  width: 320px;
}
textarea {
  border: 1px solid #d6d6d6;
  background: #fff;
  color: #111;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  width: 100%;
  resize: vertical;
}
@media (max-width: 720px) {
  :where(
    input[type="text"],
    input[type="search"],
    input[type="tel"],
    input[type="email"],
    input:not([type])
  ) { width: 100%; }
}

/* ---------- Buttons ---------- */
.btn,
button {
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
.btn:hover,
button:hover { background: #efefef; border-color: #cdcdcd; }
.btn:active,
button:active { transform: translateY(1px); }

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
</style>

  