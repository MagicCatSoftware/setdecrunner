<!-- client/src/views/RunSheetSingle.vue -->
<template>
  <div class="page">
    <!-- Hide NavBar on print -->
    <div class="no-print">
      <NavBar :me="me" />
    </div>

    <div class="sheet-wrap">
      <!-- IMPORTANT: ref used for print capture -->
      <div class="sheet" ref="sheetEl">
        <!-- Header -->
        <div class="row header">
          <div class="h-left">
            <!-- 🔹 PURCHASE / RENTAL driven by rs.purchaseType -->
            <div class="label">
              {{ purchaseRentalLabel || 'PURCHASE / RENTAL' }}:
            </div>
          </div>
          <div class="h-center">
            <div class="title">SET DECORATION</div>
            <div class="subtitle">TRANSPORT / RENTAL</div>
          </div>
          <div class="h-right">
            <!-- 🔹 Set name -->
            <div class="line-pair">
              <span>Set:&nbsp;</span>
              <span class="line">{{ setName || ' ' }}</span>
            </div>
            <!-- 🔹 Set number (not runsheet id) -->
            <div class="line-pair">
              <span>Set #&nbsp;</span>
              <span class="line line--short">{{ setNumber || ' ' }}</span>
            </div>
          </div>
        </div>

        <!-- Pick/Return dates -->
        <div class="row dates">
          <div class="half">
            <span class="box" :class="{checked: !!rs?.pickupDate}"></span>
            <span>Pick-Up Date:&nbsp;</span><span class="line">{{ fmt(rs?.pickupDate) || ' ' }}</span>
          </div>
          <div class="half">
            <span class="box" :class="{checked: !!rs?.returnDate}"></span>
            <span>Return Date:&nbsp;</span><span class="line">{{ fmt(rs?.returnDate) || ' ' }}</span>
          </div>
        </div>

        <!-- Address / Supplier -->
        <div class="row addr-supplier">
          <!-- Production company block -->
          <div class="panel addr">
            <div class="addr-line strong">{{ companyBlock.name }}</div>
            <div class="addr-line" v-if="companyBlock.showTitle">"{{ companyBlock.title }}"</div>
            <div class="addr-line" v-if="companyBlock.address">{{ companyBlock.address }}</div>
            <div class="addr-line" v-if="companyBlock.phone">{{ companyBlock.phone }}</div>
          </div>
          <!-- Supplier -->
          <div class="panel supplier">
            <div class="field"><span class="label-sm">SUPPLIER:</span><span class="fill">{{ supplierName }}</span></div>
            <div class="field"><span class="fill">{{ supplierLine2 }}</span></div>
            <div class="field"><span class="fill">{{ supplierLine3 }}</span></div>
            <div class="field"><span class="fill">{{ supplierLine4 }}</span></div>
            <div class="field"><span class="label-sm">TEL:</span><span class="fill">{{ supplierPhone }}</span></div>
            <div class="field">
              <span class="label-sm">CONTACT:</span><span class="fill">{{ supplierContact }}</span>
              <span class="label-sm hrs">HOURS</span><span class="fill fill--hrs">{{ supplierHours }}</span>
            </div>
          </div>
        </div>

        <!-- Items table -->
        <div class="table">
          <div class="thead">
            <div class="th th-item">ITEM</div>
            <div class="th th-desc">DESCRIPTION</div>
          </div>
          <div class="tbody">
            <div class="tr" v-for="(row, i) in tableRows" :key="i">
              <div class="td td-item">{{ row.item }}</div>
              <div class="td td-desc">{{ row.desc }}</div>
            </div>
          </div>
        </div>

        <!-- Destination + Contacts + Purchase/Payment -->
        <div class="row lower">
          <!-- Destination choices -->
          <div class="panel dest">
            <div class="checkline">
              <span class="box" :class="{checked: rs?.postLocation==='hold_on_truck'}"></span>
              <span>HOLD ON TRUCK</span>
            </div>
            <div class="checkline">
              <span class="box" :class="{checked: rs?.postLocation==='setdec_storage'}"></span>
              <span>SET DEC STORAGE</span>
              <span class="fillline"></span>
            </div>
            <div class="checkline">
              <span class="box" :class="{checked: rs?.postLocation==='office'}"></span>
              <span>OFFICE</span>
              <span class="fillline"></span>
            </div>
            <div class="checkline">
              <span class="box" :class="{checked: rs?.postLocation==='address_below'}"></span>
              <span>ADDRESS BELOW</span>
              <span class="fillline">{{ rs?.postLocation==='address_below' ? (rs?.postAddress || '') : '' }}</span>
            </div>
          </div>

          <!-- Contacts -->
          <div class="panel contacts">
            <div v-for="p in contactRows" :key="p.key" class="contact">
              <span class="box" :class="{ checked: p.isPrimary }"></span>
              <span class="name">{{ p.name }}</span>
              <span v-if="p.role" class="role">({{ p.role }})</span>
              <span v-if="p.phone || p.email" class="sep"> — </span>
              <span v-if="p.phone" class="phone">{{ p.phone }}</span>
              <span v-if="p.phone && p.email" class="dot"> · </span>
              <span v-if="p.email" class="email">{{ p.email }}</span>
            </div>

            <div v-if="!contactRows.length" class="contact">
              <span class="box"></span>
              <span class="name">No contacts</span>
            </div>
          </div>

          <!-- Purchase / Payment -->
          <div class="panel pay">
            <div class="pay-grid">
              <div class="cell">
                <div class="mini">GET INVOICE</div>
                <div class="inline">
                  <span>YES</span><span class="box" :class="{checked: !!rs?.getInvoice}"></span>
                  <span class="gap"></span>
                  <span>NO</span><span class="box" :class="{checked: rs && !rs.getInvoice}"></span>
                </div>
              </div>

              <div class="cell">
                <div class="mini">GET DEPOSIT</div>
                <div class="inline">
                  <span>YES</span><span class="box" :class="{checked: !!rs?.getDeposit}"></span>
                  <span class="gap"></span>
                  <span>NO</span><span class="box" :class="{checked: rs && !rs.getDeposit}"></span>
                </div>
              </div>

              <div class="cell">
                <div class="mini">PAID</div>
                <span class="box" :class="{checked: !!rs?.paid}"></span>
              </div>

              <div class="cell wide">
                <div class="mini">CHEQUE #</div>
                <div class="uline">{{ rs?.chequeNumber || ' ' }}</div>
              </div>

              <div class="cell">
                <div class="mini">PO.#</div>
                <div class="uline">{{ rs?.poNumber || ' ' }}</div>
              </div>

              <div class="cell wide">
                <div class="mini">CHEQUE / CASH REC’D BY</div>
                <div class="uline">{{ rs?.paymentReceivedBy || rs?.receivedBy || ' ' }}</div>
              </div>

              <div class="cell">
                <div class="mini">AMOUNT</div>
                <div class="uline">{{ money(rs?.amount) || ' ' }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- PU/Delivering + Return/Drop Off -->
        <div class="row actions">
          <div class="panel act">
            <div class="cap">
              <span class="opt">PICK UP</span>
              <span class="box" :class="{ checked: rs?.pdType === 'pickup' }"></span>

              <span class="sp"></span>

              <span class="opt">DELIVERING</span>
              <span class="box" :class="{ checked: rs?.pdType === 'delivering' }"></span>

              <span class="sp"></span>

              <span class="opt">TAKE CHEQUE</span>
              <span class="box" :class="{ checked: rs?.pdPaymentMethod === 'cheque' }"></span>

              <span class="sp"></span>

              <span class="opt">CASH</span>
              <span class="box" :class="{ checked: rs?.pdPaymentMethod === 'cash' }"></span>
            </div>
            <div class="line-row">
              <span class="mini">DATE:</span><span class="line">{{ fmt(rs?.pdDate) || ' ' }}</span>
              <span class="mini">TIME:</span><span class="line line--short">{{ rs?.pdTime || ' ' }}</span>
            </div>
            <div class="line-row">
              <span class="mini">INSTRUCTIONS:</span><span class="line line--grow">{{ rs?.pdInstructions || ' ' }}</span>
            </div>
            <div class="line-row">
              <span class="mini">COMPLETED BY:</span><span class="line">{{ userLabel(rs?.pdCompletedBy) || ' ' }}</span>
              <span class="mini">DATE:</span><span class="line line--short">{{ fmt(rs?.pdCompletedOn) || ' ' }}</span>
            </div>
          </div>

          <div class="panel act">
            <div class="cap">
              RETURN / DROP OFF

              <span class="sp"></span>

              <span class="opt">PU</span>
              <span class="box" :class="{ checked: rs?.rdType === 'pu' }"></span>

              <span class="sp"></span>

              <span class="opt">TAKE</span>
              <span class="box" :class="{ checked: rs?.rdType === 'take' }"></span>

              <span class="sp"></span>

              CHEQUE
              <span class="box" :class="{ checked: !!rs?.rdCheque }"></span>
            </div>
            <div class="line-row">
              <span class="mini">DATE:</span><span class="line">{{ fmt(rs?.rdDate) || ' ' }}</span>
              <span class="mini">TIME:</span><span class="line line--short">{{ rs?.rdTime || ' ' }}</span>
            </div>
            <div class="line-row">
              <span class="mini">INSTRUCTIONS:</span><span class="line line--grow">{{ rs?.rdInstructions || ' ' }}</span>
            </div>
            <div class="line-row">
              <span class="mini">COMPLETED BY:</span><span class="line">{{ userLabel(rs?.rdCompletedBy) || ' ' }}</span>
              <span class="mini">DATE:</span><span class="line line--short">{{ fmt(rs?.rdCompletedOn) || ' ' }}</span>
            </div>
          </div>
        </div>

        <!-- QC / Signature -->
        <div class="row qc panel">
          <div class="mini">ABOVE ITEMS RETURNED IN GOOD CONDITION:</div>
          <span class="line line--short">{{ boolLabel(rs?.qcItemsGood) }}</span>
          <span class="mini">SIGNATURE</span>
          <span class="sigwrap line line--wide">
            <img v-if="rs?.qcSignatureData" :src="rs.qcSignatureData" alt="Signature" />
          </span>
          <span class="mini">DATE:</span>
          <span class="line line--short">{{ fmt(rs?.rdCompletedOn || rs?.pdCompletedOn) || ' ' }}</span>
        </div>
      </div>

      <!-- Bottom Actions -->
      <div class="footer-actions no-print">
        <button class="btn" @click="doPrintImage">Print</button>
        <button class="btn" @click="doPrintImage">Export to PDF</button>
        <button class="btn" @click="shareLink">Share</button>

        <!-- ✅ Correct edit/view links depending on handwriting presence -->
        <RouterLink
          v-if="isHandwritten"
          class="btn btn--primary"
          :to="handEditRoute"
          title="Edit the handwritten canvas (previous strokes preserved)"
        >
          ✍️ Edit Handwriting
        </RouterLink>

        <RouterLink
          v-else
          class="btn btn--primary"
          :to="typedEditRoute"
          title="Edit this runsheet"
        >
          Edit
        </RouterLink>

        <RouterLink
          v-if="isHandwritten"
          class="btn"
          :to="handViewRoute"
          title="View the merged handwritten image"
        >
          View Handwritten
        </RouterLink>

        <span v-if="shareMsg" class="share-msg">{{ shareMsg }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavBar from '../components/NavBar.vue';
import api from '../api.js';
import html2canvas from 'html2canvas';

const route = useRoute();
const router = useRouter();
const slug = computed(() => String(route.params.slug || '').toLowerCase());

const me = ref(null);
const rs = ref(null);
const sheetEl = ref(null);

/* ---------- handwriting presence + routes ---------- */
const hasSavedHand = computed(() => {
  const r = rs.value || {};
  const hand = r.hand || null;
  const hasStrokes = hand && Array.isArray(hand.strokes) && hand.strokes.length;
  return !!hasStrokes;
});
const hasOcrImage = computed(() => !!(rs.value?.ocr?.latest?.image));
const isHandwritten = computed(() => hasSavedHand.value || hasOcrImage.value);

const typedEditRoute = computed(() => ({
  name: 'runsheet-edit',
  params: { slug: slug.value, id: route.params.id },
}));
const handEditRoute = computed(() => ({
  name: 'runsheet-by-hand',
  params: { slug: slug.value, id: route.params.id },
  query:  { restore: '1' },
}));
const handViewRoute = computed(() => ({
  name: 'runsheet-handwritten',
  params: { slug: slug.value, id: route.params.id },
}));

const safeSplitLines = (s) =>
  (s || '')
    .split(/\n|,/)
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 3);

/* ---------------- Company block (from Production) ---------------- */
const production = ref(null);

// Full members list for this production (from /tenant/members)
const membersRaw = ref([]);

// Users referenced in pdCompletedBy / rdCompletedBy (loaded by id)
const completedUsers = ref({});

/**
 * Load a single user by id and cache it in completedUsers
 */
async function loadCompletedUser(id) {
  if (!id) return;

  const key = String(
    typeof id === 'object' && id._id ? id._id : id
  );
  if (!key) return;

  // already loaded for this key
  if (completedUsers.value[key]) return;

  try {
    // 🔧 hits /tenant/tenantusers/:id which returns member-based info
    const u = await api.get(`/tenant/tenantusers/${encodeURIComponent(key)}`);

    // Normalize shape from the route: it returns { userId, memberId, name, displayName, email, phone, role }
    const userId  = String(u.userId || u._id || u.id || key);
    const memberId = u.memberId ? String(u.memberId) : null;

    const norm = {
      _id:        userId,
      name:       u.name || u.displayName || '',
      displayName:u.displayName || u.name || '',
      email:      u.email || '',
      phone:      u.phone || '',
      role:       u.role || ''
    };

    // Store under the key used in the runsheet (pdCompletedBy / rdCompletedBy)
    completedUsers.value[key] = norm;

    // Also store under userId so other lookups by user id work too
    if (userId && userId !== key) {
      completedUsers.value[userId] = norm;
    }

    // Optionally also store under memberId if different
    if (memberId && memberId !== key && memberId !== userId) {
      completedUsers.value[memberId] = norm;
    }
  } catch (e) {
    console.error('Failed to load completed user', key, e);
    // mark as attempted so we don't hammer the API
    completedUsers.value[key] = { _id: key };
  }
}

/**
 * Look at rs.pdCompletedBy / rs.rdCompletedBy and load those users.
 */
async function hydrateCompletedUsers() {
  const r = rs.value || {};
  const ids = [r.pdCompletedBy, r.rdCompletedBy]
    .filter(Boolean)
    .map((v) => (typeof v === 'object' && v._id ? v._id : v))
    .filter(Boolean)
    .map((v) => String(v));

  if (!ids.length) return;

  await Promise.all(ids.map(loadCompletedUser));
}

const companyAddrLines = computed(() =>
  safeSplitLines(
    production.value?.productionaddress ??
    production.value?.vAddress ??
    production.value?.address ??
    ''
  )
);

/* ---------------- Build member map (userId -> {name,email,role}) ---------------- */

// Map userId -> user info (from /tenant/members)
const memberMap = computed(() => {
  const map = {};

  const pushUser = (u, roleHint) => {
    if (!u) return;

    let id = null;
    let name = '';
    let email = '';
    let role = roleHint || '';
    let phone = '';

    if (typeof u === 'string') {
      id = u;
    } else if (typeof u === 'object') {
      id    = u._id ? String(u._id) : null;
      name  = u.name || u.displayName || '';
      email = u.email || '';
      role  = u.role || role;
      phone = u.phone || '';
    }

    if (!id) return;
    const key = String(id);

    const prev = map[key] || {};
    map[key] = {
      _id: key,
      name:  name  || prev.name  || '',
      email: email || prev.email || '',
      role:  role  || prev.role  || '',
      phone: phone || prev.phone || '',
    };
  };

  const arr = Array.isArray(membersRaw.value) ? membersRaw.value : [];

  arr.forEach((m) => {
    // common shapes:
    // { user: { _id, name, email, ... }, role: 'driver' }
    // { _id, name, email, role }  (already user)
    if (m.user) {
      pushUser(m.user, m.role || m.memberRole);
    } else {
      pushUser(m, m.role || m.memberRole);
    }
  });

  return map;
});
/* ---------------- header helpers ---------------- */

async function loadMembers() {
  const prodId = production.value?._id;
  if (!prodId) return;

  try {
    // Our api.get(path, params?, opts?)
    const res = await api.get(
      '/tenant/members',
      {},
      { headers: { 'x-production-id': prodId } }
    );

    let arr = [];
    if (Array.isArray(res)) arr = res;
    else if (res && Array.isArray(res.members)) arr = res.members;
    else if (res && Array.isArray(res.users)) arr = res.users;
    else if (res && Array.isArray(res.data)) arr = res.data;
    else if (res && Array.isArray(res.results)) arr = res.results;

    membersRaw.value = arr || [];
  } catch (e) {
    console.error('Failed to load members for print view', e);
    membersRaw.value = [];
  }
}

// 🔹 PURCHASE vs RENTAL label using schema's purchaseType
const purchaseRentalLabel = computed(() => {
  const pt = rs.value?.purchaseType;
  if (!pt) return '';
  return String(pt).toUpperCase(); // "PURCHASE" or "RENTAL"
});

// 🔹 Set name & set number from populated Set
const setName = computed(() => {
  const v = rs.value?.set;
  if (!v) return '';
  if (typeof v === 'string') return v;  // fallback if not populated
  return v.name || '';
});

const setNumber = computed(() => {
  const v = rs.value?.set;
  if (!v || typeof v === 'string') return '';
  return v.number || '';
});

/* ---------------- supplier (prefer rs.supplier; fallback to takeTo) ---------------- */
const supplierObj = computed(() => {
  const v = rs.value?.supplier ?? rs.value?.takeTo ?? null;
  return (v && typeof v === 'object') ? v : null;
});
const supplierAddressLines = computed(() => safeSplitLines(supplierObj.value?.address || ''));
const supplierName    = computed(() => supplierObj.value?.name || '');
const supplierLine2   = computed(() => supplierAddressLines.value[0] || '');
const supplierLine3   = computed(() => supplierAddressLines.value[1] || '');
const supplierLine4   = computed(() => supplierAddressLines.value[2] || '');
const supplierPhone   = computed(() => supplierObj.value?.phone || '');
const supplierContact = computed(() => supplierObj.value?.contactName || '');
const supplierHours   = computed(() => supplierObj.value?.hours || '');

/* ---------------- items -> table rows ---------------- */
const itemsFlat = computed(() => {
  const out = [];
  (rs.value?.stops || []).forEach(s => {
    (s.items || []).forEach(ri => {
      out.push({
        item: `${ri.name || 'Item'}${ri.quantity ? ' × ' + ri.quantity : ''}`,
        desc: ri.notes || s.place?.name || ''
      });
    });
  });
  (rs.value?.items || []).forEach(it => {
    const qty = it.quantity ?? it.qty;
    out.push({ item: `${it.name || 'Item'}${qty ? ' × ' + qty : ''}`, desc: it.description || '' });
  });
  return out;
});
const MIN_ROWS = 14;
const tableRows = computed(() => {
  const rows = itemsFlat.value.slice(0, 40);
  while (rows.length < MIN_ROWS) rows.push({ item: ' ', desc: ' ' });
  return rows;
});

/* ---------------- contacts ---------------- */
const contactPerson = ref(null);
async function hydrateContactPerson() {
  const v = rs.value?.contact;
  contactPerson.value = null;
  if (!v) return;
  if (typeof v === 'string') {
    try {
      contactPerson.value = await api.get(`/tenant/people/${v}`);
    } catch {
      contactPerson.value = { _id: v, name: `#${v}`, role: '', phone: '', email: '' };
    }
  } else if (typeof v === 'object') {
    contactPerson.value = {
      _id: v._id,
      name: v.name || v.email || '—',
      role: v.role || '',
      phone: v.phone || '',
      email: v.email || ''
    };
  }
}

const normalizeRole = (s) =>
  (typeof s === 'string' && s ? s.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) : '');

/* ---- helper: resolve a user (string id or object) to display info using memberMap ---- */
/* ---- helper: resolve a user (string id or object) to display info ---- */
function resolveUser(u) {
  if (!u) return null;

  // ---------- case 1: string id ----------
  if (typeof u === 'string') {
    const key = String(u);

    // 1) check completedUsers (pdCompletedBy / rdCompletedBy)
    const cu = completedUsers.value[key];
    if (cu) {
      return {
        _id:   String(cu._id || key),
        name:  cu.name || cu.displayName || '',
        email: cu.email || '',
        role:  cu.role || '',
        phone: cu.phone || '',
      };
    }

    // 2) then check memberMap
    const mu = memberMap.value[key];
    if (mu) return { ...mu };

    // 3) fallback: raw id
    return { _id: key, name: `#${key}`, email: '', role: '', phone: '' };
  }

  // ---------- case 2: object ----------
  if (typeof u === 'object') {
    const id = u._id ? String(u._id) : null;

    if (id) {
      // 1) completedUsers
      const cu = completedUsers.value[id];
      if (cu) {
        return {
          _id:   String(cu._id || id),
          name:  cu.name || cu.displayName || '',
          email: cu.email || '',
          role:  cu.role || '',
          phone: cu.phone || '',
        };
      }

      // 2) memberMap
      const mu = memberMap.value[id];
      if (mu) return { ...mu };
    }

    // 3) direct object fallback
    return {
      _id:   id || '',
      name:  u.name || u.displayName || u.email || (id ? `#${id}` : ''),
      email: u.email || '',
      role:  u.role || '',
      phone: u.phone || '',
    };
  }

  return null;
}


const contactRows = computed(() => {
  const rows = [];

  if (contactPerson.value) {
    rows.push({
      key: contactPerson.value._id || 'contact',
      isPrimary: true,
      name: contactPerson.value.name || '—',
      role: contactPerson.value.role || '',
      phone: contactPerson.value.phone || '',
      email: contactPerson.value.email || ''
    });
  }

  const addUserRow = (u, keyLabel) => {
    const info = resolveUser(u);
    if (!info) return;

    rows.push({
      key: keyLabel + ':' + (info._id || info.email || info.name || Math.random().toString(36).slice(2)),
      isPrimary: false,
      name: info.name || info.email || `#${info._id || ''}`,
      role: normalizeRole(info.role),
      phone: info.phone || '',
      email: info.email || ''
    });
  };

  // Assigned driver as a contact row (shows email now)
  addUserRow(rs.value?.assignedTo, 'assignedTo');

  const seen = new Set();
  return rows.filter(r => {
    const id = (r.email || '') + '|' + (r.name || '');
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
});

/* ---------------- misc helpers ---------------- */
function fmt(d){
  if(!d) return '';
  const dt=new Date(d);
  return isNaN(dt)?'':dt.toLocaleDateString();
}
const boolLabel = (v) => (v === true ? 'YES' : v === false ? 'NO' : '—');
const money = (n) => (typeof n === 'number' && isFinite(n))
  ? new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n)
  : '';

/** COMPLETED BY label: prefer email, then name, then #id */
const userLabel = (u) => {
  const info = resolveUser(u);
  if (!info) return '';
  return info.email || info.name || `#${info._id || ''}`;
};

/* ---------------- share/print ---------------- */
const shareMsg = ref('');
const shareUrl = computed(() => `${location.origin}/${slug.value}/runsheetsview/${route.params.id}`);
async function shareLink(){
  const url = shareUrl.value;
  try {
    if (navigator.share) {
      await navigator.share({ title: rs.value?.title || 'Run Sheet', url });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      shareMsg.value = 'Link copied to clipboard';
      setTimeout(() => (shareMsg.value = ''), 2000);
    }
  } catch {}
}

/* ---------------- load ---------------- */
async function loadProduction() {
  if (!slug.value) { production.value = null; return; }
  try {
    const p = await api.get(`/tenant/getproductions/by_slug/${encodeURIComponent(slug.value)}`);
    production.value = await api.get(`/tenant/productions/${p._id}`);
  } catch {
    production.value = null;
  }
}

// Normalize any multiline/CSV address into one clean line
function normalizeAddress(raw) {
  if (!raw) return '';
  const parts = String(raw)
    .replace(/\r\n/g, '\n')
    .split(/\n|,/)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.join(', ').replace(/\s*,\s*,+/g, ', ').replace(/\s{2,}/g, ' ').trim();
}

// Prefer new schema fields; fall back to virtuals; then legacy fields
const companyBlock = computed(() => {
  const p = production.value || {};
  const name =
    p.productioncompany ??
    p.vCompanyName ??
    p.company ??
    p.title ??
    ' ';
  const title = p.title ?? p.vProductionTitle ?? '';
  const address = normalizeAddress(
    p.productionaddress ??
    p.vAddress ??
    p.address ??
    ''
  );
  const phone = p.productionphone ?? p.vPhone ?? p.phone ?? '';
  return {
    name,
    title,
    showTitle: !!title && title !== name,
    address,
    phone
  };
});

onMounted(async () => {
  try { me.value = await api.get('/tenant/tenantauth/me'); } catch {}

  await loadProduction();
   await loadMembers();   

  const data = await api.get(`/tenant/runsheets/${route.params.id}`);
  rs.value = data;

  // hydrate supplier/takeTo/set if they came back as ids
  if (rs.value?.supplier && typeof rs.value.supplier === 'string') {
    try { rs.value.supplier = await api.get(`/tenant/suppliers/${rs.value.supplier}`); } catch {}
  }
  if (rs.value?.takeTo && typeof rs.value.takeTo === 'string') {
    try { rs.value.takeTo = await api.get(`/tenant/places/${rs.value.takeTo}`); } catch {}
  }
  if (rs.value?.set && typeof rs.value.set === 'string') {
    try { rs.value.set = await api.get(`/tenant/sets/${rs.value.set}`); } catch {}
  }

  await hydrateContactPerson();
  await hydrateCompletedUsers(); 
  
});
watch(() => slug.value, loadProduction);
watch(() => rs.value?.contact, hydrateContactPerson);

/* ---------------- print as 1-page image ---------------- */
async function doPrintImage() {
  const el = sheetEl.value;
  if (!el) return;

  const ORIENTATION = 'landscape';
  const FONT_BOOST = 1.35;
  const PAGE_MARGIN_IN = 0.15;
  const PRINT_DPI = 96;
  const H2C_SCALE = Math.min(3, window.devicePixelRatio || 2);

  const pageWIn = ORIENTATION === 'portrait' ? 11 : 8.5;
  const pageHIn = ORIENTATION === 'portrait' ? 8.5 : 11;
  const innerWIn = pageWIn - PAGE_MARGIN_IN * 2;
  const innerHIn = pageHIn - PAGE_MARGIN_IN * 2;

  const targetPxW = Math.round(innerWIn * PRINT_DPI);

  const prev = { fontSize: el.style.fontSize, width: el.style.width, maxWidth: el.style.maxWidth };
  el.style.fontSize = `${Math.round(FONT_BOOST * 100)}%`;
  el.style.width = `${targetPxW}px`;
  el.style.maxWidth = `${targetPxW}px`;

  try {
    const canvas = await html2canvas(el, {
      backgroundColor: '#fff',
      scale: H2C_SCALE,
      useCORS: true,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight
    });
    const dataUrl = canvas.toDataURL('image/png');

    const ratio = canvas.height / canvas.width;
    let dispWIn = innerWIn;
    let dispHIn = dispWIn * ratio;
    if (dispHIn > innerHIn) { dispHIn = innerHIn; dispWIn = dispHIn / ratio; }

    const w = window.open('', 'rs_print');
    if (!w) return;

    w.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Run Sheet</title>
<style>
  @page { size: ${pageWIn}in ${pageHIn}in; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page {
    width: ${pageWIn}in; height: ${pageHIn}in;
    display: flex; align-items: center; justify-content: center;
    background: #fff;
  }
  img { width: ${dispWIn}in; height: ${dispHIn}in; display: block; }
</style>
</head>
<body>
  <div class="page">
    <img src="${dataUrl}" alt="Run Sheet" />
  </div>
</body>
</html>`);
    w.document.close();
    w.focus();
    w.onload = () => { w.print(); w.close(); };
  } catch (e) {
    console.error(e);
    window.print();
  } finally {
    el.style.fontSize = prev.fontSize || '';
    el.style.width = prev.width || '';
    el.style.maxWidth = prev.maxWidth || '';
  }
}
</script>






  
  
  <style scoped>
  /* ===== Base (black & white) ===== */
  .page { background:#fff; color:#000; }
  .sheet-wrap { max-width:820px; margin:0 auto; padding:16px; }
  .sheet { border:1px solid #000; padding:10px; background:#fff; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
  
  /* Common */
  .row { border:1px solid #000; border-left:none; border-right:none; }
  .row + .row { border-top:none; }
  .panel { border:1px solid #000; background:#fff; padding:8px; }
  .label-sm { font-weight:700; margin-right:6px; }
  .mini { font-size:12px; font-weight:700; letter-spacing:.02em; }
  .line { display:inline-block; min-width:120px; border-bottom:1px solid #000; line-height:1.2; }
  .line--short { min-width:80px; }
  .line--wide { min-width:260px; }
  .line--grow { flex:1 1 auto; min-width:200px; }
  .box { display:inline-block; width:13px; height:13px; border:1px solid #000; margin-right:6px; position:relative; }
  .box.checked::after { /* Use a real glyph so it prints (no background fills needed) */
    content: "✓";
    position:absolute;
    left: 1px;
    top: -1px;
    font-size: 13px;
    line-height: 1;
    font-weight: 900;
    color:#000;
  }
  .box--ghost { border:1px solid #000; }
  
  /* Header */
  .header { display:flex; padding:6px 8px; }
  .h-left { flex:1 1 35%; display:flex; align-items:flex-end; }
  .h-center { flex:1 1 30%; text-align:center; }
  .h-right { flex:1 1 35%; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
  .title { font-weight:900; letter-spacing:.06em; }
  .subtitle { font-weight:800; font-size:12px; letter-spacing:.08em; margin-top:2px; }
  .line-pair { display:flex; align-items:flex-end; gap:6px; }
  .label { font-weight:800; }
  
  /* Dates */
  .dates { display:flex; gap:16px; padding:6px 8px; }
  .half { flex:1 1 50%; }
  
  /* Address/Supplier */
  .addr-supplier { display:grid; grid-template-columns: 1.2fr 1fr; gap:10px; padding:10px 0; border:none; }
  .addr .addr-line { line-height:1.4; }
  .addr .strong { font-weight:800; }
  .supplier .field { display:flex; align-items:center; gap:6px; margin:5px 0; }
  .supplier .fill { flex:1 1 auto; border-bottom:1px solid #000; min-height:18px; }
  .supplier .fill--hrs { max-width:120px; }
  .supplier .hrs { margin-left:auto; }
  
  /* Items table */
  .table { border:1px solid #000; margin:10px 0; }
  .thead { display:grid; grid-template-columns:220px 1fr; }
  .th { padding:6px; font-weight:800; border-right:1px solid #000; }
  .th:last-child { border-right:none; }
  .tbody .tr { display:grid; grid-template-columns:220px 1fr; border-top:1px solid #000; min-height:28px; }
  .td { padding:4px 6px; border-right:1px solid #000; }
  .td:last-child { border-right:none; }
  
  /* Lower row */
  .lower { display:grid; grid-template-columns: 1.1fr 0.9fr; gap:10px; padding:10px 0; border:none; }
  .dest .checkline { display:flex; align-items:center; gap:8px; margin:6px 0; }
  .fillline { flex:1 1 auto; border-bottom:1px solid #000; min-height:16px; }
  .contacts { padding:0; }
  .contact { display:grid; grid-template-columns:16px 1fr auto; align-items:center; gap:8px; border-bottom:1px solid #000; padding:6px 8px; }
  .contact:last-child { border-bottom:none; }
  .contact .name { font-weight:700; }
  .contact .phone { font-size:12px; }
  .pay { grid-column: 1 / -1; }
  .pay-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
  .cell { border:1px solid #000; padding:6px; min-height:54px; display:flex; flex-direction:column; gap:6px; }
  .cell.wide { grid-column: span 2; }
  .inline { display:inline-flex; align-items:center; gap:6px; }
  .gap { width:14px; display:inline-block; }
  .uline { border-bottom:1px solid #000; min-height:18px; }
  
  /* Actions row */
  .actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:10px 0; border:none; }
  .act .cap { font-weight:800; border-bottom:1px solid #000; padding-bottom:4px; margin-bottom:6px; display:flex; align-items:center; }
  .act .sp { width:10px; display:inline-block; }
  .act .line-row { display:flex; align-items:center; gap:8px; margin:6px 0; }
  
  /* QC */
  .qc { display:flex; align-items:center; gap:10px; margin-top:6px; }
  .sigwrap { display:inline-flex; align-items:center; justify-content:center; height:38px; }
  .sigwrap img { max-height:34px; }
  
  /* Footer actions */
  .footer-actions { display:flex; gap:8px; align-items:center; justify-content:flex-end; margin-top:12px; }
  .btn { appearance:none; background:#000; color:#fff; border:1px solid #000; padding:8px 12px; cursor:pointer; }
  .btn:hover { background:#fff; color:#000; }
  .share-msg { font-size:12px; margin-left:8px; }
  
  /* Print — force single page & reliable ticks */
 
  </style>
  
  
  
  
  
  
  