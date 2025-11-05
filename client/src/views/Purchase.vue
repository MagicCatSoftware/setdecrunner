<!-- client/src/views/Purchase.vue -->
<template>
  <PublicNav />

  <section class="purchase container">
    <header class="head">
      <h1>Checkout</h1>
      <p class="muted">Complete your purchase securely.</p>
    </header>

    <div class="layout">
      <!-- Left: Order summary -->
      <aside class="card summary">
        <h2 class="summary__title">Order Summary</h2>

        <div class="summary__row">
          <span>Plan</span>
          <strong class="mono">Lifetime</strong>
        </div>

        <div class="summary__row">
          <span>Price</span>
          <strong class="mono">$ 99.99 <small>one-time</small></strong>
        </div>

        <hr />

        <div class="summary__group">
          <div class="summary__label">Production</div>
          <div class="summary__block">
            <div class="item"><span class="k">Name</span><span class="v mono">{{ form.productionName || '—' }}</span></div>
            <div class="item"><span class="k">Slug</span><span class="v mono">{{ form.productionSlug || '—' }}</span></div>
            <div class="item"><span class="k">Company</span><span class="v mono">{{ form.productionCompany || '—' }}</span></div>
            <div class="item"><span class="k">Phone</span><span class="v mono">{{ form.productionPhone || '—' }}</span></div>
            <div class="item"><span class="k">Address</span><span class="v mono">{{ form.productionAddress || '—' }}</span></div>
          </div>
        </div>

        <p class="fineprint">
          We never store card numbers. Payments are processed by Stripe.
        </p>
      </aside>

      <!-- Right: Billing/contact form -->
      <form class="card form" @submit.prevent="submit">
        <div class="row">
          <label>
            <span>Contact name</span>
            <input class="input" type="text" v-model.trim="form.name" required />
          </label>
          <label>
            <span>Email</span>
            <input class="input" type="email" v-model.trim="form.email" required />
          </label>
        </div>

        <div class="row">
          <label class="grow">
            <span>Billing address</span>
            <input class="input" type="text" v-model.trim="form.address" required />
          </label>
        </div>

        <!-- Editable production details (prefilled from Pricing page query) -->
        <div class="group">
          <div class="group__title">Production details</div>

          <div class="row">
            <label>
              <span>Production name</span>
              <input class="input" type="text" v-model.trim="form.productionName" required />
            </label>
            <label>
              <span>Production slug</span>
              <input class="input" type="text" v-model.trim="form.productionSlug" required />
            </label>
          </div>

          <div class="row">
            <label>
              <span>Production company</span>
              <input class="input" type="text" v-model.trim="form.productionCompany" required />
            </label>
            <label>
              <span>Production phone</span>
              <input class="input" type="tel" v-model.trim="form.productionPhone" required />
            </label>
          </div>

          <div class="row">
            <label class="grow">
              <span>Production address</span>
              <input class="input" type="text" v-model.trim="form.productionAddress" required />
            </label>
          </div>
        </div>

        <div class="actions">
          <button class="btn btn--primary" type="submit" :disabled="loading">
            {{ loading ? 'Processing…' : 'Proceed to Checkout' }}
          </button>
          <RouterLink class="btn btn--ghost" to="/pricing">Back</RouterLink>
        </div>

        <p class="fineprint">
          On submit we create a secure checkout session on the server and redirect you to Stripe.
        </p>
      </form>
    </div>
  </section>

  <PublicFooter />
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import PublicNav from '../components/PublicNav.vue';
import PublicFooter from '../components/PublicFooter.vue';
import api from '../api.js';

const route = useRoute();
const loading = ref(false);

// Lock to single option
const PLAN = 'lifetime';
const PRICE_DISPLAY = '99.99'; // shown to user
// If your server expects cents, convert there; keep this as display on client.

const form = reactive({
  // locked pricing
  plan: PLAN,
  price: PRICE_DISPLAY,

  // billing contact
  name: '',
  email: '',
  address: '',

  // production details (prefilled from pricing query)
  productionName: '',
  productionSlug: '',
  productionAddress: '',
  productionPhone: '',
  productionCompany: '',
});

onMounted(() => {
  const q = route.query || {};
  form.productionName     = String(q.productionname || '');
  form.productionSlug     = String(q.productionslug || '');
  form.productionAddress  = String(q.productionaddress || '');
  form.productionPhone    = String(q.productionphone || '');
  form.productionCompany  = String(q.productioncompany || '');
});

async function submit() {
  try {
    loading.value = true;

    // Minimal client-side validation
    for (const key of [
      'name', 'email', 'address',
      'productionName', 'productionSlug', 'productionAddress',
      'productionPhone', 'productionCompany'
    ]) {
      if (!String(form[key]).trim()) {
        alert('Please complete all fields.');
        loading.value = false;
        return;
      }
    }

    // Payload is locked to the single plan/price
    const payload = {
      plan: PLAN,
      price: PRICE_DISPLAY,
      contact: {
        name: form.name,
        email: form.email,
        address: form.address,
      },
      production: {
        title:   form.productionName,
        slug:    form.productionSlug,
        address: form.productionAddress,
        phone:   form.productionPhone,
        company: form.productionCompany,
      },
      productionSlug: form.productionSlug,
    };

    // Call backend to create a checkout session (adjust path if needed)
    // Example endpoint; keep using whatever your server exposes:
    //   POST /checkout/session  ->  { url: "https://checkout.stripe.com/..." }
    const { url } = await api.post('/checkout/session', payload);
    window.location.href = url;
  } catch (err) {
    console.error(err);
    alert('Failed to start checkout. Please try again.');
  } finally {
    loading.value = false;
  }
}
</script>


<style scoped>
/* -------- Monochrome palette -------- */
:root {
  --ink: #111;
  --ink-2: #2a2a2a;
  --ink-3: #5a5a5a;
  --line: #e6e6e6;
  --panel: #ffffff;
  --bg: #f6f6f6;
}

/* -------- Container (matches site, B/W background) -------- */
.container {
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 20px;
  position: relative;
  isolation: isolate;
}
.container::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: url("/bg-container-bw.jpg") center/cover no-repeat;
  filter: grayscale(100%) contrast(1.05) brightness(0.98);
  opacity: 0.18;
}
.container::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image: radial-gradient(#0002 1px, transparent 1px);
  background-size: 3px 3px;
  mix-blend-mode: multiply;
  opacity: 0.12;
}

/* -------- Section layout -------- */
.purchase { padding: 36px 0 64px; }
.head { text-align: center; margin-bottom: 18px; }
.head h1 { margin: 0 0 6px; }
.muted { color: var(--ink-3); }

.layout { display: grid; grid-template-columns: 0.95fr 1.05fr; gap: 16px; }

/* -------- Cards & inputs -------- */
.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 8px 24px rgba(0,0,0,.08);
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.row .grow { grid-column: 1 / -1; }
label { display: grid; gap: 6px; font-weight: 700; color: var(--ink-2); }
.input, .select {
  border: 1px solid var(--line); border-radius: 10px;
  padding: 10px 12px; background: #fff; color: var(--ink);
}
.input:focus, .select:focus { border-color: #111; outline: none; box-shadow: 0 0 0 3px rgba(0,0,0,.08); }

/* -------- Summary -------- */
.summary__title { margin: 0 0 10px; font-size: 18px; }
.summary__row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px dashed var(--line);
}
.summary__row:last-of-type { border-bottom: none; margin-bottom: 6px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }

.summary__group { margin-top: 10px; }
.summary__label { font-weight: 800; margin-bottom: 6px; }
.summary__block { display: grid; gap: 6px; }
.summary .item { display: grid; grid-template-columns: 140px 1fr; gap: 8px; }
.summary .k { color: var(--ink-3); }
.summary .v { color: var(--ink-2); }

.fineprint { margin-top: 10px; color: var(--ink-3); font-size: 12px; }

/* -------- Actions -------- */
.actions {
  display: flex; gap: 12px; justify-content: flex-end; align-items: center; margin-top: 8px;
}
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 10px; padding: 12px 18px; border-radius: 12px;
  background: #111; color: #fff; border: 1px solid #000;
  font-weight: 700; text-decoration: none; letter-spacing: .2px;
  box-shadow: 0 2px 0 #000;
  transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
}
.btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.18); }
.btn--ghost { background: transparent; color: #111; border: 1px solid #222; }
.btn--ghost:hover { background: #111; color: #fff; }

/* -------- Responsive -------- */
@media (max-width: 1100px) {
  .layout { grid-template-columns: 1fr; }
  .summary { order: 2; }
  .form { order: 1; }
}
@media (max-width: 720px) {
  .container { padding: 24px 16px; }
  .row { grid-template-columns: 1fr; }
}
</style>
