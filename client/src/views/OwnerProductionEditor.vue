<template>
  <div class="container">
    <OwnerNav />
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <form v-else class="form" @submit.prevent="save">
      <h1>Edit production</h1>

      <label class="label">
        <span>Title</span>
        <input v-model.trim="form.title" required />
      </label>

      <label class="label">
        <span>Slug</span>
        <input v-model.trim="form.slug" required />
        <small class="muted">Public URL: {{ origin }}/{{ form.slug }}</small>
      </label>

      <div class="cols">
        <label class="label">
          <span>Company</span>
          <input v-model.trim="form.productioncompany" />
        </label>
        <label class="label">
          <span>Phone</span>
          <input v-model.trim="form.productionphone" />
        </label>
      </div>

      <label class="label">
        <span>Address</span>
        <textarea v-model="form.productionaddress" rows="3"></textarea>
      </label>

      <div class="row">
        <button class="btn" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
        <RouterLink class="btn" :to="`/${form.slug}`">Open Tenant</RouterLink>
        <RouterLink class="btn" to="/owner">Back</RouterLink>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, RouterLink, useRouter } from 'vue-router';
import api from '../api.js';
import OwnerNav from '../components/OwnerNav.vue';

const route = useRoute(); const router = useRouter();
const id = String(route.params.id || '');
const origin = computed(() => location.origin);

const loading = ref(true); const saving = ref(false); const error = ref('');
const form = ref({
  title:'', slug:'',
  productioncompany:'', productionphone:'', productionaddress:''
});

async function load() {
  loading.value = true; error.value = '';
  try {
    const p = await api.get(`/owner/productions/${id}`);
    form.value = {
      title: p.title || '',
      slug: p.slug || '',
      productioncompany: p.productioncompany || p.company || '',
      productionphone: p.productionphone || p.phone || '',
      productionaddress: p.productionaddress || p.address || '',
    };
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Failed to load';
  } finally { loading.value = false; }
}

async function save() {
  saving.value = true; error.value = '';
  try {
    const updated = await api.patch(`/owner/productions/${id}`, { ...form.value });
    // redirect if slug changed so Open Tenant link works
    form.value.slug = updated.slug || form.value.slug;
    alert('Saved!');
  } catch (e) {
    error.value = e?.body?.error || e?.message || 'Save failed';
  } finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.container { max-width: 720px; margin: 40px auto; padding: 0 16px; }
.form { display: grid; gap: 14px; background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:16px; }
.label { display: grid; gap: 6px; }
input, textarea { padding: 10px 12px; border:1px solid #ddd; border-radius:8px; }
.cols { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.row { display:flex; gap: 10px; align-items:center; }
.btn { padding: 10px 14px; border:1px solid #ddd; border-radius:8px; background:#fafafa; cursor:pointer; }
.muted { color:#666; }
.error { color:#b91c1c; }
</style>
