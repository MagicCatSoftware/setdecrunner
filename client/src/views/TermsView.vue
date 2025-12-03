<template>
  <div class="page">
    <header class="head container">
      <h1>Terms of Service</h1>
      <p class="muted">
        The rules for using Set-Dec Runner.
      </p>
    </header>

    <main class="container content">
      <section class="card">
        <h2>1. Agreement</h2>
        <p>
          By using Set-Dec Runner you agree to these terms. If you do not agree,
          please do not use the service.
        </p>
      </section>

      <section class="card">
        <h2>2. Your Responsibilities</h2>
        <ul>
          <li>Keep your login details safe and secure.</li>
          <li>Ensure you have permission to enter any data you upload.</li>
          <li>Use Set-Dec Runner for lawful productions and activities only.</li>
        </ul>
      </section>

      <section class="card">
        <h2>3. Service Changes</h2>
        <p>
          We may update or change features from time to time. We aim to keep
          the service stable, but there may be occasional downtime for
          maintenance or upgrades.
        </p>
      </section>

      <section class="card">
        <h2>4. Liability</h2>
        <p>
          Set-Dec Runner is provided “as is.” While we care about reliability,
          Magic Cat Software is not liable for losses caused by outages,
          data loss, or misuse of the service.
        </p>
      </section>

      <section class="card">
        <h2>5. Contact</h2>
        <p>
          If you need clarification on these terms, please reach out via the
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
