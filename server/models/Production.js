// server/models/Production.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const RESERVED = new Set([
  'login','logout','register','signup','pricing','buy','purchase','billing',
  'about','contact','help','support','terms','privacy','dashboard',
  'api','assets','static','auth','users'
]);

/** Per-production member row (authoritative for tenant access) */
const MemberSchema = new Schema(
  {
    // Optional backing ref to a User doc (used throughout the app)
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Role within this production (expanded to match app usage)
    role: {
      type: String,
      enum: ['admin', 'editor', 'viewer', 'coordinator', 'driver', 'user'],
      default: 'editor'
    },

    // 🚦 Admin must flip this to true before tenant access is granted
    siteAuthorized: { type: Boolean, default: false, index: true },

    addedAt: { type: Date, default: Date.now },

    // Login identifier inside the tenant scope
    email:   { type: String, trim: true, lowercase: true, index: true },

    // Per-member credential for tenant login (not selected by default)
    passwordHash: { type: String, select: false },
  },
  { _id: true }
);

export function normalizeSlug(input = '') {
  return String(input)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const ProductionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug:  { type: String, required: true, trim: true, unique: true, index: true },

    // Canonical owner (tenant admin)
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Per-production memberships (authoritative for roles & tenant auth)
    members: { type: [MemberSchema], default: [] },

    // Stripe & flags
    stripe:   { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },

    // Production profile fields (both new + legacy aliases)
    productionphone:   { type: String, trim: true, default: '' },
    productionaddress: { type: String, trim: true, default: '' },
    productioncompany: { type: String, trim: true, default: '' },

    // Legacy/aliases so old code continues to work
    name:    { type: String, trim: true, default: '' },
    phone:   { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    company: { type: String, trim: true, default: '' }
  },
  { timestamps: true }
);

ProductionSchema.pre('validate', function(next) {
  if (this.slug) this.slug = normalizeSlug(this.slug);
  if (!this.slug && this.title) this.slug = normalizeSlug(this.title);
  if (!this.slug) return next(new Error('Slug required'));
  if (RESERVED.has(this.slug)) return next(new Error('Slug is reserved'));
  next();
});

// Virtuals: normalized getters so callers can use either style
ProductionSchema.virtual('vCompanyName').get(function () {
  return this.productioncompany || this.company || this.productionname || this.name || '';
});
ProductionSchema.virtual('vProductionTitle').get(function () {
  return this.productionname || this.name || '';
});
ProductionSchema.virtual('vPhone').get(function () {
  return this.productionphone || this.phone || '';
});
ProductionSchema.virtual('vAddress').get(function () {
  return this.productionaddress || this.address || '';
});

// Indexes for common lookups
ProductionSchema.index({ 'members.user': 1 });
ProductionSchema.index({ 'members.email': 1 });

export default mongoose.model('Production', ProductionSchema);
