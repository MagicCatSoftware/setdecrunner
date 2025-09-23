// client/src/router.js
import { createRouter, createWebHistory } from 'vue-router';
import { apiGet } from './api.js';
import { logout } from './auth.js';

import ProductPage from './views/ProductPage.vue';
import ThankYou from './views/ThankYou.vue';
import SlugLayout from './views/SlugApp.vue';
import TenantLogin from './views/Login.vue';
import Dashboard from './views/Dashboard.vue';
import SetPassword from './views/SetPassword.vue';

// Lazy views
const RunSheets        = () => import('./views/RunSheets.vue');
const RunSheetSingle   = () => import('./views/RunsheetSingle.vue');
const RunSheetEditor   = () => import('./views/RunSheetEditor.vue');
const RunSheetsBeta    = () => import('./views/RunSheetsBeta.vue');

const Suppliers        = () => import('./views/Suppliers.vue');
const SupplierEditor   = () => import('./views/SupplierEditor.vue');

const People           = () => import('./views/People.vue');
const PeopleEditor     = () => import('./views/PeopleEditor.vue');

const SetsList         = () => import('./views/SetsList.vue');
const SetEditor        = () => import('./views/SetEditor.vue');

const Driver           = () => import('./views/Driver.vue');
const Items            = () => import('./views/Items.vue');
const Places           = () => import('./views/Places.vue');
const AdminUsers       = () => import('./views/AdminUsers.vue');

// 🔥 New: Productions screens
const Productions      = () => import('./views/Productions.vue');        // list/switcher
const ProductionEditor = () => import('./views/ProductionEditor.vue');   // create/edit

//Public

const Public = () => import('./views/Public.vue'); 
const Pricing = () => import('./views/Pricing.vue');
const Features = () => import('./views/Features.vue');
const FAQ = () => import('./views/FAQ.vue');
const Purchase = () => import('./views/Purchase.vue');

function getToken() {
  const t = localStorage.getItem('token');
  return t && t !== 'undefined' && t !== 'null' ? t : '';
}

// base64url-safe JWT decode
function decodeJwtPayload(t) {
  try {
    const parts = t.split('.');
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
  if (!payload || (payload.exp && Date.now() >= payload.exp * 1000)) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
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

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', name: 'marketing', component: Public },
    { path: '/thank-you', name: 'thank-you', component: ThankYou },
    {path:'/pricing',name:"pricing",component:Pricing},
    {path:'/purchase',name:"purchase",component:Purchase},
    {path:'/features',name:"features",component:Features},
    {path:'/FAQ',name:"FAQ",component:FAQ},
    // Bypass SPA routing for static files & API — let Nginx handle them

    // 🔓 Global logout (works anywhere)
    {
      path: '/logout',
      name: 'root-logout',
      beforeEnter: () => {
        logout();
        const lastSlug = localStorage.getItem('lastSlug');
        if (lastSlug) return { name: 'tenant-login', params: { slug: lastSlug }, replace: true };
        return { name: 'marketing', replace: true };
      },
    },
    { path: '/set-password', name: 'set-password', component: SetPassword },

    {
      path: '/:slug',
      component: SlugLayout,
      // Validate production before any child renders
      async beforeEnter(to) {
        const slug = String(to.params.slug || '').toLowerCase();
        try {
          const prod = await apiGet(`/productions/by-slug/${encodeURIComponent(slug)}`);
          console.log(prod);
          localStorage.setItem('lastSlug', slug);
          localStorage.setItem('currentProductionId', prod._id);
          return true;
        } catch {
          return { path: '/', replace: true };
        }
      },
      children: [
        {
          path: 'login',
          name: 'tenant-login',
          component: TenantLogin,
          meta: { guestOnlyTenant: true },
        },

        // ✅ Made relative so it nests correctly under /:slug
        {
          path: 'members',
          name: 'tenant-members',
          component: () => import('./views/Members.vue'),
          meta: { requiresAuth: true, requiresMembership: true },
        },
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

        // 🔓 Tenant-scoped logout
        {
          path: 'logout',
          name: 'tenant-logout',
          beforeEnter: (to) => {
            logout(); // clears token/user
            const slug = String(to.params.slug || '');
            return { name: 'marketing', params: { slug }, replace: true };
          },
        },

        // ========== Productions (NEW) ==========
        // List & switch productions (auth only; no membership gate so users can switch)
        {
          path: 'productions',
          name: 'productions',
          component: Productions,
          meta: { requiresAuth: true },
        },
        // Create a new production (likely admin/owner only in the view’s own guard/UI)
        {
          path: 'productions/new',
          name: 'production-new',
          component: ProductionEditor,
          meta: { requiresAuth: true },
        },
        // Edit an existing production by id (or slug depending on your view)
        {
          path: 'productions/:id',
          name: 'production-edit',
          component: ProductionEditor,
          props: true,
          meta: { requiresAuth: true },
        },

        // ========== Existing app screens ==========
        { path: 'runsheets',              name: 'runsheets',       component: RunSheets,      meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheets/new',          name: 'runsheet-new',    component: RunSheetEditor, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheets/:id',          name: 'runsheet-edit',   component: RunSheetEditor, props: true, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheetsview/:id',      name: 'runsheet-view',   component: RunSheetSingle, props: true, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheets/:id/beta',     name: 'runsheet-beta',   component: RunSheetsBeta,  props: true, meta: { requiresAuth: true, requiresMembership: true } },

        { path: 'suppliers',              name: 'suppliers',       component: Suppliers,      meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'suppliers/new',          name: 'supplier-new',    component: SupplierEditor, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'suppliers/:id',          name: 'supplier-edit',   component: SupplierEditor, props: true, meta: { requiresAuth: true, requiresMembership: true } },

        { path: 'people',                 name: 'people',          component: People,         meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'people/new',             name: 'person-new',      component: PeopleEditor,   meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'people/:id',             name: 'person-edit',     component: PeopleEditor,   props: true, meta: { requiresAuth: true, requiresMembership: true } },

        { path: 'sets',                   name: 'sets',            component: SetsList,       meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'sets/new',               name: 'set-new',         component: SetEditor,      meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'sets/:id',               name: 'set-edit',        component: SetEditor,      props: true, meta: { requiresAuth: true, requiresMembership: true } },

        { path: 'driver',                 name: 'driver',          component: Driver,         meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'items',                  name: 'items',           component: Items,          meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'places',                 name: 'places',          component: Places,         meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'adminusers',             name: 'admin-users',     component: AdminUsers,     meta: { requiresAuth: true, requiresMembership: true } },
      ],
    },

    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

// Global guard: enforce auth & membership per production
router.beforeEach((to) => {
  const isTenant = !!to.params?.slug;
  if (!isTenant) return true;

  const slug = String(to.params.slug);
  const prodId = localStorage.getItem('currentProductionId') || '';

  // ✅ Allow tenant logout to pass without checks
  if (to.name === 'tenant-logout') return true;

  // If at /:slug/login and already valid member → go to dashboard
  if (to.meta?.guestOnlyTenant) {
    if (isAuthed() && userHasProduction(prodId)) {
      return { name: 'tenant-home', params: { slug }, replace: true };
    }
    return true;
  }

  if (to.meta?.requiresAuth && !isAuthed()) {
    return { name: 'tenant-login', params: { slug }, query: { r: to.fullPath }, replace: true };
  }

  // Membership gate only when explicitly requested by the route
  if (to.meta?.requiresMembership && !userHasProduction(prodId)) {
    return { name: 'tenant-login', params: { slug }, query: { r: to.fullPath, err: 'not-authorized' }, replace: true };
  }

  return true;
});

export default router;



