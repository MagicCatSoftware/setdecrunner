<!-- client/src/views/Home.vue -->
<template>
  <PublicNav />

  <!-- Hero -->
  <section class="hero container">
    <div class="hero__inner">
      <div class="hero__copy" v-reveal>
        <h1>Digital Runsheets For Set Decoration</h1>
        <p class="sub">
          It doesn't mean you can't use paper runsheets anymore, it just makes more sense to use the software, and the software allows you to print out digital runsheets. In other words it's up to you.
        </p>
        <div class="cta">
          <RouterLink class="btn" to="/pricing">Get Started</RouterLink>
          <RouterLink
            class="btn btn--ghost"
            :to="{ name: 'tenant-login', params: { slug: 'demo' } }"
          >Try Demo</RouterLink>
        </div>
      </div>
      <div class="hero__art" v-reveal style="--d:120ms">
        <img src="../../public/image01.png" alt="Set-Dec Runner preview" loading="lazy" />
      </div>
    </div>
  </section>

  <!-- Image gallery (fade-in on scroll) -->
  <section class="gallery container">
    <div class="gallery__row">
      <img v-reveal src="../../public/image02.png" alt="Runsheet editor" loading="lazy" />
      <img v-reveal style="--d:120ms" src="../../public/image03.png" alt="Driver PWA" loading="lazy" />
      <img v-reveal style="--d:240ms" src="../../public/image04.png" alt="QR items and receipts" loading="lazy" />
    </div>
  </section>

  <!-- Features (from your snippet) -->
  <section class="features container">
    <div class="grid">
      <article class="card" v-reveal>
        <div class="icon">🗺️</div>
        <h3>Smart Runsheets</h3>
        <p>Create PD/RD flows, Mustache instructions, and assign to drivers with a tap.</p>
      </article>
      <article class="card" v-reveal style="--d:160ms">
        <div class="icon">🖊️</div>
        <h3>Sign-off</h3>
        <p>Capture signatures on deliveries and returns right in the PWA.</p>
      </article>
      <article class="card" v-reveal style="--d:240ms">
        <div class="icon">📍</div>
        <h3>Places Autocomplete</h3>
        <p>Google Places to save suppliers, sets, and storage addresses in seconds.</p>
      </article>
    </div>
  </section>

  <!-- Extracted info blocks -->
  <section class="info container">
    <div class="info__grid">
      <article class="card info__item" v-reveal>
        <h3 class="info__title">Set Dec Runner is being built for the heavy duty film industry.</h3>
        <p class="info__body"></p>
      </article>

      <article class="card info__item" v-reveal style="--d:80ms">
        <h3 class="info__title">Keep track of your items, the best you can.</h3>
        <p class="info__body">
          Unfortunately, slapping QR codes or Bar codes onto all your items doesn't make sense, because they can't be seen on camera, so you're constantly peeling these identifiers off and it just doesn't work. So Set Dec Runner relies on the users to try and update where items location is, the software does this very well.
        </p>
      </article>

      <article class="card info__item" v-reveal style="--d:160ms">
        <h3 class="info__title">Google Search integrated.</h3>
        <p class="info__body">
          Set Dec Runner uses Google Search Auto Complete to find locations quickly and store them in the database.
        </p>
      </article>

      <article class="card info__item" v-reveal style="--d:240ms">
        <h3 class="info__title">
          Built with Node.js, Express ,MongoDB and Vue 3.0, with AI doing the heavy lifting, and developers going through the code line by line to debug and make sure the software is robust and easy to use.
        </h3>
        <p class="info__body"></p>
      </article>

      <article class="card info__item" v-reveal style="--d:320ms">
        <h3 class="info__title">Pay With Stripe</h3>
        <p class="info__body">
          we don't store credit cards in the database, Stripe takes care of all the payments we recieve, so you can be rest assured that credit card information is dealt with seriously.
        </p>
      </article>

      <article class="card info__item" v-reveal style="--d:400ms">
        <h3 class="info__title">We take security as serious business</h3>
        <p class="info__body">
          passwords are encrypted, only the head developers can see your database, and that's to be able to see where things are going wrong, and how to push the software to the next version.
        </p>
      </article>

      <article class="card info__item" v-reveal style="--d:480ms">
        <h3 class="info__title">Privacy</h3>
        <p class="info__body">
          we know you want your production being private sometimes even after the production is being shown on television or theatre, thus nobody except members can access your portal.
        </p>
      </article>

      <article class="card info__item" v-reveal style="--d:560ms">
        <h3 class="info__title">Affordable</h3>
        <p class="info__body">
          For productions by the top level industries like Netflix or HBO, you pay the full price. However; you can also pitch to us your project, and if you don't have a lot of money, we can shrink that cost down so you can get the production finished. In other words we support indie film makers.
        </p>
      </article>

      <article class="card info__item" v-reveal style="--d:640ms">
        <h3 class="info__title">Photos & receipts</h3>
        <p class="info__body">
          Set Dec Runner stores photos of items, users, places, and also reciepts and it allows you to really get control of all the 'chaos'
        </p>
      </article>

      <article class="card info__item" v-reveal style="--d:720ms">
        <h3 class="info__title">We are building Set Dec Runner with AI</h3>
        <p class="info__body">
          and we will further integrate AI into the entire system. Rest assured we want Set Dec Runner being the at the forefront of technology.
        </p>
      </article>

      <article class="card info__item" v-reveal style="--d:800ms">
        <h3 class="info__title">Feature requests</h3>
        <p class="info__body">
          Finally, if you want features added, you can suggest them at
          <a href="https://www.set-dec.com/featuresandbugs" target="_blank" rel="noreferrer">https://www.set-dec.com/featuresandbugs</a>
          we are more than happy to keep adding code based on feedback.
        </p>
      </article>
    </div>
  </section>

  <!-- CTA stripe (from your snippet) -->
  <section class="stripe container">
    <div class="stripe__inner" v-reveal>
      <h2>Built for film set decoration</h2>
      <p>From pickups to returns, every step is streamlined for coordinators, buyers, and drivers.</p>
      <RouterLink to="/pricing" class="btn">See Pricing</RouterLink>
    </div>
  </section>
  <public-footer/>
</template>

<script setup>
import PublicNav from '../components/PublicNav.vue';
import PublicFooter from '../components/PublicFooter.vue';
</script>

<style scoped>
/* ---------------- Monochrome palette (global) ---------------- */
:global(:root) {
  --ink: #111;            /* primary text */
  --ink-2: #2a2a2a;       /* secondary text */
  --ink-3: #5a5a5a;       /* muted text */
  --line: #e6e6e6;        /* borders */
  --panel: #ffffff;       /* cards / surfaces */
  --bg: #ffffff;          /* app background */
}

/* ---------------- Site-wide container (20px margin) ---------- */
:global(html), :global(body) { height: 100%; }
:global(body) { margin: 0; background: #ffffff; color: var(--ink); }
:global(#app) {
  margin: 20px;                          /* << required outer margin */
  min-height: calc(100vh - 40px);
  padding:10px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 22px 60px rgba(0,0,0,.10), 0 2px 10px rgba(0,0,0,.06);
}

/* ---------------- Page & containers -------------------------- */
/* Main container with monochrome background image */
.container {
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 20px;
  position: relative;
  isolation: isolate;

}

/* Background image layer (grayscale, subtle) */
.container::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: url("../../public/HomeBackground.jpg") center / cover no-repeat; /* replace with your image path */
  filter: grayscale(100%) contrast(1.05) brightness(0.98);
  opacity: 0.18;                 /* keep content readable */
}


/* ---------------- Buttons (black/white only) ----------------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 10px; padding: 12px 18px; border-radius: 12px;
  background: #111; color: #fff; border: 1px solid #000;
  font-weight: 700; text-decoration: none; letter-spacing: .2px;
  box-shadow: 0 2px 0 #000;
  transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
}
.btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.18); }
.btn:active { transform: translateY(0); box-shadow: 0 2px 0 #000; }
.btn--ghost { background: transparent; color: #111; border: 1px solid #222; box-shadow: none; }
.btn--ghost:hover { background: #111; color: #fff; }

/* ---------------- Alpha banner ------------------------------- */
.banner {
  background: linear-gradient(180deg, #111, #1a1a1a);
  color: #fff; padding: 16px 0; border-bottom: 1px solid #000;
}
.banner__text { margin: 0; font-weight: 700; letter-spacing: .3px; }

/* ---------------- Hero --------------------------------------- */
.hero { padding: 56px 0 28px; }
.hero__inner { display: grid; padding:10px; grid-template-columns: 1.15fr .85fr; gap: 28px; align-items: center; }
.hero__copy h1 { font-size: 46px; line-height: 1.08; margin: 0 0 14px; color: var(--ink); }
.sub { color: var(--ink-3); font-size: 17px; margin-bottom: 18px; }
.cta { display: flex; gap: 12px; flex-wrap: wrap; }
.hero__art img {
  width: 100%; border-radius: 16px; border: 1px solid var(--line);
  box-shadow: 0 12px 30px rgba(0,0,0,.10);
  filter: grayscale(100%) contrast(1.05);
  background: var(--panel);
}

/* ---------------- Gallery ------------------------------------ */
.gallery { padding: 12px 0 36px; }
.gallery__row { padding: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.gallery__row img {
  width: 100%; aspect-ratio: 16/10; object-fit: cover;
  border-radius: 12px; border: 1px solid var(--line); box-shadow: 0 10px 28px rgba(0,0,0,.10);
  filter: grayscale(100%) contrast(1.05);
}

/* ---------------- Features ----------------------------------- */
.features { padding: 28px 0 52px; }
.grid { padding:10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.card {
  background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
  padding: 22px; box-shadow: 0 8px 24px rgba(0,0,0,.08);
  transition: transform .15s ease, box-shadow .15s ease;
}
.card:hover { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(0,0,0,.14); }
.icon { font-size: 24px; line-height: 1; filter: grayscale(100%); margin-bottom: 6px; display: inline-block; }

/* ---------------- Info grid (text blocks) -------------------- */
.info { padding: 12px 0 52px; }
.info__grid { padding: 10px;display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.info__item { padding: 22px; }
.info__title { margin: 0 0 8px; font-size: 18px; font-weight: 800; color: var(--ink); }
.info__body { margin: 0; color: var(--ink-2); }
.info a { color: #000; text-decoration: underline; text-decoration-thickness: 2px; }

/* ---------------- CTA stripe -------------------------------- */
.stripe { padding: 46px 0px 78px; }
.stripe__inner {
  text-align: center; padding: 34px; border-radius: 16px;
  background: linear-gradient(180deg, #fff, #f2f2f2);
  border: 1px solid var(--line); box-shadow: 0 12px 34px rgba(0,0,0,.10);
  margin:10px;
}
.stripe__inner h2 { margin: 0 0 10px; }
.stripe__inner p { color: var(--ink-3); margin: 0 0 16px; }

/* ---------------- Scroll reveal ------------------------------ */
.reveal { opacity: 0; transform: translateY(14px) scale(.985); }
.reveal.in-view {
  opacity: 1; transform: none;
  transition: transform 640ms cubic-bezier(.2,.65,.3,1), opacity 640ms ease;
  transition-delay: var(--d, 0ms);
}

/* ---------------- Responsiveness ----------------------------- */
@media (max-width: 1100px) {
  .hero__inner { grid-template-columns: 1fr; }
  .grid, .info__grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 720px) {
  .container { padding: 22px 16px; }
  .hero__copy h1 { font-size: 36px; }
  .grid, .info__grid, .gallery__row { grid-template-columns: 1fr; }
}
</style>
