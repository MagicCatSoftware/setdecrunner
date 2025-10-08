// client/src/stores/tenant.js
import { defineStore } from 'pinia';
import axios from 'axios';

const LS_KEY = 'setdec_tenant_state_v1';

export const useTenant = defineStore('tenant', {
  state: () => ({
    // Tenant context
    productionId: null,   // Mongo ObjectId string
    slug: '',             // optional (pretty URL)

    // Tenant session (separate from site auth)
    tenantToken: '',      // JWT from /api/tenant/login
    role: '',             // e.g. 'admin', 'driver', ...
    kind: '',             // 'owner' | 'member'

    // Cached details
    productionTitle: '',
    loading: false,
    error: '',
  }),

  getters: {
    isAuthed: (s) => !!s.tenantToken && !!s.productionId,
    isOwner:  (s) => s.kind === 'owner',
    isAdmin:  (s) => s.isOwner || s.role?.toLowerCase() === 'admin',
    headers:  (s) => {
      const h = {};
      if (s.productionId) h['x-production-id'] = s.productionId;
      if (s.tenantToken) h['Authorization'] = `Bearer ${s.tenantToken}`;
      return h;
    },
  },

  actions: {
    /* -------------------- persistence -------------------- */
    _save() {
      const { productionId, slug, tenantToken, role, kind, productionTitle } = this;
      localStorage.setItem(LS_KEY, JSON.stringify({ productionId, slug, tenantToken, role, kind, productionTitle }));
    },
    _load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const obj = JSON.parse(raw);
        Object.assign(this, obj || {});
      } catch { /* ignore */ }
    },
    _clear() {
      localStorage.removeItem(LS_KEY);
    },

    /* -------------------- boot -------------------- */
    init() {
      this._load();
      // Optional sanity: drop obviously broken token
      if (this.tenantToken && !this.productionId) {
        this.tenantToken = '';
        this.role = '';
        this.kind = '';
        this._save();
      }
      this._installAxiosInterceptor();
    },

    /* -------------------- axios helper -------------------- */
    _api() {
      return axios.create({
        baseURL: '/api',
        headers: this.headers,
      });
    },
    _installAxiosInterceptor() {
      // Put a global request interceptor once (idempotent)
      if (axios.__setdecTenantInstalled) return;
      axios.__setdecTenantInstalled = true;

      axios.interceptors.request.use((config) => {
        // Inject headers on all axios calls (including those not using _api())
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) {
            const { productionId, tenantToken } = JSON.parse(raw);
            if (productionId) config.headers['x-production-id'] = productionId;
            if (tenantToken) config.headers['Authorization'] = `Bearer ${tenantToken}`;
          }
        } catch { /* ignore */ }
        return config;
      });
    },

    /* -------------------- context setters -------------------- */
    setProductionId(id) {
      this.productionId = id || null;
      this._save();
    },
    setSlug(slug) {
      this.slug = slug || '';
      this._save();
    },

    /* -------------------- server helpers -------------------- */
    // Optional convenience endpoint if you expose /api/tenant/resolve/:slug
    async resolveBySlug(slug) {
      this.loading = true; this.error = '';
      try {
        const { data } = await this._api().get(`/tenant/resolve/${encodeURIComponent(slug)}`);
        // Expect: { productionId, title? }
        if (!data?.productionId) throw new Error('Resolution failed');
        this.productionId = data.productionId;
        this.slug = slug;
        this.productionTitle = data.title || '';
        this._save();
        return { productionId: data.productionId, title: data.title || '' };
      } catch (e) {
        this.error = e?.response?.data?.error || e.message || 'Failed to resolve slug';
        throw e;
      } finally {
        this.loading = false;
      }
    },

    async login({ email, password }) {
      if (!this.productionId) throw new Error('No production selected');
      this.loading = true; this.error = '';
      try {
        const { data } = await this._api().post('/tenant/login', {
          productionId: this.productionId, email, password,
        });
        // Expect: { token, kind, role? }
        this.tenantToken = data.token || '';
        this.kind = data.kind || '';
        this.role = data.role || (this.kind === 'owner' ? 'admin' : '');
        this._save();
        return { kind: this.kind, role: this.role };
      } catch (e) {
        this.error = e?.response?.data?.error || e.message || 'Login failed';
        throw e;
      } finally {
        this.loading = false;
      }
    },

    async me() {
      if (!this.tenantToken) return null;
      this.loading = true; this.error = '';
      try {
        const { data } = await this._api().get('/tenant/me');
        // Expect: { prodId, kind, role, ok: true }
        this.kind = data.kind || this.kind;
        this.role = data.role || this.role;
        this._save();
        return data;
      } catch (e) {
        // If token invalid, drop it silently
        this.tenantToken = '';
        this.role = '';
        this.kind = '';
        this._save();
        return null;
      } finally {
        this.loading = false;
      }
    },

    async changePassword({ oldPassword, newPassword }) {
      if (!this.tenantToken) throw new Error('Not logged in');
      this.loading = true; this.error = '';
      try {
        const { data } = await this._api().post('/tenant/password', { oldPassword, newPassword });
        return data?.ok === true;
      } catch (e) {
        this.error = e?.response?.data?.error || e.message || 'Password change failed';
        throw e;
      } finally {
        this.loading = false;
      }
    },

    logout() {
      this.tenantToken = '';
      this.role = '';
      this.kind = '';
      this._save();
    },

    // Utility: wipe everything tenant-related (for debugging)
    resetAll() {
      this.productionId = null;
      this.slug = '';
      this.tenantToken = '';
      this.role = '';
      this.kind = '';
      this.productionTitle = '';
      this._clear();
    },
  },
});