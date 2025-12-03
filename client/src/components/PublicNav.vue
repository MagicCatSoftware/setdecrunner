<!-- client/src/components/PublicNav.vue -->
<template>
  <header class="nav">
    <div class="nav__inner container">
      <div class="brand" @click="$router.push('/')" role="button" tabindex="0">
        <img class="brand__logo" src="/logo.png" alt="Set-Dec Runner logo" />
      </div>

      <nav class="links">
        <RouterLink to="/features">Features</RouterLink>
        <RouterLink to="/pricing">Pricing</RouterLink>
        <RouterLink to="/FAQ">FAQ</RouterLink>

        <span class="flex-spacer" />

        <!-- Auth-aware owner actions -->
        <RouterLink
          v-if="!isAuthed"
          class="btn btn--ghost"
          to="/owner/login"
          title="Production owner login"
        >
          Owner login
        </RouterLink>

        <template v-else>
          <RouterLink class="btn" to="/owner" title="Owner Console">
            Owner Console
          </RouterLink>
          <RouterLink class="btn btn--ghost" to="/owner/logout" title="Sign out">
            Logout
          </RouterLink>
        </template>
      </nav>
    </div>
  </header>
</template>

<script setup>
import { RouterLink, useRouter } from 'vue-router';
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useAuth } from '../auth.js';

const auth = useAuth();
const router = useRouter();

const tokenRef = ref('');

// single source of truth sync (store ref -> value OR store string -> string OR localStorage)
function syncToken() {
  const t =
    auth && auth.token != null
      ? (typeof auth.token === 'object' && 'value' in auth.token ? auth.token.value : String(auth.token))
      : '';
  tokenRef.value = t || (localStorage.getItem('token') || '');
}

function onStorage(e) {
  if (e.key === 'token') syncToken();
}
function onFocus() {
  // same-tab updates won’t fire storage; ensure we pick up latest
  syncToken();
}

let pollTimer = null;
function startShortPoll() {
  clearInterval(pollTimer);
  let n = 0;
  pollTimer = setInterval(() => {
    n += 1;
    const before = tokenRef.value;
    syncToken();
    if (tokenRef.value !== before || n > 20) { // ~6s max at 300ms
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }, 300);
}

onMounted(() => {
  syncToken();         // initial
  startShortPoll();    // catch same-tick login finishes
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', onFocus);

  // react on route changes (e.g., redirect to /owner after login)
  watch(() => router.currentRoute.value.fullPath, () => {
    syncToken();
  }, { immediate: false });
});

onBeforeUnmount(() => {
  window.removeEventListener('storage', onStorage);
  window.removeEventListener('focus', onFocus);
  clearInterval(pollTimer);
  pollTimer = null;
});

const isAuthed = computed(() => !!tokenRef.value);
</script>

<style scoped>
.nav {
  padding: 10px;
  position: sticky;
  top: 0;
  z-index: 40;
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid #eaeaea;
}

/* Inner layout */
.nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
}

.container {
  max-width: 1100px;
  margin: 0 auto;
}

/* Brand / logo */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.brand__logo {
  height: 80px;
  width: auto;
  border-radius: 6px;
  object-fit: contain;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

/* Links row (desktop) */
.links {
  display: flex;
  gap: 14px;
  align-items: center;
  width: 100%;
}

.flex-spacer {
  flex: 1;
}

/* Link typography */
.links a {
  color: #222;
  text-decoration: none;
  font-weight: 500;
  font-size: 15px;
}

.links a.router-link-active {
  color: #0a66c2;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid #0a66c2;
  background: #0a66c2;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  transition: 0.15s ease;
  white-space: nowrap;
}

.btn:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--ghost {
  background: transparent;
  color: #0a66c2;
}

/* ================== Tablet tweaks ================== */
@media (max-width: 900px) {
  .brand__logo {
    height: 64px;
  }

  .links {
    gap: 10px;
  }

  .btn {
    padding: 7px 12px;
    font-size: 13px;
  }
}

/* ================== Phone layout ================== */
@media (max-width: 640px) {
  .nav {
    padding: 6px 0;
  }

  .nav__inner {
    padding: 8px 12px;
    gap: 10px;
    flex-wrap: wrap;        /* allow brand + links to wrap */
  }

  .brand__logo {
    height: 44px;
    border-radius: 4px;
  }

  /* Stack links under the logo, wrap nicely */
  .links {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
    row-gap: 6px;
    column-gap: 10px;
  }

  /* Spacer is pointless on small screens */
  .flex-spacer {
    display: none;
  }

  .links a {
    font-size: 14px;
  }

  /* Make auth buttons more tappable on mobile */
  .links .btn,
  .links .btn--ghost {
    padding: 7px 14px;
  }
}

/* Extra-small phones: make buttons full-width row chips */
@media (max-width: 430px) {
  .links {
    row-gap: 8px;
  }

  .links > a,
  .links > .btn,
  .links > .btn--ghost {
    font-size: 14px;
  }

  /* Make auth buttons stand out as full-width actions */
  .links .btn,
  .links .btn--ghost {
    flex: 1 1 100%;
    justify-content: center;
  }
}
</style>

