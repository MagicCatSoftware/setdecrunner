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
  background: rgba(255,255,255,.85);
  border-bottom: 1px solid #eaeaea;
}
.nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
}
.container { max-width: 1100px; margin: 0 auto; }
.brand { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.brand__logo {
  height: 28px;
  width: auto;
  border-radius: 6px;
  object-fit: contain;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}

.links {
  display: flex;
  gap: 14px;
  align-items: center;
  width: 100%;
}
.flex-spacer { flex: 1; }

.links a {
  color: #222;
  text-decoration: none;
  font-weight: 500;
}
.links a.router-link-active { color: #0a66c2; }

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid #0a66c2;
  background: #0a66c2;
  color: #fff;
  font-weight: 600;
  transition: .15s ease;
}
.btn:hover { filter: brightness(1.05); transform: translateY(-1px); }
.btn--ghost {
  background: transparent;
  color: #0a66c2;
  border-color: #0a66c2;
}

@media (max-width: 768px) {
  .links { gap: 10px; }
  .btn { padding: 8px 12px; }
}
</style>

