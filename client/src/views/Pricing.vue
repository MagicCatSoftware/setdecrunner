<template>
  <PublicNav />

  <section class="pricing container">
    <header class="pricing__head">
      <h1>Simple one-time pricing</h1>
      <p class="muted">Pay once. Use Set Dec Runner forever.</p>
    </header>

    <!-- Production details -->
    <form class="prodcard" @submit.prevent="go">
      <div class="row">
        <label>
          <span>Production Name</span>
          <input
            class="input"
            v-model.trim="prod.productionName"
            type="text"
            @input="ensureSlug"
            required
            autocomplete="organization"
          />
        </label>
        <label>
          <span>Production Slug</span>
          <input
            class="input"
            v-model.trim="prod.productionSlug"
            type="text"
            placeholder="lowercase-and-dashes"
            @input="prod.productionSlug = slugify(prod.productionSlug)"
            required
            autocapitalize="none"
            autocomplete="off"
          />
        </label>
      </div>

      <div class="row">
        <label class="grow">
          <span>Production Address</span>
          <input
            class="input"
            v-model.trim="prod.productionAddress"
            type="text"
            required
            autocomplete="street-address"
          />
        </label>
      </div>

      <div class="row">
        <label>
          <span>Production Phone</span>
          <input
            class="input"
            v-model.trim="prod.productionPhone"
            type="tel"
            required
            autocomplete="tel"
          />
        </label>
        <label>
          <span>Production Company</span>
          <input
            class="input"
            v-model.trim="prod.productionCompany"
            type="text"
            required
            autocomplete="organization"
          />
        </label>
      </div>

      <p class="hint muted">
        These details will be pre-filled on the checkout page. You can still edit them there.
      </p>
    </form>

    <!-- One-Time Plan -->
    <div class="pricing__grid single">
      <article class="price price--focus selected" aria-label="Lifetime plan">
        <div class="badge">Lifetime Access</div>
        <h3>Set Dec Runner Pro</h3>
        <div class="num">$99.99<span> one-time</span></div>
        <ul>
          <li>Unlimited Coordinators</li>
          <li>Unlimited Drivers</li>
          <li>Unlimited Items & Uploads</li>
          <li>Lifetime Updates</li>
          <li>Priority Support</li>
        </ul>
        <button
          class="btn btn--primary"
          type="submit"
          :disabled="!isValid"
          @click.prevent="go"
        >
          Buy Now
        </button>
      </article>
    </div>

    <p class="fineprint">
      Price in USD. One-time payment. Lifetime license. Taxes may apply.
    </p>
  </section>

  <PublicFooter />
</template>

<script setup>
import { reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import PublicNav from '../components/PublicNav.vue';
import PublicFooter from '../components/PublicFooter.vue';

const router = useRouter();

// hard-coded product config
const PLAN = 'lifetime';
const PRICE_DISPLAY = '99.99'; // shown to user
// (If you use cents on the server, convert there; this stays as display.)

const prod = reactive({
  productionName: '',
  productionSlug: '',
  productionAddress: '',
  productionPhone: '',
  productionCompany: '',
});

function slugify(s = '') {
  return s
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

function ensureSlug() {
  if (!prod.productionSlug && prod.productionName) {
    prod.productionSlug = slugify(prod.productionName);
  }
}

const isValid = computed(() =>
  !!prod.productionName &&
  !!prod.productionSlug &&
  !!prod.productionAddress &&
  !!prod.productionPhone &&
  !!prod.productionCompany
);

function go() {
  if (!isValid.value) {
    alert('Please fill in all production fields first.');
    return;
  }

  router.push({
    path: '/purchase',
    query: {
      // lock to the single option
      plan: PLAN,
      price: PRICE_DISPLAY,

      // pass-through production metadata
      productionname: prod.productionName,
      productionslug: prod.productionSlug,
      productionaddress: prod.productionAddress,
      productionphone: prod.productionPhone,
      productioncompany: prod.productionCompany,
    },
  });
}
</script>

<style scoped>
.pricing__grid.single {
  display: flex;
  justify-content: center;
}
.price--focus {
  border-color: gold;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
}
.btn[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>



<style scoped>
/* ---------------- Monochrome palette ---------------- */
:global(:root) {
  --ink: #111;
  --ink-2: #2a2a2a;
  --ink-3: #5a5a5a;
  --line: #e6e6e6;
  --panel: #ffffff;
  --bg: #f6f6f6;
}

/* ---------------- Page container -------------------- */
.container {
  max-width: 1180px;
  margin: 0 auto;
  padding: 10px;
  position: relative;
  isolation: isolate;
}
.container::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: url("../../public/HomeBackground.jpg") center/cover no-repeat;
  filter: grayscale(100%) contrast(1.05) brightness(0.98);
  opacity: 0.18;
  padding:10px;
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
  padding:10px;
}
.muted { color: var(--ink-3); }

/* ---------------- Buttons (B/W only) ---------------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 10px; padding: 12px 18px; border-radius: 12px;
  background: #111; color: #fff; border: 1px solid #000;
  font-weight: 700; text-decoration: none; letter-spacing: .2px;
  box-shadow: 0 2px 0 #000;
  transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
}
.btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.18); }

/* ---------------- Pricing layout -------------------- */
.pricing { padding: 40px 10px 64px; background-color: #fff;}
.pricing__head { text-align: center; margin-bottom: 16px; }
.pricing__head h1 { margin: 0 0 6px; }

.pricing__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.price {
  background-color:#fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 22px;
  box-shadow: 0 8px 24px rgba(0,0,0,.08);
  display: grid;
  gap: 12px;
  align-content: start;
  transition: transform .15s ease, box-shadow .15s ease;
}
.price:hover { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(0,0,0,.14); }

.price h3 { margin: 0; }
.num { font-size: 34px; font-weight: 800; line-height: 1; }
.num span { font-size: 14px; color: var(--ink-3); font-weight: 600; }

.price ul { margin: 0; padding: 0 0 0 18px; display: grid; gap: 6px; color: var(--ink-2); }

.price--focus {
  position: relative;
  border-color: #111;
  box-shadow: 0 10px 28px rgba(0,0,0,.16);
}
.badge {
  position: absolute; top: -10px; right: 16px;
  background: #111; color: #fff;
  padding: 4px 10px; border-radius: 999px; font-size: 12px;
  box-shadow: 0 6px 16px rgba(0,0,0,.25);
}

.fineprint {
  margin-top: 14px;
  text-align: center;
  color: var(--ink-3);
  font-size: 12px;
}

.prodcard {

    background-color: #fff;
    padding:20px;
}

.pricing container {

    background-color: #fff;

}

/* ---------------- Responsive ------------------------ */
@media (max-width: 1024px) {
  .pricing__grid { grid-template-columns: 1fr; }
}
</style>
