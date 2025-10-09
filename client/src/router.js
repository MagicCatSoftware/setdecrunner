// client/src/router.js
import { createRouter, createWebHistory } from 'vue-router';
import api, { apiGet } from './api.js';
import { logout as softLogout } from './auth.js';

import ProductPage from './views/ProductPage.vue';
import ThankYou from './views/ThankYou.vue';
import SlugLayout from './views/SlugApp.vue';
import TenantLogin from './views/Login.vue';
import Dashboard from './views/Dashboard.vue';
import SetPassword from './views/SetPassword.vue';

// Lazy views
const RunSheets              = () => import('./views/RunSheets.vue');
const RunSheetSingle         = () => import('./views/RunsheetSingle.vue');
const RunSheetEditor         = () => import('./views/RunSheetEditor.vue');
const RunSheetsBeta          = () => import('./views/RunSheetsBeta.vue');
const RunSheetByHand         = () => import('./views/RunsheetByHand.vue');
const HandWrittenRunsheet    = () => import('./views/HandWrittenRunsheet.vue');

const Suppliers              = () => import('./views/Suppliers.vue');
const SupplierEditor         = () => import('./views/SupplierEditor.vue');

const People                 = () => import('./views/People.vue');
const PeopleEditor           = () => import('./views/PeopleEditor.vue');

const SetsList               = () => import('./views/SetsList.vue');
const SetEditor              = () => import('./views/SetEditor.vue');

const Driver                 = () => import('./views/Driver.vue');
const Items                  = () => import('./views/Items.vue');
const Places                 = () => import('./views/Places.vue');
const AdminUsers             = () => import('./views/AdminUsers.vue');

// Public
const Public                 = () => import('./views/Public.vue');
const Pricing                = () => import('./views/Pricing.vue');
const Features               = () => import('./views/Features.vue');
const FAQ                    = () => import('./views/FAQ.vue');
const Purchase               = () => import('./views/Purchase.vue');

// Owner area
const OwnerLogin             = () => import('./views/OwnerLogin.vue');
const OwnerDashboard         = () => import('./views/OwnerDashboard.vue');
const OwnerProductionEditor  = () => import('./views/OwnerProductionEditor.vue');

/* ---------------- auth helpers ---------------- */
function getToken() {
  const t = localStorage.getItem('token');
  return t && t !== 'undefined' && t !== 'null' ? t : '';
}
function decodeJwtPayload(t) {
  try {
    const parts = String(t).split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch { return null; }
}
function isAuthed() {
  const t = getToken();
  if (!t) return false;
  const payload = decodeJwtPayload(t);
  if (payload && payload.exp && Date.now() >= payload.exp * 1000) {
    try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch {}
    return false;
  }
  return true;
}

/* Hard logout */
function hardLogout() {
  try { softLogout?.(); } catch {}
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentProductionId');
    localStorage.removeItem('tenantAccessCache');
  } catch {}
  try { api.setProductionId?.(''); } catch {}
  try { api.setUnauthorizedHandler?.(null); } catch {}
  try { window.dispatchEvent(new Event('storage')); } catch {}
  try { window.dispatchEvent(new Event('focus')); } catch {}
}

/* Owner/Tenant unauthorized handlers */
function enterOwnerMode(router, fullPath) {
  try { api.setProductionId?.(''); } catch {}
  try {
    api.setUnauthorizedHandler?.(() => {
      if (router.currentRoute.value.name !== 'owner-login') {
        router.replace({ name: 'owner-login', query: { r: fullPath }, replace: true });
      }
    });
  } catch {}
}
function enterTenantMode(router, slug, fullPath) {
  try {
    api.setUnauthorizedHandler?.(() => {
      if (router.currentRoute.value.name !== 'tenant-login') {
        router.replace({ name: 'tenant-login', params: { slug }, query: { r: fullPath }, replace: true });
      }
    });
  } catch {}
}

/* OAuth helper */
function setTokenAndNotify(token) {
  try { localStorage.setItem('token', token); } catch {}
  try { window.dispatchEvent(new Event('storage')); } catch {}
  try { window.dispatchEvent(new Event('focus')); } catch {}
}

/* -------------- tenant access cache (by production) -------------- */
function readAccessCache() {
  try { return JSON.parse(localStorage.getItem('tenantAccessCache') || '{}'); }
  catch { return {}; }
}
function writeAccessCache(cache) {
  try { localStorage.setItem('tenantAccessCache', JSON.stringify(cache || {})); } catch {}
}
function setAccessForPid(pid, info) {
  const cache = readAccessCache();
  cache[String(pid)] = info;
  writeAccessCache(cache);
}
function getAccessForPid(pid) {
  const cache = readAccessCache();
  return cache[String(pid)] || null;
}
function hasTenantAccess(pid, { requireAuthorized = false, requireAdmin = false } = {}) {
  const a = getAccessForPid(pid);
  if (!a || !a.isMember) return false;
  if (requireAuthorized && !a.authorized) return false;
  if (requireAdmin && !(a.owner || (String(a.role || '').toLowerCase() === 'admin'))) return false;
  return true;
}

/* ---------------- pid + tenant session hydration ---------------- */
const _pidPromises = new Map();

async function ensurePidAndAccessForSlug(slug) {
  const storedPid = localStorage.getItem('currentProductionId') || '';
  if (storedPid) return storedPid;

  if (_pidPromises.has(slug)) return _pidPromises.get(slug);

  const p = (async () => {
    // 1) Resolve pid PUBLICLY (no auth header)
    const prod = await apiGet(`/productions/by-slug/${encodeURIComponent(slug)}`, undefined, {
      headers: { Authorization: '' },
    });
    const pid = String(prod._id || '');
    if (!pid) throw new Error('Production not found');

    // 2) Persist + make api helper attach the header globally
    try { localStorage.setItem('lastSlug', slug); } catch {}
    try { localStorage.setItem('currentProductionId', pid); } catch {}
    try { api.setProductionId?.(pid); } catch {}

    // 3) If authed, hydrate tenant session once and cache access (member/authorized/admin/owner)
    if (isAuthed()) {
      try {
        const me = await apiGet('/tenant/tenantauth/me', undefined, { headers: { 'X-Production-Id': pid } });
        const access = {
          isMember: true,
          owner: !!me?.owner,
          role: me?.role || (me?.member?.role) || 'user',
          siteAuthorized: !!(me?.member?.siteAuthorized) || !!me?.owner,
          authorized: !!(me?.owner || me?.member?.siteAuthorized),
        };
        setAccessForPid(pid, access);

        // Optional legacy user cache update
        try {
          const legacy = JSON.parse(localStorage.getItem('user') || 'null') || {};
          const productionIds = Array.from(new Set([...(legacy.productionIds || []), pid]));
          localStorage.setItem('user', JSON.stringify({ ...legacy, productionIds }));
        } catch {}
      } catch {
        // leave cache empty; server enforces later
      }
    }
    return pid;
  })();

  _pidPromises.set(slug, p);
  try { return await p; } finally { _pidPromises.delete(slug); }
}

/* ---------------- router ---------------- */
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', name: 'marketing', component: Public },
    { path: '/thank-you', name: 'thank-you', component: ThankYou },
    { path: '/pricing', name: 'pricing', component: Pricing },
    { path: '/purchase', name: 'purchase', component: Purchase },
    { path: '/features', name: 'features', component: Features },
    { path: '/FAQ', name: 'FAQ', component: FAQ },

    // Global set-password (no slug) — works for emails that don't include slug in path
    { path: '/set-password', name: 'set-password', component: SetPassword },

    // Owner area
    { path: '/owner/login', name: 'owner-login', component: OwnerLogin, meta: { guestOnlyOwner: true, ownerArea: true } },
    { path: '/owner/logout', name: 'owner-logout', beforeEnter: () => { hardLogout(); return { name: 'owner-login', replace: true }; } },
    { path: '/owner', name: 'owner-home', component: OwnerDashboard, meta: { requiresAuth: true, ownerArea: true } },
    { path: '/owner/productions/:id', name: 'owner-production-edit', component: OwnerProductionEditor, props: true, meta: { requiresAuth: true, ownerArea: true } },

    // Global logout
    {
      path: '/logout',
      name: 'root-logout',
      beforeEnter: () => {
        hardLogout();
        const lastSlug = localStorage.getItem('lastSlug');
        if (lastSlug) return { name: 'tenant-login', params: { slug: lastSlug }, replace: true };
        return { name: 'marketing', replace: true };
      },
    },

    // Tenant area
    {
      path: '/:slug',
      component: SlugLayout,
      async beforeEnter(to) {
        const slug = String(to.params.slug || '').toLowerCase();
        try {
          await ensurePidAndAccessForSlug(slug);
          enterTenantMode(router, slug, to.fullPath);
          return true;
        } catch {
          return { path: '/', replace: true };
        }
      },
      children: [
        { path: 'login', name: 'tenant-login', component: TenantLogin, meta: { guestOnlyTenant: true } },

        // Tenant-scoped set password page — allow guests and signed-in users
        {
          path: 'set-password',
          name: 'tenant-set-password',
          component: SetPassword,
          meta: { guestOnlyTenant: true, allowAuthed: true },
        },

        {
          path: '',
          name: 'tenant-home',
          component: Dashboard,
          meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true },
          beforeEnter: (to) => {
            const slug = String(to.params.slug || '');
            if (!isAuthed()) {
              return { name: 'tenant-login', params: { slug }, query: { r: `/${slug}` }, replace: true };
            }
            return true;
          },
        },

        { path: 'logout', name: 'tenant-logout', beforeEnter: (to) => {
          const slug = String(to.params.slug || '');
          hardLogout();
          return { name: 'tenant-login', params: { slug }, replace: true };
        } },

        // Runsheets
        { path: 'runsheets',            name: 'runsheets',        component: RunSheets,      meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'runsheets/new',        name: 'runsheet-new',     component: RunSheetEditor, meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'runsheets/:id',        name: 'runsheet-edit',    component: RunSheetEditor, props: true, meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'runsheets/:id/beta',   name: 'runsheet-beta',    component: RunSheetsBeta,  props: true, meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },

        // Canvas
        { path: 'runsheets/:id/by-hand', name: 'runsheet-by-hand', component: RunSheetByHand, props: true, meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },

        // Smart view
        {
          path: 'runsheetsview/:id',
          name: 'runsheet-view',
          meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true },
          async beforeEnter(to) {
            try {
              const rs = await apiGet(`/tenant/runsheets/${to.params.id}`);
              const hand = !!(rs?.ocr?.latest?.image) || /\(by hand\)/i.test(rs?.title || '');
              if (hand) return { name: 'runsheet-handwritten', params: { slug: to.params.slug, id: to.params.id }, replace: true };
              return { name: 'runsheet-view-official', params: { slug: to.params.slug, id: to.params.id }, replace: true };
            } catch {
              return { name: 'runsheet-view-official', params: { slug: to.params.slug, id: to.params.id }, replace: true };
            }
          },
        },

        // Viewers
        { path: 'runsheetsview/:id/official',     name: 'runsheet-view-official', component: RunSheetSingle, props: true, meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'runsheetsview/:id/handwritten',  name: 'runsheet-handwritten',   component: HandWrittenRunsheet, props: true, meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },

        // Shortcuts
        { path: 'runsheetsview/:id/handwritten/edit', redirect: (to) => ({ name: 'runsheet-by-hand', params: { slug: to.params.slug, id: to.params.id } }) },
        { path: 'runsheetsview/:id/edit-hand',        redirect: (to) => ({ name: 'runsheet-by-hand', params: { slug: to.params.slug, id: to.params.id } }) },
        { path: 'runsheets/:id/handwritten',          redirect: (to) => ({ name: 'runsheet-handwritten', params: { slug: to.params.slug, id: to.params.id } }) },
        { path: 'runsheets/:id/edit-hand',            redirect: (to) => ({ name: 'runsheet-by-hand', params: { slug: to.params.slug, id: to.params.id } }) },

        // Others
        { path: 'suppliers',     name: 'suppliers',     component: Suppliers,      meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'suppliers/new', name: 'supplier-new',  component: SupplierEditor, meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'suppliers/:id', name: 'supplier-edit', component: SupplierEditor, props: true, meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },

        { path: 'people',        name: 'people',        component: People,         meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'people/new',    name: 'person-new',    component: PeopleEditor,   meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'people/:id',    name: 'person-edit',   component: PeopleEditor,   props: true, meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },

        { path: 'sets',          name: 'sets',          component: SetsList,       meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'sets/new',      name: 'set-new',       component: SetEditor,      meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'sets/:id',      name: 'set-edit',      component: SetEditor,      props: true, meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },

        { path: 'driver',        name: 'driver',        component: Driver,         meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'items',         name: 'items',         component: Items,          meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },
        { path: 'places',        name: 'places',        component: Places,         meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true } },

        // Admin management (tenant)
        { path: 'adminusers',    name: 'admin-users',   component: AdminUsers,     meta: { requiresAuth: true, requiresMembership: true, requiresAuthorized: true, requiresAdmin: true } },
      ],
    },

    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

/* ---------------- global guard ---------------- */
router.beforeEach(async (to) => {
  const q = to.query || {};
  const tokenQ = typeof q.token === 'string' ? q.token : '';

  // ⛔ Only treat ?token= as an OAuth handoff IF we are NOT on set-password routes.
  const isSetPasswordRoute =
    to.name === 'set-password' || to.name === 'tenant-set-password';

  if (tokenQ && !isSetPasswordRoute) {
    setTokenAndNotify(tokenQ);
    const rParam = typeof q.r === 'string' && q.r ? q.r : '';
    const ownerLike = to.path.startsWith('/owner') || q.owner === '1';
    const nextPath =
      rParam ||
      (ownerLike ? '/owner'
                 : (to.params?.slug ? `/${String(to.params.slug)}` : '/'));
    const nextQuery = { ...q }; delete nextQuery.token; delete nextQuery.r; delete nextQuery.owner;
    return { path: nextPath, query: nextQuery, replace: true };
  }

  // 1) Owner area
  const isOwnerRoute = to.meta?.ownerArea || to.path.startsWith('/owner');
  if (isOwnerRoute) {
    enterOwnerMode(router, to.fullPath);
    if (to.meta?.guestOnlyOwner && isAuthed()) return { name: 'owner-home', replace: true };
    if (to.meta?.requiresAuth && !isAuthed()) return { name: 'owner-login', query: { r: to.fullPath }, replace: true };
    return true;
  }

  // 2) Tenant area
  const isTenant = !!to.params?.slug;
  if (!isTenant) return true;

  const slug = String(to.params.slug);
  enterTenantMode(router, slug, to.fullPath);

  // Resolve pid (and hydrate access cache once)
  let pid = localStorage.getItem('currentProductionId') || '';
  if (!pid) {
    try { pid = await ensurePidAndAccessForSlug(slug); }
    catch { return { path: '/', replace: true }; }
  }

  // guest pages
  if (to.meta?.guestOnlyTenant) {
    if (to.meta?.allowAuthed) return true; // let authed users view (e.g., set-password)
    if (isAuthed() && hasTenantAccess(pid)) {
      return { name: 'tenant-home', params: { slug }, replace: true };
    }
    return true;
  }

  // auth gate
  if (to.meta?.requiresAuth && !isAuthed()) {
    return { name: 'tenant-login', params: { slug }, query: { r: to.fullPath }, replace: true };
  }

  // membership/authorization/admin gates
  if (to.meta?.requiresMembership && !hasTenantAccess(pid)) {
    try {
      const me = await apiGet('/tenant/tenantauth/me', undefined, { headers: { 'X-Production-Id': pid } });
      const access = {
        isMember: true,
        owner: !!me?.owner,
        role: me?.role || (me?.member?.role) || 'user',
        siteAuthorized: !!(me?.member?.siteAuthorized) || !!me?.owner,
        authorized: !!(me?.owner || me?.member?.siteAuthorized),
      };
      setAccessForPid(pid, access);
    } catch {}
    if (!hasTenantAccess(pid)) {
      return { name: 'tenant-login', params: { slug }, query: { r: to.fullPath, err: 'not-authorized' }, replace: true };
    }
  }

  if (to.meta?.requiresAuthorized && !hasTenantAccess(pid, { requireAuthorized: true })) {
    return { name: 'tenant-login', params: { slug }, query: { r: to.fullPath, err: 'not-authorized' }, replace: true };
  }

  if (to.meta?.requiresAdmin && !hasTenantAccess(pid, { requireAuthorized: true, requireAdmin: true })) {
    return { name: 'tenant-home', params: { slug }, query: { err: 'admin-only' }, replace: true };
  }

  return true;
});

export default router;









