<template>
    <div>
      <NavBar :me="me"/>
  
      <div class="container">
        <div class="row">
          <RouterLink class="nav__link" :to="{ name: 'sets', params: { slug } }" draggable="false">Back To Sets</RouterLink>
          <span class="spacer"></span>
          <button class="btn btn--danger" @click="destroy">Delete</button>
        </div>
  
        <h2>Edit Set</h2>
  
        <div v-if="error" class="error">{{ error }}</div>
  
        <div class="field">
          <label class="label" for="set-number">Number</label>
          <input id="set-number" v-model="s.number" />
        </div>
  
        <div class="field">
          <label class="label" for="set-name">Name</label>
          <input id="set-name" v-model="s.name" />
        </div>
  
        <div class="field">
          <label class="label" for="set-desc">Description</label>
          <textarea id="set-desc" v-model="s.description" rows="4"></textarea>
        </div>
  
        <button class="btn btn--primary" @click="save" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <span class="muted" v-if="savedAt">Saved {{ savedAt }}</span>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import NavBar from '../components/NavBar.vue';
  import { useAuth } from '../auth.js';
  import api from '../api.js';
  
  const route = useRoute();
  const router = useRouter();
  const auth = useAuth();
  
  const me = ref(null);
  const s = ref({ name: '', number: '', description: '' });
  const saving = ref(false);
  const savedAt = ref('');
  const error = ref('');
  

  const stamp = () => { savedAt.value = new Date().toLocaleTimeString(); };
  
  const load = async () => {
    try {
      s.value = await api.get(`/tenant/sets/${route.params.id}`);
    } catch (e) {
      error.value = e?.response?.data?.error || 'Failed to load set';
    }
  };
  
  const save = async () => {
    try {
      saving.value = true; error.value = '';
      s.value = await api.patch(`/tenant/sets/${s.value._id}`, s.value);
      stamp();
    } catch (e) {
      error.value = e?.response?.data?.error || 'Failed to save';
    } finally {
      saving.value = false;
    }
  };
  
  const destroy = async () => {
    if (!confirm('Delete this set?')) return;
    try {
      await api.del(`/tenant/sets/${s.value._id}`);
      router.push('/sets');
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
/* Layout */
.container {
  max-width: 880px;
  margin: 24px auto;
  padding: 0 16px;
}

h2 {
  margin: 8px 0 18px;
  font-size: 1.6rem;
  font-weight: 700;
}

/* Top row (back + delete) */
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.spacer {
  flex: 1 1 auto;
}

/* Form fields */
.field {
  display: grid;
  gap: 8px;
  margin: 12px 0 16px;
}

.label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
}

input,
textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d6d6db;
  border-radius: 10px;
  background: #fff;
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
  font: inherit;
}

input:focus,
textarea:focus {
  border-color: #6b7cff;
  box-shadow: 0 0 0 3px rgba(107, 124, 255, 0.15);
}

textarea {
  resize: vertical;
  min-height: 96px;
}

/* Buttons */
.btn {
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: #f0f1f5;
  color: #1f2330;
  cursor: pointer;
  font-weight: 600;
  transition: background .15s ease, transform .02s ease, box-shadow .15s ease;
}

.btn:hover {
  background: #e6e8f0;
}

.btn:active {
  transform: translateY(1px);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--primary {
  background: #5868ff;
  color: #fff;
}

.btn--primary:hover {
  background: #4454ff;
}

.btn--danger {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.btn--danger:hover {
  background: #fecaca;
}

/* Messages */
.muted {
  margin-left: 10px;
  color: #6b7280;
}

.error {
  margin: 8px 0 16px;
  padding: 10px 12px;
  background: #fff1f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-left: 4px solid #ef4444;
  border-radius: 8px;
}

/* Small screens */
@media (max-width: 540px) {
  .row {
    gap: 8px;
  }
  .btn {
    padding: 10px 12px;
  }
}
</style>

  