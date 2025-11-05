<!-- client/src/views/FAQ.vue -->
<template>
  <PublicNav />

  <section class="faq container">
    <header class="faq__head">
      <h1>Frequently Asked Questions</h1>
      <p class="muted">All answers are for the current Alpha 1.0 build.</p>
    </header>

    <div class="faq__list">

      <details>
        <summary>What is Set Dec Runner?</summary>
        <div>
          Digital runsheets for set decoration. It doesn’t mean you can’t use paper runsheets anymore—you can even print digital runsheets from the software. It’s up to you.
        </div>
      </details>

      <details>
        <summary>How do I track items without visible barcodes or QR labels?</summary>
        <div>
          On-camera labels don’t work—you’re constantly peeling them off. Set Dec Runner relies on users to keep item locations updated, and the software makes this easy and fast.
        </div>
      </details>

      <details>
        <summary>Is Google Places integrated?</summary>
        <div>
          Yes. Google Autocomplete helps you find locations quickly and store them in the database.
        </div>
      </details>

      <details>
        <summary>What’s the tech stack?</summary>
        <div>
          Built with Node.js, Express, MongoDB, and Vue 3. AI helps with heavy lifting, and developers review code line by line to keep it robust and easy to use.
        </div>
      </details>

      <details>
        <summary>How are payments handled?</summary>
        <div>
          Pay with Stripe. We don’t store credit card numbers—Stripe processes payments so your card data is handled securely.
        </div>
      </details>

      <details>
        <summary>How is my data secured?</summary>
        <div>
          Passwords are encrypted. Only head developers may access your database for debugging and to push the software to the next version.
        </div>
      </details>

      <details>
        <summary>Is my production private?</summary>
        <div>
          Yes. Only members can access your portal—even after a production airs on TV or in theatres.
        </div>
      </details>

      <details>
        <summary>Is this affordable for indie productions?</summary>
        <div>
          Big studios pay standard rates (e.g., Netflix/HBO). Indie teams can pitch their project—if budgets are tight, we can reduce costs to help you finish.
        </div>
      </details>

      <details>
        <summary>What files can I store?</summary>
        <div>
          Photos of items, users, places, and receipts—so you can bring order to the chaos.
        </div>
      </details>

      <details>
        <summary>What’s the AI roadmap?</summary>
        <div>
          We’re building Set Dec Runner with AI and will integrate it further across the system. The goal is to stay at the forefront of production tech.
        </div>
      </details>

      <details>
        <summary>How do I request a feature or report a bug?</summary>
        <div>
          Share feedback at
          <a href="https://www.set-dec.com/featuresandbugs" target="_blank" rel="noreferrer">
            https://www.set-dec.com/featuresandbugs
          </a>.
        </div>
      </details>
    </div>
  </section>
   <public-footer/>
</template>

<script setup>
import PublicNav from '../components/PublicNav.vue';
import PublicFooter from '../components/PublicFooter.vue';
</script>

<style scoped>
/* -------- Monochrome palette (matches other pages) -------- */
:root {
  --ink: #111;
  --ink-2: #2a2a2a;
  --ink-3: #5a5a5a;
  --line: #e6e6e6;
  --panel: #ffffff;
  --bg: #f6f6f6;
}

/* -------- Page container (respects 20px outer app margin) --- */
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
  padding:10px;
  inset: 0;
  z-index: -1;
  background: url("../../public/HomeBackground.jpg");
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
  padding:10px;
}

/* -------- FAQ layout --------------------------------------- */
.faq { padding: 24px 10px 56px; }
.faq__head { text-align: center; margin-bottom: 18px; }
.faq__head h1 { margin: 0 0 6px; }
.muted { color: var(--ink-3); }

.faq__list {
  display: grid;
  gap: 12px;
}

details {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 8px 24px rgba(0,0,0,.08);
}

summary {
  cursor: pointer;
  list-style: none;
  font-weight: 800;
  color: var(--ink);
  position: relative;
  padding-right: 24px;
}
summary::-webkit-details-marker { display: none; }

details > div {
  margin-top: 8px;
  color: var(--ink-2);
  line-height: 1.6;
}

/* caret */
summary::after {
  content: "▾";
  position: absolute;
  right: 4px;
  top: 0;
  transform: rotate(-90deg);
  transition: transform .15s ease;
}
details[open] summary::after { transform: rotate(0deg); }

/* links (B/W only) */
a { color: #000; text-decoration: underline; text-decoration-thickness: 2px; }

/* responsive */
@media (max-width: 720px) {
  .container { padding: 24px 16px; }
}
</style>
