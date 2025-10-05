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
const RunSheetByHand   = () => import('./views/RunsheetByHand.vue');       // canvas/draw page
const HandWrittenRunsheet = () => import('./views/HandWrittenRunsheet.vue'); // view merged image

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

// Productions screens
const Productions      = () => import('./views/Productions.vue');
const ProductionEditor = () => import('./views/ProductionEditor.vue');

// Public
const Public   = () => import('./views/Public.vue');
const Pricing  = () => import('./views/Pricing.vue');
const Features = () => import('./views/Features.vue');
const FAQ      = () => import('./views/FAQ.vue');
const Purchase = () => import('./views/Purchase.vue');

function getToken() {
  const t = localStorage.getItem('token');
  return t && t !== 'undefined' && t !== 'null' ? t : '';
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
    { path: '/pricing', name: 'pricing', component: Pricing },
    { path: '/purchase', name: 'purchase', component: Purchase },
    { path: '/features', name: 'features', component: Features },
    { path: '/FAQ', name: 'FAQ', component: FAQ },

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
      async beforeEnter(to) {
        const slug = String(to.params.slug || '').toLowerCase();
        try {
          const prod = await apiGet(`/productions/by-slug/${encodeURIComponent(slug)}`);
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
            logout();
            const slug = String(to.params.slug || '');
            return { name: 'marketing', params: { slug }, replace: true };
          },
        },

        // Productions
        { path: 'productions', name: 'productions', component: Productions, meta: { requiresAuth: true } },
        { path: 'productions/new', name: 'production-new', component: ProductionEditor, meta: { requiresAuth: true } },
        { path: 'productions/:id', name: 'production-edit', component: ProductionEditor, props: true, meta: { requiresAuth: true } },

        // Runsheets (typed/official)
        { path: 'runsheets',            name: 'runsheets',        component: RunSheets,      meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheets/new',        name: 'runsheet-new',     component: RunSheetEditor, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheets/:id',        name: 'runsheet-edit',    component: RunSheetEditor, props: true, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'runsheets/:id/beta',   name: 'runsheet-beta',    component: RunSheetsBeta,  props: true, meta: { requiresAuth: true, requiresMembership: true } },

        // ✍️ Draw/write by hand (canvas)
        { path: 'runsheets/:id/by-hand', name: 'runsheet-by-hand', component: RunSheetByHand, props: true, meta: { requiresAuth: true, requiresMembership: true } },

        // Smart "view" router: decides viewer and redirects accordingly
        {
          path: 'runsheetsview/:id',
          name: 'runsheet-view',
          meta: { requiresAuth: true, requiresMembership: true },
          async beforeEnter(to) {
            try {
              const rs = await apiGet(`/tenant/runsheets/${to.params.id}`);
              const hand =
                !!(rs?.ocr?.latest?.image) ||
                /\(by hand\)/i.test(rs?.title || '');
              if (hand) {
                return { name: 'runsheet-handwritten', params: { slug: to.params.slug, id: to.params.id }, replace: true };
              }
              return { name: 'runsheet-view-official', params: { slug: to.params.slug, id: to.params.id }, replace: true };
            } catch {
              return { name: 'runsheet-view-official', params: { slug: to.params.slug, id: to.params.id }, replace: true };
            }
          },
        },

        // Official/normal viewer
        {
          path: 'runsheetsview/:id/official',
          name: 'runsheet-view-official',
          component: RunSheetSingle,
          props: true,
          meta: { requiresAuth: true, requiresMembership: true },
        },

        // 📝 Handwritten image viewer
        {
          path: 'runsheetsview/:id/handwritten',
          name: 'runsheet-handwritten',
          component: HandWrittenRunsheet,
          props: true,
          meta: { requiresAuth: true, requiresMembership: true },
        },

        // -------------------------
        // ✅ NEW: friendly aliases so "Edit Handwriting" works from anywhere
        // -------------------------

        // 1) From the handwritten viewer, /handwritten/edit → the canvas editor
        { path: 'runsheetsview/:id/handwritten/edit',
          name: 'runsheet-handwritten-edit',
          redirect: (to) => ({ name: 'runsheet-by-hand', params: { slug: to.params.slug, id: to.params.id } })
        },

        // 2) Short alias under runsheetsview
        { path: 'runsheetsview/:id/edit-hand',
          redirect: (to) => ({ name: 'runsheet-by-hand', params: { slug: to.params.slug, id: to.params.id } })
        },

        // 3) Optional mirror path under /runsheets for viewing the merged image
        { path: 'runsheets/:id/handwritten',
          redirect: (to) => ({ name: 'runsheet-handwritten', params: { slug: to.params.slug, id: to.params.id } })
        },

        // 4) Another short alias to the editor
        { path: 'runsheets/:id/edit-hand',
          redirect: (to) => ({ name: 'runsheet-by-hand', params: { slug: to.params.slug, id: to.params.id } })
        },

        // Suppliers, People, Sets, etc
        { path: 'suppliers',        name: 'suppliers',     component: Suppliers,      meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'suppliers/new',    name: 'supplier-new',  component: SupplierEditor, meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'suppliers/:id',    name: 'supplier-edit', component: SupplierEditor, props: true, meta: { requiresAuth: true, requiresMembership: true } },

        { path: 'people',           name: 'people',        component: People,         meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'people/new',       name: 'person-new',    component: PeopleEditor,   meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'people/:id',       name: 'person-edit',   component: PeopleEditor,   props: true, meta: { requiresAuth: true, requiresMembership: true } },

        { path: 'sets',             name: 'sets',          component: SetsList,       meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'sets/new',         name: 'set-new',       component: SetEditor,      meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'sets/:id',         name: 'set-edit',      component: SetEditor,      props: true, meta: { requiresAuth: true, requiresMembership: true } },

        { path: 'driver',           name: 'driver',        component: Driver,         meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'items',            name: 'items',         component: Items,          meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'places',           name: 'places',        component: Places,         meta: { requiresAuth: true, requiresMembership: true } },
        { path: 'adminusers',       name: 'admin-users',   component: AdminUsers,     meta: { requiresAuth: true, requiresMembership: true } },
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

  if (to.name === 'tenant-logout') return true;

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
    return { name: 'tenant-login', params: { slug }, query: { r: to.fullPath, err: 'not-authorized' }, replace: true };
  }

  return true;
});

export default router;



