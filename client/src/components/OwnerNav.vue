<template>
  <header class="owner-nav">
    <div class="container row">
      <div class="left">
        <RouterLink class="brand" to="/owner">Owner Console</RouterLink>
      </div>

      <nav class="right">
        <!-- When NOT logged in, show only login -->
        <RouterLink v-if="!isAuthed" class="link" to="/owner/login">Owner login</RouterLink>

        <!-- When logged in, show the owner controls -->
        <template v-else>
          <RouterLink class="link" to="/owner">My Productions</RouterLink>
          <RouterLink class="link" to="/purchase" title="Create a new production">Create Production</RouterLink>
          <RouterLink class="link" to="/owner/logout" title="Sign out">Logout</RouterLink>

          <div class="userchip" :title="email || name">
            <span class="avatar">{{ initials }}</span>
            <span class="uname">{{ name || email || 'Owner' }}</span>
          </div>
        </template>
      </nav>
    </div>
  </header>
</template>

<script setup>
import { RouterLink, useRouter } from 'vue-router';
import { ref, computed, onMounted } from 'vue';

const router = useRouter();

const token = ref('');
const user  = ref(null);

function readToken() {
  try {
    const t = localStorage.getItem('token');
    return t && t !== 'undefined' && t !== 'null' ? t : '';
  } catch { return ''; }
}
function readUser() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    return u && typeof u === 'object' ? u : null;
  } catch { return null; }
}

function decodeJwtPayload(t) {
  try {
    const parts = t.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch { return null; }
}

const isAuthed = computed(() => {
  if (!token.value) return false;
  const payload = decodeJwtPayload(token.value);
  if (!payload) return false;
  if (payload.exp && Date.now() >= payload.exp * 1000) return false;
  return true;
});

const name  = computed(() => user.value?.name || '');
const email = computed(() => user.value?.email || '');
const initials = computed(() => {
  const src = (name.value || email.value || '').trim();
  if (!src) return 'U';
  const parts = src.split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  return s.toUpperCase() || src[0].toUpperCase();
});

function refreshAuth() {
  token.value = readToken();
  user.value  = readUser();
}

onMounted(() => {
  refreshAuth();
  // keep in sync across tabs/windows
  window.addEventListener('storage', (e) => {
    if (e.key === 'token' || e.key === 'user') refreshAuth();
  });
});
</script>

<style scoped>
.owner-nav {
  border-bottom: 1px solid #eee;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 40;
}

/* Shared container */
.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 10px 16px;
}

/* Desktop / base layout */
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.left {
  flex-shrink: 0;
}

.brand {
  font-weight: 700;
  text-decoration: none;
  color: #111;
  font-size: 18px;
}

/* Right side (links + user) */
.right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Link buttons */
.link {
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  color: #111;
  text-decoration: none;
  font-size: 14px;
  white-space: nowrap;
}
.link:hover {
  background: #f3f4f6;
}

/* User chip */
.userchip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 9999px;
  background: #fff;
}

.avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: #eef2ff;
  color: #3730a3;
}

.uname {
  font-size: 13px;
  color: #333;
}

/* ================= Tablet ================= */
@media (max-width: 900px) {
  .container {
    padding: 8px 12px;
  }

  .brand {
    font-size: 17px;
  }

  .link {
    font-size: 13px;
    padding: 6px 9px;
  }
}

/* ================= Phone ================= */
@media (max-width: 640px) {
  .container {
    padding: 8px 12px;
  }

  .row {
    /* Stack everything vertically, brand on top, buttons below */
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .left {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .brand {
    font-size: 16px;
  }

  .right {
    /* Let links wrap and fill width nicely */
    flex: 1 0 auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 8px;
  }

  .link {
    flex: 1 1 calc(50% - 8px); /* two per row on most phones */
    text-align: center;
    font-size: 13px;
    padding: 8px 6px;
  }

  .userchip {
    order: -1;                 /* show chip first in the row on mobile */
    width: 100%;
    justify-content: flex-start;
    padding: 6px 10px;
  }

  .uname {
    display: none;             /* keep chip compact, just the avatar */
  }
}

/* ============= Very Small Phones ============= */
@media (max-width: 400px) {
  .link {
    flex: 1 1 100%;            /* 1 per row on tiny devices */
  }
}
</style>
