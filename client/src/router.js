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

// Productions
const Productions            = () => import('./views/Productions.vue');
const ProductionEditor       = () => import('./views/ProductionEditor.vue');

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
    if (parts.length !== 3) return null; // opaque/non-JWT
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch { return null; }
}
/** token missing => false; expired JWT => false (and clear); opaque/non-expiring => true */
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
function userHasProduction(prodId) {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user || !prodId) return false;
    const list = user.productionIds || (user.productionId ? [user.productionId] : []);
    return Array.isArray(list) && list.map(String).includes(String(prodId));
  } catch { return false; }
}

/* Hard logout that never fails */
function hardLogout() {
  try { softLogout?.(); } catch {}
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentProductionId');
  } catch {}
  try { api.setProductionId?.(''); } catch {}
  try { api.setUnauthorizedHandler?.(null); } catch {}

  // Nudge any UI listeners
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

/* Resolve pid & hydrate user for a slug (de-duped) */
const _pidPromises = new Map();
async function ensurePidAndUserForSlug(slug) {
  const existing = localStorage.getItem('currentProductionId') || '';
  if (existing) return existing;

  if (_pidPromises.has(slug)) return _pidPromises.get(slug);

  const p = (async () => {
    // 1) Resolve pid WITHOUT Authorization
    const prod = await apiGet(`/productions/by-slug/${encodeURIComponent(slug)}`, undefined, {
      headers: { Authorization: '' },
    });
    const pid = String(prod._id || '');

    // 2) Persist + set
    try { localStorage.setItem('lastSlug', slug); } catch {}
    try { localStorage.setItem('currentProductionId', pid); } catch {}
    try { api.setProductionId?.(pid); } catch {}

    // 3) If authed, hydrate /auth/me once so membership is fresh
    if (isAuthed()) {
      try {
        const me = await apiGet('/auth/me');
        try { localStorage.setItem('user', JSON.stringify(me)); } catch {}
      } catch {
        // ignore; unauthorized handler will take care of redirect on next API call if needed
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

    // Owner area
    { path: '/owner/login', name: 'owner-login', component: OwnerLogin, meta: { guestOnlyOwner: true, ownerArea: true } },
    {
      path: '/owner/logout',
      name: 'owner-logout',
      beforeEnter: () => { hardLogout(); return { name: 'owner-login', replace: true }; },
    },
    { path: '/owner', name: 'owner-home', component: OwnerDashboard, meta: { requiresAuth: true, ownerArea: true } },
    {
      path: '/owner/productions/:id',
      name: 'owner-production-edit',
      component: OwnerProductionEditor,
      props: true,
      meta: { requiresAuth: true, ownerArea: true },
    },

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

    { path: '/set-password', name: 'set-password', component: SetPassword },

    // Tenant area
    {
      path: '/:slug',
      component: SlugLayout,
      async beforeEnter(to) {
        const slug = String(to.params.slug || '').toLowerCase();
        try {
          await ensurePidAndUserForSlug(slug);
          enterTenantMode(router, slug, to.fullPath);
          return true;
        } catch {
          return { path: '/', replace: true };
        }
      },
      children: [
        { path: 'login', name: 'tenant-login', component: TenantLogin, meta: { guestOnlyTenant: true } },
        {
          path: '',
          name: 'tenant-home',
          component: Dashboard,
          meta: { requiresAuth: true, requiresMembership: true },
          beforeEnter: (to) => {
            const slug = String(to.params.slug || '');
            if (!isAuthed()) {
              return { name: 'tenant-login', params: { slug }, query: { r: `/${slug}` }, replace: true };
            }
            return true;
          },
        },
        {
          path: 'logout',
          name: 'tenant-logout',
          beforeEnter: (to) => {
            const slug = String(to.params.slug || '');
            hardLogout();
            return { name: 'tenant-login', params: { slug }, replace: true };
          },
        },

        // Productions
        { path: 'productions', name: 'productions', component: Productions, meta: { requiresAuth: true } },
        { path: 'productions/new', name: 'production-new', component: ProductionEditor, meta: { requiresAuth: true } },
        { path: 'productions/:id', name: 'production-edit', component: ProductionEditor, props: true, meta: { requiresAuth: true } },

        // Runsheets
        { path: 'runsheets',            name: 'runsheets',        component: RunSheets,      meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheets/new',        name: 'runsheet-new',     component: RunSheetEditor, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheets/:id',        name: 'runsheet-edit',    component: RunSheetEditor, props: true, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheets/:id/beta',   name: 'runsheet-beta',    component: RunSheetsBeta,  props: true, meta: { requiresAuth: true, requiresMembership: true } },

        // Canvas
        { path: 'runsheets/:id/by-hand', name: 'runsheet-by-hand', component: RunSheetByHand, props: true, meta: { requiresAuth: true, requiresMembership: true } },

        // Smart view
        {
          path: 'runsheetsview/:id',
          name: 'runsheet-view',
          meta: { requiresAuth: true, requiresMembership: true },
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
        { path: 'runsheetsview/:id/official',     name: 'runsheet-view-official', component: RunSheetSingle, props: true, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheetsview/:id/handwritten',  name: 'runsheet-handwritten',   component: HandWrittenRunsheet, props: true, meta: { requiresAuth: true, requiresMembership: true } },

        // Shortcuts
        { path: 'runsheetsview/:id/handwritten/edit', redirect: (to) => ({ name: 'runsheet-by-hand', params: { slug: to.params.slug, id: to.params.id } }) },
        { path: 'runsheetsview/:id/edit-hand',        redirect: (to) => ({ name: 'runsheet-by-hand', params: { slug: to.params.slug, id: to.params.id } }) },
        { path: 'runsheets/:id/handwritten',          redirect: (to) => ({ name: 'runsheet-handwritten', params: { slug: to.params.slug, id: to.params.id } }) },
        { path: 'runsheets/:id/edit-hand',            redirect: (to) => ({ name: 'runsheet-by-hand', params: { slug: to.params.slug, id: to.params.id } }) },

        // Others
        { path: 'suppliers',     name: 'suppliers',     component: Suppliers,      meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'suppliers/new', name: 'supplier-new',  component: SupplierEditor, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'suppliers/:id', name: 'supplier-edit', component: SupplierEditor, props: true, meta: { requiresAuth: true, requiresMembership: true } },

        { path: 'people',        name: 'people',        component: People,         meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'people/new',    name: 'person-new',    component: PeopleEditor,   meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'people/:id',    name: 'person-edit',   component: PeopleEditor,   props: true, meta: { requiresAuth: true, requiresMembership: true } },

        { path: 'sets',          name: 'sets',          component: SetsList,       meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'sets/new',      name: 'set-new',       component: SetEditor,      meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'sets/:id',      name: 'set-edit',      component: SetEditor,      props: true, meta: { requiresAuth: true, requiresMembership: true } },

        { path: 'driver',        name: 'driver',        component: Driver,         meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'items',         name: 'items',         component: Items,          meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'places',        name: 'places',        component: Places,         meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'adminusers',    name: 'admin-users',   component: AdminUsers,     meta: { requiresAuth: true, requiresMembership: true } },
      ],
    },

    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

/* ---------------- global guard ---------------- */
router.beforeEach(async (to) => {
  // 0) OAuth handoff catcher (persist ?token=… once)
  const q = to.query || {};
  const tokenQ = typeof q.token === 'string' ? q.token : '';
  if (tokenQ) {
    setTokenAndNotify(tokenQ);

    const rParam = typeof q.r === 'string' && q.r ? q.r : '';
    const ownerLike = to.path.startsWith('/owner') || q.owner === '1';
    const nextPath =
      rParam ||
      (ownerLike ? '/owner'
                 : (to.params?.slug ? `/${String(to.params.slug)}` : '/'));

    const nextQuery = { ...q };
    delete nextQuery.token;
    delete nextQuery.r;
    delete nextQuery.owner;

    return { path: nextPath, query: nextQuery, replace: true };
  }

  // 1) Owner area
  const isOwnerRoute = to.meta?.ownerArea || to.path.startsWith('/owner');
  if (isOwnerRoute) {
    enterOwnerMode(router, to.fullPath);

    if (to.meta?.guestOnlyOwner && isAuthed()) {
      return { name: 'owner-home', replace: true };
    }
    if (to.meta?.requiresAuth && !isAuthed()) {
      return { name: 'owner-login', query: { r: to.fullPath }, replace: true };
    }
    return true;
  }

  // 2) Tenant area
  const isTenant = !!to.params?.slug;
  if (!isTenant) return true;

  const slug = String(to.params.slug);
  enterTenantMode(router, slug, to.fullPath);

  // ensure pid + user hydrated before checks
  let prodId = localStorage.getItem('currentProductionId') || '';
  if (!prodId) {
    try { prodId = await ensurePidAndUserForSlug(slug); }
    catch { return { path: '/', replace: true }; }
  }

  if (to.meta?.guestOnlyTenant) {
    if (isAuthed() && userHasProduction(prodId)) {
      return { name: 'tenant-home', params: { slug }, replace: true };
    }
    return true;
  }

  if (to.meta?.requiresAuth && !isAuthed()) {
    return { name: 'tenant-login', params: { slug }, query: { r: to.fullPath }, replace: true };
  }

  if (to.meta?.requiresMembership && !userHasProduction(prodId)) {
    // try one hydration (in case user cache is stale)
    try {
      const me = await apiGet('/auth/me');
      try { localStorage.setItem('user', JSON.stringify(me)); } catch {}
    } catch {}
    if (!userHasProduction(prodId)) {
      return { name: 'tenant-login', params: { slug }, query: { r: to.fullPath, err: 'not-authorized' }, replace: true };
    }
  }

  return true;
});

export default router;







