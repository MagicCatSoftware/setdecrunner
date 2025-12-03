<template>
<footer class="footer">
<div class="footer__inner container">
<div class="footer__brand">
<img src="/logo.png" alt="Set‑Dec Runner" />
<div>
<div class="title">Set‑Dec Runner</div>
<div class="muted">© {{ year }} Magic Cat Software</div>
</div>
</div>
<div class="footer__links">
<a href="https://github.com/magiccatsoftware/setdecrunner" target="_blank" rel="noreferrer">GitHub</a>
<RouterLink to="/privacy">Privacy</RouterLink>
<RouterLink to="/terms">Terms</RouterLink>
<RouterLink to="/contact">Contact</RouterLink>
</div>
</div>
</footer>
</template>


<script setup>
import { RouterLink } from 'vue-router';
const year = new Date().getFullYear();
</script>


<style scoped>
.footer {
  border-top: 1px solid #ececec;
  background: #fff;
}

/* Inner layout (desktop) */
.footer__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 0;
}

/* Brand area */
.footer__brand {
  display: flex;
  gap: 12px;
  align-items: center;
}

.footer__brand img {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: contain;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.title {
  font-weight: 700;
  line-height: 1.1;
}

.muted {
  color: #6b7280;
  font-size: 12px;
}

/* Links row (desktop) */
.footer__links {
  display: flex;
  gap: 14px;
  align-items: center;
}

.footer__links a {
  color: #374151;
  text-decoration: none;
  font-size: 14px;
}

.footer__links a:hover {
  text-decoration: underline;
}

/* ================= Tablet ================= */
@media (max-width: 900px) {
  .footer__inner {
    padding: 16px 12px;
  }

  .footer__links {
    gap: 12px;
  }
}

/* ================= Phone ================= */
@media (max-width: 640px) {
  .footer__inner {
    flex-direction: column;     /* stack vertically */
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 16px;
    padding: 16px 12px;
  }

  .footer__brand {
    flex-direction: column;     /* logo above text */
    align-items: center;
    gap: 6px;
  }

  .footer__brand img {
    width: 42px;
    height: 42px;
  }

  .title {
    font-size: 15px;
  }

  .muted {
    font-size: 12px;
  }

  .footer__links {
    flex-wrap: wrap;            /* wrap links into rows */
    justify-content: center;
    gap: 10px 16px;
  }

  .footer__links a {
    font-size: 14px;
  }
}

/* ============= Very Small Phones ============= */
@media (max-width: 420px) {
  .footer__links {
    flex-direction: column;     /* vertical link stack */
    gap: 8px;
  }

  .footer__links a {
    font-size: 15px;
  }
}
</style>
