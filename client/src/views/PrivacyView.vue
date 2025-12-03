<template>
  <div class="page">
    <header class="head container">
      <h1>Privacy Policy</h1>
      <p class="muted">
        How Set-Dec Runner and Magic Cat Software handle your data.
      </p>
    </header>

    <main class="container content">
      <section class="card">
        <h2>1. Overview</h2>
        <p>
          Set-Dec Runner is a production tool owned and operated by Magic Cat Software.
          We store only the information required to run your productions:
          user accounts, productions, runsheets, and related metadata.
        </p>
        <p>
          We do <strong>not</strong> sell your data to third parties.
        </p>
      </section>

      <section class="card">
        <h2>2. What We Collect</h2>
        <ul>
          <li>Account details such as your name and email.</li>
          <li>Production data: productions, runsheets, suppliers, people, sets.</li>
          <li>Usage & technical data (logs, basic analytics) to improve the app.</li>
        </ul>
      </section>

      <section class="card">
        <h2>3. How We Use Your Data</h2>
        <ul>
          <li>To authenticate you and secure your account.</li>
          <li>To operate the runsheet and logistics features you use.</li>
          <li>To maintain, debug, and improve Set-Dec Runner.</li>
        </ul>
      </section>

      <section class="card">
        <h2>4. Retention & Deletion</h2>
        <p>
          We retain production and account data for as long as the production
          (or your account) remains active. If you need data removed, contact
          us using the form on the <RouterLink to="/contact">Contact</RouterLink> page.
        </p>
      </section>

      <section class="card">
        <h2>5. Questions</h2>
        <p>
          If you have any questions about this policy, reach out through the
          <RouterLink to="/contact">Contact</RouterLink> page.
        </p>
      </section>
    </main>
  </div>
</template>

<script setup>
import { RouterLink } from 'vue-router';
</script>

<style scoped>
.page {
  padding-top: 16px;
}

.head {
  padding: 16px 16px 8px;
}

.head h1 {
  font-size: 24px;
  margin: 0 0 4px;
}

.head .muted {
  font-size: 13px;
  color: #6b7280;
}

.content {
  padding-bottom: 32px;
}

.card {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  padding: 16px 18px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
}

.card h2 {
  font-size: 18px;
  margin: 0 0 8px;
}

.card p {
  margin: 0 0 8px;
  line-height: 1.5;
  font-size: 14px;
}

.card ul {
  padding-left: 18px;
  margin: 0;
  font-size: 14px;
}

.card li + li {
  margin-top: 4px;
}

/* Phone tweaks */
@media (max-width: 640px) {
  .head {
    padding-top: 12px;
  }

  .head h1 {
    font-size: 22px;
  }

  .card {
    padding: 14px 14px;
  }
}
</style>
