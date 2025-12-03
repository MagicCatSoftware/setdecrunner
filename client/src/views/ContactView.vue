<template>
  <div class="page">
    <header class="head container">
      <h1>Contact</h1>
      <p class="muted">
        Get in touch about Set-Dec Runner, productions, or support.
      </p>
    </header>

    <main class="container content">
      <section class="card">
        <h2>Send a message</h2>
        <p class="muted">
          Fill out the form below and we’ll reply as soon as we can.
        </p>

        <form class="form" @submit.prevent="onSubmit">
          <div class="field">
            <label class="label" for="name">Name</label>
            <input
              id="name"
              v-model="form.name"
              type="text"
              class="input"
              placeholder="Your name"
            />
          </div>

          <div class="field">
            <label class="label" for="email">Email</label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              class="input"
              placeholder="you@example.com"
            />
          </div>

          <div class="field">
            <label class="label" for="message">Message</label>
            <textarea
              id="message"
              v-model="form.message"
              class="textarea"
              rows="4"
              placeholder="Tell us about your production, issue, or question…"
            ></textarea>
          </div>

          <p v-if="submitted" class="note">
            Thanks — this demo form doesn’t send email yet, but your UI is wired and
            ready for a backend endpoint.
          </p>

          <button type="submit" class="btn btn--primary">
            Send message
          </button>
        </form>
      </section>

      <section class="card">
        <h2>Other ways to reach us</h2>
        <ul class="list">
          <li>
            GitHub:
            <a
              href="https://github.com/adompatchett/setdecrunner"
              target="_blank"
              rel="noreferrer"
            >
              adompatchett / setdecrunner
            </a>
          </li>
          <li>
            You can also reach Magic Cat Software via your usual production contact
            channels.
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const form = ref({
  name: '',
  email: '',
  message: '',
});

const submitted = ref(false);

function onSubmit() {
  // Placeholder: wire this to your backend later
  submitted.value = true;
}
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

.muted {
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 10px;
}

.form {
  display: grid;
  gap: 10px;
}

.field {
  display: grid;
  gap: 4px;
}

.label {
  font-size: 13px;
  color: #4b5563;
}

.input,
.textarea {
  border-radius: 10px;
  border: 1px solid #d1d5db;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
}

.textarea {
  resize: vertical;
  min-height: 96px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid #111827;
  background: #111827;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.05s ease;
}

.btn:hover {
  background: #020617;
  transform: translateY(-1px);
}

.btn--primary {
  /* same as .btn here for clarity / future variants */
}

.note {
  font-size: 12px;
  color: #6b7280;
}

.list {
  padding-left: 18px;
  margin: 0;
  font-size: 14px;
}

.list li + li {
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
