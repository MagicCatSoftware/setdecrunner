<template>
  <div>
    <NavBar :me="me" />

    <div class="rs container">
      <!-- Header -->
      <div class="panel header">
        <input v-model="rs.title" class="input input--title" placeholder="Runsheet title" />

        <div class="field">
          <label class="label" for="rs-date">Runsheet Date</label>
          <input id="rs-date" type="date" v-model="dateStr" class="input input--date" />
        </div>

        <div class="field">
          <label class="label" for="pickup-date">Pickup Date</label>
          <input id="pickup-date" type="date" v-model="pickupStr" class="input input--date" />
        </div>

        <div class="field">
          <label class="label" for="return-date">Return Date</label>
          <input id="return-date" type="date" v-model="returnStr" class="input input--date" />
        </div>

        <div class="field">
          <label class="label" for="rs-status">Status</label>
          <select id="rs-status" v-model="rs.status" class="select">
            <option>draft</option>
            <option>open</option>
            <option>assigned</option>
            <option>claimed</option>
            <option>in_progress</option>
            <option>completed</option>
            <option>cancelled</option>
          </select>
        </div>

        <div class="header__actions">
          <button type="button" class="btn" @click.stop.prevent="goToRunsheetView" :disabled="!rs._id">View</button>
          <button type="button" class="btn btn--primary" @click.stop.prevent="save" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>

        <span class="muted saved" v-if="savedAt">Saved {{ savedAt }}</span>
      </div>

      <!-- Type -->
      <section class="panel">
        <h3 class="subtitle">Type</h3>
        <div class="row row--wrap">
          <div class="field">
            <div class="label">Purchase Type</div>
            <label class="radio">
            -   <input type="radio" value="purchase" v-model="rs.purchaseType" @change="onPurchaseTypeChanged" /> Purchase
            </label>
            <label class="radio">
            +  <input type="radio" value="rental" v-model="rs.purchaseType" @change="onPurchaseTypeChanged" /> Rental
            </label>

          </div>
        </div>
        <p class="muted">
          If this is a rental, ensure both Pickup and Return dates are set (Return can’t be before Pickup).
        </p>
      </section>

     

      <!-- Set -->
      <section class="panel">
        <div class="row">
          <h3 class="subtitle">Set</h3>
        </div>

        <div class="row row--tight">
          <input v-model="setSearch" placeholder="Search sets…" />
          <button class="btn" @click="searchSets">Search</button>

          <div class="muted" v-if="rs.set">
            Current: <strong>{{ currentSetLabel }}</strong>
          </div>
        </div>

        <div class="pillbar">
          <button
            v-for="s in setResults"
            :key="s._id"
            class="pill"
            @click="chooseSet(s)"
          >Use {{ s.number }} — {{ s.name }}</button>

          <button class="pill" v-if="rs.set" @click="clearSet">Clear Set</button>
        </div>
      </section>

      <!-- ================= Supplier Section ================= -->
<section class="panel supplier-block">
  <div class="row">
    <h3 class="subtitle">Supplier</h3>
  </div>

  <!-- Selected supplier summary -->
  <div v-if="selectedSupplier" class="supplier-summary">
    <div class="supplier-card">
      <div class="supplier-card__left">
        <div class="supplier-card__title">
          <strong>{{ selectedSupplier.name }}</strong>
        </div>
        <div class="supplier-card__meta">
          <span v-if="selectedSupplier.address">{{ selectedSupplier.address }}</span>
          <span v-if="selectedSupplier.phone">• {{ selectedSupplier.phone }}</span>
          <span v-if="selectedSupplier.contactName">• {{ selectedSupplier.contactName }}</span>
          <span v-if="selectedSupplier.hours">• {{ selectedSupplier.hours }}</span>
        </div>
      </div>
      <div class="supplier-card__actions">
        <button :disabled="saving" class="btn" @click="startChangeSupplier">Change</button>
        <button :disabled="saving" class="btn btn--ghost" @click="clearSupplier">Clear</button>
      </div>
    </div>
    <div class="muted" v-if="saving" style="margin-top:.25rem;">Saving…</div>
  </div>

  <!-- Picker / Creator -->
  <div v-else class="supplier-picker">
    <!-- Search existing -->
    <div class="supplier-search">
      <label for="supplier-search" class="label">Search suppliers</label>
      <div class="supplier-search__row">
        <input
          id="supplier-search"
          v-model="search"
          type="text"
          placeholder="Type a name, address, phone…"
          @input="debouncedFetchSuppliers()"
          class="input"
        />
        <button class="btn" @click="fetchSuppliers" :disabled="searching">Search</button>
      </div>
      <div class="muted" v-if="searching">Searching…</div>
      <div class="error" v-if="listError">{{ listError }}</div>
    </div>

    <div v-if="suppliers.length" class="supplier-results">
      <div class="supplier-results__heading">Results</div>
      <ul class="supplier-list">
        <li v-for="s in suppliers" :key="s._id" class="supplier-item">
          <div class="supplier-item__title"><strong>{{ s.name }}</strong></div>
          <div class="supplier-item__meta">
            <span v-if="s.address">{{ s.address }}</span>
            <span v-if="s.phone">• {{ s.phone }}</span>
            <span v-if="s.contactName">• {{ s.contactName }}</span>
            <span v-if="s.hours">• {{ s.hours }}</span>
          </div>
          <div class="supplier-item__actions">
            <button :disabled="saving" class="btn btn--primary" @click="chooseSupplier(s)">Use this supplier</button>
          </div>
        </li>
      </ul>
    </div>

    <details class="supplier-create">
      <summary class="supplier-create__summary">Create new supplier</summary>
      <div class="supplier-create__form">
        <div class="field">
          <label class="label">Name *</label>
          <input v-model="createForm.name" type="text" class="input" />
        </div>
        <div class="field">
          <label class="label">Address *</label>
          <input v-model="createForm.address" type="text" class="input" />
        </div>
        <div class="field">
          <label class="label">Phone</label>
          <input v-model="createForm.phone" type="text" class="input" />
        </div>
        <div class="field">
          <label class="label">Contact Name</label>
          <input v-model="createForm.contactName" type="text" class="input" />
        </div>
        <div class="field">
          <label class="label">Hours</label>
          <input v-model="createForm.hours" type="text" class="input" />
        </div>

        <div v-if="createError" class="error">{{ createError }}</div>

        <div class="supplier-create__actions">
          <button :disabled="creating || saving" class="btn btn--primary" @click="createSupplier">
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </details>
  </div>
</section>

      <!-- Primary Contact (People) – single-select checkbox -->
      <section class="panel">
        <div class="row">
          <h3 class="subtitle">Primary Contact</h3>
          <div class="muted">Select exactly one person to be the contact for this runsheet.</div>
        </div>

        <div v-if="peopleError" class="error">{{ peopleError }}</div>
        <div v-else-if="!people.length" class="muted">No people found.</div>

        <ul class="selectlist" v-else>
          <li v-for="p in people" :key="p._id" class="selectlist__item">
            <label class="selectlist__row">
              <!-- Checkbox that behaves like a radio -->
              <input
                type="checkbox"
                :checked="selectedPersonId === p._id"
                @change="onTogglePerson(p, $event)"
              />
              <div class="selectlist__meta">
                <div class="selectlist__title">
                  {{ p.name }}
                </div>
                <div class="selectlist__sub muted">
                  <span v-if="p.email">{{ p.email }}</span>
                  <span v-if="p.email && p.phone"> · </span>
                  <span v-if="p.phone">{{ p.phone }}</span>
                </div>
              </div>
            </label>
          </li>
        </ul>

        <div class="row row--tight">
          <button class="btn" v-if="selectedPersonId" @click="clearContact" :disabled="contactSaving">Clear selection</button>
          <span class="muted" v-if="contactSaving">Saving…</span>
        </div>

        <p class="muted" v-if="selectedPersonLabel">
          Selected: <strong>{{ selectedPersonLabel }}</strong>
        </p>
      </section>

      <!-- Photos -->
      <section class="panel">
        <div class="row">
          <h3 class="subtitle">Photos</h3>
          <input type="file" multiple @change="uploadPhotos" />
        </div>

        <div class="thumbs">
          <div v-for="p in rs.photos" :key="p" class="thumb">
            <img :src="imageUrl(p)" class="thumb__img" />
            <button type="button" class="chip chip--x" @click.stop.prevent="removePhoto(p)">×</button>
          </div>
          <div v-if="!rs.photos?.length" class="empty muted">No photos yet.</div>
        </div>
      </section>

      <!-- Receipts -->
      <section class="panel">
        <div class="row">
          <h3 class="subtitle">Receipts</h3>
          <input type="file" multiple accept="image/*,application/pdf" @change="uploadReceipts" />
        </div>

        <div class="thumbs">
          <div v-for="r in rs.receipts" :key="r" class="thumb">
            <img v-if="isImage(r)" :src="imageUrl(r)" class="thumb__img" />
            <a v-else :href="imageUrl(r)" target="_blank" rel="noopener" class="link link--small">Open receipt</a>
            <button type="button" class="chip chip--x" @click.stop.prevent="removeReceipt(r)">×</button>
          </div>
          <div v-if="!rs.receipts?.length" class="empty muted">No receipts yet.</div>
        </div>
      </section>

      <!-- Post-Run Destination (one-of checkboxes) -->
      <section class="panel">
        <div class="row">
          <h3 class="subtitle">Post-Run Destination</h3>
          <div class="muted">Choose one destination for items after the run.</div>
        </div>

        <div class="row row--tight">
          <label class="checkbox">
            <input
              type="checkbox"
              :checked="rs.postLocation === 'hold_on_truck'"
              @change="togglePost('hold_on_truck', $event)"
            />
            Hold On Truck
          </label>

          <label class="checkbox">
            <input
              type="checkbox"
              :checked="rs.postLocation === 'office'"
              @change="togglePost('office', $event)"
            />
            Office
          </label>

          <label class="checkbox">
            <input
              type="checkbox"
              :checked="rs.postLocation === 'setdec_storage'"
              @change="togglePost('setdec_storage', $event)"
            />
            Set Dec Storage
          </label>

          <label class="checkbox">
            <input
              type="checkbox"
              :checked="rs.postLocation === 'address_below'"
              @change="togglePost('address_below', $event)"
            />
            Address Below
          </label>
        </div>

        <!-- When Address Below is selected, show place search & current selection -->
        <div v-if="rs.postLocation === 'address_below'" class="mt-2">
          <PlaceSearch @select="choosePostPlace" />
          <p v-if="postPlaceLabel" class="muted mt-1">
            Selected: <strong>{{ postPlaceLabel }}</strong>
            <button type="button" class="chip chip--x" @click="clearPostPlace">×</button>
          </p>

          <div class="field">
            <label class="label" for="post-addr">Address</label>
            <textarea
              id="post-addr"
              v-model="rs.postAddress"
              rows="2"
              placeholder="Enter the address for this option"
              @change="savePostLocation"
            ></textarea>
            <p class="muted">Required when “Address Below” is selected (or choose a Place above).</p>
          </div>
        </div>
      </section>

      <!-- Purchase / Payment -->
<section class="panel">
  <div class="row">
    <h3 class="subtitle">Purchase / Payment</h3>
    <div class="muted">Record invoice, deposit, PO and payment details.</div>
  </div>

  <div class="row row--tight">
    <label class="checkbox">
      <input type="checkbox" v-model="rs.getInvoice" @change="savePurchase" />
      Get Invoice
    </label>

    <label class="checkbox">
      <input type="checkbox" v-model="rs.getDeposit" @change="savePurchase" />
      Get Deposit
    </label>

    <label class="checkbox">
      <input type="checkbox" v-model="rs.paid" @change="savePurchase" />
      Paid
    </label>
  </div>

  <div class="row row--wrap">
    <div class="field">
      <label class="label">Cheque #</label>
      <input v-model="rs.chequeNumber" @change="savePurchase" />
    </div>

    <div class="field">
      <label class="label">PO #</label>
      <input v-model="rs.poNumber" @change="savePurchase" />
    </div>

    <div class="field">
      <label class="label">Amount</label>
      <input
        type="number"
        min="0"
        step="0.01"
        v-model.number="rs.amount"
        @change="savePurchase"
      />
    </div>

    <div class="field">
      <label class="label">Cheque/Cash Rec By</label>
      <input v-model="rs.receivedBy" placeholder="Name" @input="savePurchaseDebounced" @change="savePurchase" />
    </div>
  </div>
</section>

<!-- ================= Runsheet Items ================= -->
<section class="panel">
  <div class="row">
    <h3 class="subtitle">Items</h3>
    <div class="muted">Attach existing catalog items or create a new one — photos included.</div>
  </div>

  <!-- Search & attach existing -->
  <div class="row row--tight">
    <input v-model="itemSearch" placeholder="Search items…" class="input" />
    <button type="button" class="btn" @click.stop.prevent="searchItems" :disabled="searchingItems">
      {{ searchingItems ? 'Searching…' : 'Search' }}
    </button>
    <span v-if="itemListError" class="error">{{ itemListError }}</span>
  </div>

  <div class="pillbar">
    <button
      v-for="it in itemResults"
      :key="it._id"
      class="pill"
      type="button"
      @click.stop.prevent="addItemToRunsheet(it)"
    >
      + {{ it.name }}
    </button>
  </div>

  <!-- Create & add new item (with image) -->
  <details class="mt-1">
    <summary class="link">Create & add a new item</summary>
    <div class="row row--wrap" style="gap:.75rem;margin-top:.5rem;">
      <div class="field">
        <label class="label">Name *</label>
        <input v-model="newItem.name" class="input" placeholder="e.g. Brass Lamp" />
      </div>

      <div class="field" style="min-width:280px;flex:1;">
        <label class="label">Description (optional)</label>
        <input v-model="newItem.description" class="input" placeholder="Short description" />
      </div>

      <div class="field">
        <label class="label">Quantity</label>
        <input type="number" min="1" v-model.number="newItem.qty" class="input input--qty" />
      </div>

      <div class="field">
        <label class="label">Photo</label>
        <input type="file" accept="image/*" @change="onNewItemImage($event)" />
        <div v-if="newItem.preview" class="thumbs thumbs--small" style="margin-top:6px;">
          <img :src="newItem.preview" class="thumb__img thumb__img--sm" />
        </div>
      </div>

      <div class="field" style="align-self:flex-end;">
        <button
          type="button"
          class="btn btn--primary"
          :disabled="creatingItem || !newItem.name.trim()"
          @click.stop.prevent="createAndAddItem()"
        >
          {{ creatingItem ? 'Creating…' : 'Create & Add' }}
        </button>
        <span v-if="createItemError" class="error" style="margin-left:.5rem;">{{ createItemError }}</span>
      </div>
    </div>
  </details>

  <!-- Attached items list -->
  <div class="items mt-2">
    <div v-if="!attachedItems.length" class="empty muted">No items attached yet.</div>

    <div
  v-for="(ai, i) in attachedItems"
  :key="ai._id ? `id:${ai._id}` : `adhoc:${ai.name || 'unnamed'}:${i}`"
  class="item card"
>
      <div class="item__row">
        <div class="item__name">
          {{ ai.name || 'Item' }}
          <span class="muted" v-if="!ai._id">(ad-hoc)</span>
        </div>
        <div class="qty">
          <label class="muted">Qty</label>
          <input
            type="number"
            min="0"
            class="input input--qty"
            :value="ai.quantity"
            @change="e => updateAttachedQuantity(ai, e.target.value)"
            :disabled="!ai._id"
            title="Set quantity (only for catalog items)"
          />
          <button
            v-if="ai._id"
            type="button"
            class="btn btn--danger"
            @click.stop.prevent="removeAttachedItem(ai._id)"
          >
            Remove
          </button>
        </div>
      </div>

      <div class="row row--tight">
        <span class="muted">Photos</span>
        <input
          v-if="ai._id"
          type="file"
          multiple
          accept="image/*"
          @change="(e) => uploadItemPhotos(ai, e)"
        />
      </div>

      <div class="thumbs thumbs--small" v-if="ai.photos && ai.photos.length">
        <img
          v-for="p in ai.photos"
          :key="p"
          :src="imageUrl(p)"
          class="thumb__img thumb__img--sm"
        />
      </div>
      <div v-else class="muted">No photos yet.</div>
    </div>
  </div>
</section>



      <!-- Pickup/Delivering -->
<section class="panel">
  <div class="row">
    <h3 class="subtitle">Pickup/Delivering</h3>
    <div class="muted">Choose the service, payment method, timing, and completion info.</div>
  </div>

  <!-- Service type -->
  <div class="row row--tight">
    <div class="field">
      <div class="label">Service</div>
      <label class="radio">
        <input
          type="radio"
          value="pickup"
          v-model="rs.pdType"
          @change="savePickupDelivering"
        /> Pick Up
      </label>
      <label class="radio">
        <input
          type="radio"
          value="delivering"
          v-model="rs.pdType"
          @change="savePickupDelivering"
        /> Delivering
      </label>
    </div>

    <div class="field">
      <div class="label">Payment</div>
      <label class="radio">
        <input
          type="radio"
          value="cheque"
          v-model="rs.pdPaymentMethod"
          @change="savePickupDelivering"
        /> Cheque
      </label>
      <label class="radio">
        <input
          type="radio"
          value="cash"
          v-model="rs.pdPaymentMethod"
          @change="savePickupDelivering"
        /> Cash
      </label>
    </div>
  </div>

  <!-- Date / Time -->
  <div class="row row--wrap">
    <div class="field">
      <label class="label" for="pd-date">Date</label>
      <input id="pd-date" type="date" v-model="pdDateStr" @change="savePickupDelivering" />
    </div>

    <div class="field">
      <label class="label" for="pd-time">Time</label>
      <input id="pd-time" type="time" v-model="rs.pdTime" @change="savePickupDelivering" />
    </div>
  </div>

  <!-- Instructions -->
  <div class="field">
    <label class="label" for="pd-instr">Instructions</label>
    <textarea
      id="pd-instr"
      v-model="rs.pdInstructions"
      rows="2"
      placeholder="Notes or special instructions for pickup/delivery"
      @change="savePickupDelivering"
    ></textarea>
  </div>

  <!-- Completed by (user) -->
  <!-- Completed by (user) -->
<div class="row">
  <h4 class="mini-title">Completed By</h4>
  <div class="muted" v-if="completedByLabel">Current: {{ completedByLabel }}</div> <!-- CHANGED -->
</div>

<div class="row row--tight">
  <input v-model="pdSearch" placeholder="Search users…" class="input" />
  <button
    type="button"
    class="btn"
    @click.stop.prevent="searchPdUsers"
    :disabled="pdSearching"
  >
    {{ pdSearching ? 'Searching…' : 'Search' }}
  </button>
  <button
    v-if="rs.pdCompletedBy"
    type="button"
    class="btn btn--ghost"
    @click.stop.prevent="clearCompletedBy"
  >
    Unset
  </button>
</div>

<div class="pillbar">
  <button
    v-for="u in pdResults"
    :key="u._id"
    class="pill"
    type="button"
    @click.stop.prevent="selectCompletedBy(u)"
  >
    Use {{ u.name || u.email }}
  </button>
</div>


<!-- Pickup Signature -->
<div class="field">
  <div class="label">Pickup Signature</div>

  <div style="border:1px solid #ddd;border-radius:8px;padding:8px;">
    <canvas
      ref="pdSigCanvas"
      class="sigpad"
      style="width:100%;height:180px;touch-action:none;display:block;cursor:crosshair;"
      @mousedown="pdSigStart"
      @mousemove="pdSigMove"
      @mouseup="pdSigEnd"
      @mouseleave="pdSigEnd"
      @touchstart.prevent="pdSigStart"
      @touchmove.prevent="pdSigMove"
      @touchend.prevent="pdSigEnd"
    ></canvas>

    <div class="row row--tight" style="margin-top:8px;">
      <button type="button" class="btn btn--ghost" @click="pdSigClear">Clear</button>
      <span class="spacer"></span>
      <button type="button" class="btn btn--primary" @click="savePdSignature" :disabled="pdSigSaving">
        {{ pdSigSaving ? 'Saving…' : 'Save Pickup Signature' }}
      </button>
    </div>
  </div>

  <div v-if="rs.pdSignatureData" class="mt-2">
    <div class="muted">Saved pickup signature:</div>
    <img
      :src="rs.pdSignatureData"
      alt="Pickup signature"
      style="max-width:320px;max-height:120px;display:block;"
    />
  </div>
</div>

<div class="field">
  <input
    type="date" id="pdCompletedOn"
    v-model="dateFinishedStr"
    @change="savePickupDelivering"
  />
</div>

 
</section>

<!-- Return / Drop Off -->
<section class="panel">
  <div class="row">
    <h3 class="subtitle">Return / Drop Off</h3>
    <div class="muted">Pick PU or Take, toggle Cheque, set timing and completion info.</div>
  </div>

  <!-- PU / Take + Cheque toggle -->
  <div class="row row--tight">
    <div class="field">
      <div class="label">Service</div>
      <label class="radio">
        <input
          type="radio"
          value="pu"
          v-model="rs.rdType"
          @change="saveReturnDropoff"
        /> PU
      </label>
      <label class="radio">
        <input
          type="radio"
          value="take"
          v-model="rs.rdType"
          @change="saveReturnDropoff"
        /> Take
      </label>
    </div>

    <div class="field">
      <div class="label">Cheque</div>
      <label class="checkbox">
        <input
          type="checkbox"
          :checked="!!rs.rdCheque"
          @change="onToggleRdCheque"
        />
        <span>{{ rs.rdCheque ? 'On' : 'Off' }}</span>
      </label>
    </div>
  </div>

  <!-- Date / Time -->
  <div class="row row--wrap">
    <div class="field">
      <label class="label" for="rd-date">Return Date</label>
      <input id="rd-date" type="date" v-model="rdDateStr" @change="saveReturnDropoff" />
    </div>
    <div class="field">
      <label class="label" for="rd-time">Return Time</label>
      <input id="rd-time" type="time" v-model="rs.rdTime" @change="saveReturnDropoff" />
    </div>
  </div>

  <!-- Instructions -->
  <div class="field">
    <label class="label" for="rd-instr">Instructions</label>
    <textarea
      id="rd-instr"
      v-model="rs.rdInstructions"
      rows="2"
      placeholder="Notes for the return/drop-off"
      @change="saveReturnDropoff"
    ></textarea>
  </div>

  <!-- Completed By -->
  <div class="row">
    <h4 class="mini-title">Completed By</h4>
    <div class="muted" v-if="rdCompletedByLabel">Current: {{ rdCompletedByLabel }}</div>
  </div>

  <div class="row row--tight">
  <input
    v-model="rdSearch"
    placeholder="Search users…"
    class="input"
    @input="debouncedSearchRdUsers"
  />
  <button
    type="button"
    class="btn"
    @click.stop.prevent="searchRdUsers"
    :disabled="rdSearching"
  >
    {{ rdSearching ? 'Searching…' : 'Search' }}
  </button>
  <button
    v-if="rs.rdCompletedBy"
    type="button"
    class="btn btn--ghost"
    @click.stop.prevent="clearRdCompletedBy"
  >
    Unset
  </button>
</div>

<div class="pillbar">
  <button
    v-for="u in rdResults"
    :key="u._id"
    class="pill"
    type="button"
    @click.stop.prevent="selectRdCompletedBy(u)"
  >
    Use {{ u.name || u.email }}
  </button>
</div>

  <!-- Completed On -->
  <div class="field">
    <label class="label" for="rd-finished">Completed On</label>
    <input id="rd-finished" type="date" v-model="rdCompletedOnStr" @change="saveReturnDropoff" />
  </div>

<!-- Return Signature -->
<div class="field">
  <div class="label">Return Signature</div>

  <div style="border:1px solid #ddd;border-radius:8px;padding:8px;">
    <canvas
      ref="rdSigCanvas"
      class="sigpad"
      style="width:100%;height:180px;touch-action:none;display:block;cursor:crosshair;"
      @mousedown="rdSigStart"
      @mousemove="rdSigMove"
      @mouseup="rdSigEnd"
      @mouseleave="rdSigEnd"
      @touchstart.prevent="rdSigStart"
      @touchmove.prevent="rdSigMove"
      @touchend.prevent="rdSigEnd"
    ></canvas>

    <div class="row row--tight" style="margin-top:8px;">
      <button type="button" class="btn btn--ghost" @click="rdSigClear">Clear</button>
      <span class="spacer"></span>
      <button type="button" class="btn btn--primary" @click="saveRdSignature" :disabled="rdSigSaving">
        {{ rdSigSaving ? 'Saving…' : 'Save Return Signature' }}
      </button>
    </div>
  </div>

  <div v-if="rs.rdSignatureData" class="mt-2">
    <div class="muted">Saved return signature:</div>
    <img
      :src="rs.rdSignatureData"
      alt="Return signature"
      style="max-width:320px;max-height:120px;display:block;"
    />
  </div>
</div>

</section>

<!-- Items Returned + Signature -->
<section class="panel">
  <div class="row">
    <h3 class="subtitle">Items Returned In Good Condition</h3>
  </div>

  <!-- Yes / No (stored as boolean) -->
  <div class="row row--tight">
    <label class="radio">
      <input
        type="radio"
        :checked="rs.qcItemsGood === true"
        @change="setItemsGood(true)"
      />
      Yes
    </label>
    <label class="radio">
      <input
        type="radio"
        :checked="rs.qcItemsGood === false"
        @change="setItemsGood(false)"
      />
      No
    </label>
    <span class="muted" v-if="itemsGoodSaving">Saving…</span>
  </div>

  <!-- Signature pad -->
  <div class="field">
    <div class="label">Signature</div>

    <div style="border:1px solid #ddd;border-radius:8px;padding:8px;">
      <canvas
        ref="sigCanvas"
        class="sigpad"
        style="width:100%;height:180px;touch-action:none;display:block;cursor:crosshair;"
        @mousedown="sigStart"
        @mousemove="sigMove"
        @mouseup="sigEnd"
        @mouseleave="sigEnd"
        @touchstart.prevent="sigStart"
        @touchmove.prevent="sigMove"
        @touchend.prevent="sigEnd"
      ></canvas>

      <div class="row row--tight" style="margin-top:8px;">
        <button type="button" class="btn btn--ghost" @click="clearSignature">Clear</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn--primary" @click="saveSignature" :disabled="sigSaving">
          {{ sigSaving ? 'Saving…' : 'Save Signature' }}
        </button>
      </div>
    </div>

    <!-- If you already have a saved signature, show a small preview -->
    <div v-if="rs.qcSignatureData" class="mt-2">
      <div class="muted">Saved signature preview:</div>
      <img :src="rs.qcSignatureData" alt="Saved signature" style="max-width:320px;max-height:120px;display:block;" />
    </div>
  </div>
</section>


      <!-- Assign to driver -->
      <section class="panel">
        <h3 class="subtitle">Assign to Driver</h3>
        <div class="row row--tight">
          <input v-model="userSearch" placeholder="Search users…" class="input" />
          <button type="button" class="btn" @click.stop.prevent="searchUsers">Search</button>
          <div class="muted" v-if="rs.assignedTo">Current: {{ rs.assignedTo?.name }}</div>
        </div>
        <div class="pillbar">
          <button
            v-for="u in userResults"
            :key="u._id"
            class="pill"
            type="button"
            @click.stop.prevent="assign(u)"
          >Assign {{ u.name }} ({{ u.role }})</button>
        </div>
      </section>

      <!-- Danger -->
      <section class="panel panel--danger danger-footer">
        <div class="row">
          <button type="button" class="btn" @click.stop.prevent="goToRunsheets">Back to list</button>
          <button type="button" class="btn btn--danger ml-auto" @click.stop.prevent="destroy">Delete Runsheet</button>
        </div>
      </section>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>


<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavBar from '../components/NavBar.vue';
import PlaceSearch from '../components/PlaceSearch.vue';
import api from '../api.js';

const route = useRoute();
const router = useRouter();

const me = ref(null);
const itemsGoodSaving = ref(false);
const sigCanvas = ref(null);
let sigCtx = null;
let sigDrawing = false;
let sigLastX = 0;
let sigLastY = 0;
const sigSaving = ref(false);

const pdSigCanvas = ref(null);
const rdSigCanvas = ref(null);

let pdSigCtx = null;
let rdSigCtx = null;

let pdSigDrawing = false;
let rdSigDrawing = false;

let pdSigLastX = 0;
let pdSigLastY = 0;
let rdSigLastX = 0;
let rdSigLastY = 0;

const pdSigSaving = ref(false);
const rdSigSaving = ref(false);

const rs = ref({
  title: '',
  status: 'draft',
  date: null,

  photos: [],
  receipts: [],
  stops: [],

  // runsheet-level items
  items: [],

  purchaseType: 'purchase',
  pickupDate: null,
  returnDate: null,

  takeTo: null,
  set: null,

  // single-select contact (Person _id)
  contact: null,

  // Supplier (separate from takeTo)
  supplier: null,

  // Post-run destination
  postLocation: null,
  postAddress: '',
  postPlace: null,

  // Purchase / Payment
  getInvoice: false,
  getDeposit: false,
  paid: false,
  chequeNumber: '',
  poNumber: '',
  amount: 0,
  receivedBy: '',

  // Pickup/Delivering
  pdType: null,
  pdPaymentMethod: null,
  pdDate: null,
  pdTime: '',
  pdInstructions: '',
  pdCompletedBy: null,      // legacy UI
  pdCompletedOn: null,     // legacy UI

  // Return / Drop Off
  rdType: null,
  rdCheque: false,
  rdDate: null,
  rdTime: '',
  rdInstructions: '',
  rdCompletedBy: null,
  rdCompletedOn: null,

  // QC
  qcItemsGood: null,
  qcSignatureData: ''
});

const saving = ref(false);
const savedAt = ref('');
const error = ref('');
const loading = ref(false);

const stamp = () => { savedAt.value = new Date().toLocaleTimeString(); };


/* ===================== People (single-select contact) ===================== */
const people = ref([]);
const peopleError = ref('');
const selectedPersonId = ref(null);
const contactSaving = ref(false);

const loadPeople = async () => {
  try { people.value = await api.get('/tenant/people', { limit: 100 }); }
  catch (e) { peopleError.value = e?.response?.data?.error || 'Failed to load people'; }
};

const saveContactSelection = async () => {
  if (!rs.value || !rs.value._id) return;
  contactSaving.value = true;
  const wanted = selectedPersonId.value;
  try {
    await api.patch(`/tenant/runsheets/${rs.value._id}`, { contact: wanted || null });
    rs.value.contact = wanted || null;
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to save contact';
    selectedPersonId.value = (rs.value && rs.value.contact) || null;
  } finally {
    contactSaving.value = false;
  }
};

const getCanvasPos = (canvasRef, e) => {
  const el = canvasRef.value;
  if (!el) return { x: 0, y: 0 };

  const rect = el.getBoundingClientRect();
  const touch = e.touches && e.touches[0];

  const clientX = touch ? touch.clientX : e.clientX;
  const clientY = touch ? touch.clientY : e.clientY;

  const x = (clientX - rect.left) * (el.width / rect.width);
  const y = (clientY - rect.top) * (el.height / rect.height);

  return { x, y };
};


/* ====================== Post-Run Destination helpers ====================== */
// Label for the selected postPlace (when address_below)
const postPlaceLabel = computed(() => {
  const p = rs.value?.postPlace;
  if (!p) return '';
  if (typeof p === 'string') return `#${p}`;
  const extra = [p.address].filter(Boolean).join(' — ');
  return extra ? `${p.name} — ${extra}` : p.name;
});

async function togglePost(key, ev) {
  if (!rs.value?._id) return;
  const willCheck = !!ev?.target?.checked;

  // If user checks this key, select it; if they uncheck the same key, clear it.
  const next = willCheck ? key : (rs.value.postLocation === key ? null : rs.value.postLocation);

  // Update local model first
  rs.value.postLocation = next;

  // Keep checkbox visually in sync with our local decision
  if (ev?.target) ev.target.checked = next === key;

  // If switching AWAY from address_below, clear address/place and PATCH immediately
  if (next !== 'address_below') {
    rs.value.postPlace = null;
    rs.value.postAddress = '';
    try {
      await api.patch(`/tenant/runsheets/${rs.value._id}`, {
        postLocation: next,
        postAddress: '',
        postPlace: null,
      });
      stamp();
    } catch (e) {
      error.value = e?.response?.data?.error || 'Failed to save post-run destination';
    }
    return;
  }

  // If we *are* switching TO address_below, only PATCH if we ALREADY have addr or place.
  const hasAddress =
    !!(rs.value.postAddress && rs.value.postAddress.toString().trim());
  const hasPlace =
    !!(rs.value.postPlace && (rs.value.postPlace._id || rs.value.postPlace));

  if (!hasAddress && !hasPlace) {
    // Just let the UI show the checkbox and textarea/PlaceSearch;
    // backend will be updated later via choosePostPlace() or savePostLocation().
    return;
  }

  // We already have enough info, so it's safe to persist the address_below state now.
  try {
    await api.patch(`/tenant/runsheets/${rs.value._id}`, {
      postLocation: 'address_below',
      postAddress: rs.value.postAddress || '',
      postPlace:
        (rs.value.postPlace && rs.value.postPlace._id) ??
        rs.value.postPlace ??
        null,
    });
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to save post-run destination';
  }
}

// Choosing a place when 'address_below' is active (from <PlaceSearch />)
async function choosePostPlace(place) {
  if (!rs.value?._id) return;
  rs.value.postLocation = 'address_below';
  rs.value.postPlace = place;
  if (!rs.value.postAddress?.trim() && place?.address) {
    rs.value.postAddress = place.address;
  }
  try {
    await api.patch(`/tenant/runsheets/${rs.value._id}`, {
      postLocation: 'address_below',
      postPlace: place?._id ?? place,
      postAddress: rs.value.postAddress || '',
    });
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to set post place';
  }
}

// Clear the chosen place (keeps postLocation as address_below so user can type an address)
async function clearPostPlace() {
  if (!rs.value?._id) return;
  rs.value.postPlace = null;
  try {
    await api.patch(`/tenant/runsheets/${rs.value._id}`, { postPlace: null });
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to clear post place';
  }
}

// Persist textarea changes to the address (only relevant for address_below)
async function savePostLocation() {
  if (!rs.value?._id) return;
  try {
    await api.patch(`/tenant/runsheets/${rs.value._id}`, {
      postLocation: rs.value.postLocation ?? null,
      postAddress: rs.value.postLocation === 'address_below' ? (rs.value.postAddress || '') : '',
      postPlace: rs.value.postLocation === 'address_below'
        ? (rs.value.postPlace?._id ?? rs.value.postPlace ?? null)
        : null,
    });
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to save address';
  }
}

const onTogglePerson = (p, ev) => {
  const willCheck = ev.target.checked;
  selectedPersonId.value = willCheck ? p._id : null;
  ev.target.checked = willCheck;
  saveContactSelection();
};
const clearContact = () => { selectedPersonId.value = null; saveContactSelection(); };

const selectedPersonLabel = computed(() => {
  const id = selectedPersonId.value;
  if (!id) return '';
  const p = people.value.find(x => x._id === id);
  if (!p) return `#${id}`;
  const extra = [p.email, p.phone].filter(Boolean).join(' · ');
  return extra ? `${p.name} — ${extra}` : p.name;
});

/* ============================== Dates ============================== */
const dateStr = computed({
  get() { const d = rs.value && rs.value.date && new Date(rs.value.date); return d && !isNaN(d) ? d.toISOString().slice(0,10) : ''; },
  set(v) { if (rs.value) rs.value.date = v ? new Date(v).toISOString() : null; }
});
const pickupStr = computed({
  get() { const d = rs.value && rs.value.pickupDate && new Date(rs.value.pickupDate); return d && !isNaN(d) ? d.toISOString().slice(0,10) : ''; },
  set(v) { if (rs.value) rs.value.pickupDate = v ? new Date(v).toISOString() : null; }
});
const returnStr = computed({
  get() { const d = rs.value && rs.value.returnDate && new Date(rs.value.returnDate); return d && !isNaN(d) ? d.toISOString().slice(0,10) : ''; },
  set(v) { if (rs.value) rs.value.returnDate = v ? new Date(v).toISOString() : null; }
});
watch(() => rs.value && rs.value.pickupDate, (newPd) => {
  if (!rs.value || rs.value.purchaseType !== 'rental' || !newPd) return;
  if (!rs.value.returnDate || new Date(rs.value.returnDate) < new Date(newPd)) {
    const d = new Date(newPd); d.setDate(d.getDate() + 1);
    rs.value.returnDate = d.toISOString();
  }
});

// Upload photos to a catalog Item, then refresh attached list
async function uploadItemPhotos(item, e) {
  try {
    const fd = new FormData();
    [...(e.target?.files || [])].forEach(f => fd.append('photos', f));
    await api.post(`/tenant/items/${item._id}/photos`, fd, {
      
    });
    await refreshAttachedItems();
  } catch (err) {
    itemListError.value = err?.response?.data?.error || 'Failed to upload item photos';
  } finally {
    if (e?.target) e.target.value = '';
  }
}

// Update quantity of an attached (catalog) item
async function updateAttachedQuantity(ai, val) {
  const q = Number(val);
  if (!ai._id || !Number.isFinite(q) || q < 0) return;
  try {
    const id = rs.value && rs.value._id;
    await api.patch(`/tenant/runsheets/${id}/items/${ai._id}`, { quantity: q });
    await refreshAttachedItems();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to update quantity';
  }
}

// Create a new Item (JSON), optionally upload a photo, then attach to runsheet
async function createAndAddItem() {
  createItemError.value = '';
  if (!newItem.value.name.trim()) { createItemError.value = 'Name is required'; return; }
  creatingItem.value = true;
  try {
    // 1) Create item (JSON, not multipart)
    const body = {
      name: newItem.value.name.trim(),
      ...(newItem.value.description?.trim() ? { description: newItem.value.description.trim() } : {})
    };
    const created = await api.post('/tenant/items', body);

    // 2) If a photo was chosen, upload to /items/:id/photos (field "photos")
    if (newItem.value.file) {
      const fd = new FormData();
      fd.append('photos', newItem.value.file);
      await api.post(`/tenant/items/${created._id}/photos`, fd, {
  
      });
    }

    // 3) Attach to this runsheet
    await addItemToRunsheet(created._id, newItem.value.qty || 1);

    // 4) Keep search results fresh, clear form, and refresh attached items (to see photos)
    itemResults.value.unshift(created);
    newItem.value = { name: '', description: '', qty: 1, file: null, preview: '' };
    await refreshAttachedItems();
  } catch (e) {
    createItemError.value = e?.response?.data?.error || 'Failed to create item';
  } finally {
    creatingItem.value = false;
  }
}

const onPurchaseTypeChanged = async (ev) => {
  const current = rs.value && rs.value.purchaseType;
  const val = (ev && ev.target && ev.target.value || current) === 'rental' ? 'rental' : 'purchase';
  if (!rs.value) return;
  rs.value.purchaseType = val;
  if (val === 'rental') {
    const todayISO = new Date().toISOString();
    if (!rs.value.pickupDate) rs.value.pickupDate = todayISO;
    if (!rs.value.returnDate || new Date(rs.value.returnDate) < new Date(rs.value.pickupDate)) {
      const d = new Date(rs.value.pickupDate); d.setDate(d.getDate() + 1);
      rs.value.returnDate = d.toISOString();
    }
  }
  try {
    await api.patch(`/tenant/runsheets/${rs.value._id}`, {
      purchaseType: rs.value.purchaseType,
      ...(rs.value.purchaseType === 'rental' ? {
        pickupDate: rs.value.pickupDate,
        returnDate: rs.value.returnDate
      } : {})
    });
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to save purchase type';
  }
};

/* =========== Users search: PD + RD have independent state =========== */

// Pickup/Delivering
const pdSearch    = ref('');
const pdResults   = ref([]);
const pdSearching = ref(false);

// Return/Drop Off
const rdSearch    = ref('');
const rdResults   = ref([]);
const rdSearching = ref(false);

// --- Pickup search ---
const searchPdUsers = async () => {
  pdSearching.value = true;
  try {
    pdResults.value = await api.get('/tenant/members', {
      q: (pdSearch.value || '').trim()
    });
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to search users';
    pdResults.value = [];
  } finally {
    pdSearching.value = false;
  }
};

const selectCompletedBy = async (u) => {
  if (!rs.value) return;
  rs.value.pdCompletedBy = u;
  await savePickupDelivering();
};

const clearCompletedBy = async () => {
  if (!rs.value) return;
  rs.value.pdCompletedBy = null;
  await savePickupDelivering();
};

const completedByLabel = computed(() => {
  const v = rs.value && rs.value.pdCompletedBy;
  if (!v) return '';
  if (typeof v === 'string') {
    const hit = (pdResults.value || []).find(x => x._id === v);
    return hit ? (hit.name || hit.email || hit._id) : `#${v}`;
  }
  return v.name || v.email || v._id || '';
});

// --- Return search (with debounce) ---
let rdSearchTimer = null;
function debouncedSearchRdUsers() {
  clearTimeout(rdSearchTimer);
  rdSearchTimer = setTimeout(searchRdUsers, 300);
}

const searchRdUsers = async () => {
  rdSearching.value = true;
  try {
    rdResults.value = await api.get('/tenant/members', {
      q: (rdSearch.value || '').trim()
    });
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to search users';
    rdResults.value = [];
  } finally {
    rdSearching.value = false;
  }
};

const selectRdCompletedBy = async (u) => {
  if (!rs.value) return;
  rs.value.rdCompletedBy = u;
  await saveReturnDropoff();
};

const rdCompletedByLabel = computed(() => {
  const v = rs.value && rs.value.rdCompletedBy;
  if (!v) return '';
  if (typeof v === 'string') {
    const hit = (rdResults.value || []).find(x => x._id === v);
    return hit ? (hit.name || hit.email || hit._id) : `#${v}`;
  }
  return v.name || v.email || v._id || '';
});


/* ============================== Load ============================== */
const hydratePostPlace = async () => {
  if (rs.value && rs.value.postPlace && typeof rs.value.postPlace === 'string') {
    try { rs.value.postPlace = await api.get(`/tenant/places/${rs.value.postPlace}`); } catch (e) {}
  }
};

const load = async () => {
  try {
    rs.value = await api.get(`/tenant/runsheets/${route.params.id}`);

    // Defaults
    if (rs.value.purchaseType == null) rs.value.purchaseType = 'purchase';
    if (rs.value.pickupDate == null) rs.value.pickupDate = null;
    if (rs.value.returnDate == null) rs.value.returnDate = null;

    if (rs.value.takeTo == null) rs.value.takeTo = null;
    if (rs.value.set == null) rs.value.set = null;

    if (!Array.isArray(rs.value.photos)) rs.value.photos = rs.value.photos || [];
    if (!Array.isArray(rs.value.receipts)) rs.value.receipts = rs.value.receipts || [];

    if (!Array.isArray(rs.value.items)) rs.value.items = rs.value.items || [];

    if (rs.value.postLocation == null) rs.value.postLocation = null;
    if (rs.value.postAddress == null) rs.value.postAddress = '';
    if (rs.value.postPlace == null) rs.value.postPlace = null;

    if (rs.value.pdType == null) rs.value.pdType = null;
    if (rs.value.pdPaymentMethod == null) rs.value.pdPaymentMethod = null;
    if (rs.value.pdDate == null) rs.value.pdDate = null;
    if (rs.value.pdTime == null) rs.value.pdTime = '';
    if (rs.value.pdInstructions == null) rs.value.pdInstructions = '';
    if (rs.value.pdCompletedBy == null) rs.value.pdCompletedBy = null; // legacy UI
    if (rs.value.pdCompletedOn == null) rs.value.pdCompletedOn = null; // legacy UI

    if (rs.value.getInvoice == null) rs.value.getInvoice = false;
    if (rs.value.getDeposit == null) rs.value.getDeposit = false;
    if (rs.value.paid == null) rs.value.paid = false;
    if (rs.value.chequeNumber == null) rs.value.chequeNumber = '';
    if (rs.value.poNumber == null) rs.value.poNumber = '';
    rs.value.amount = Number.isFinite(+rs.value.amount) ? +rs.value.amount : 0;
    if (rs.value.receivedBy == null) rs.value.receivedBy = '';

    if (rs.value.rdType == null) rs.value.rdType = null;
    rs.value.rdCheque = !!rs.value.rdCheque;
    if (rs.value.rdDate == null) rs.value.rdDate = null;
    if (rs.value.rdTime == null) rs.value.rdTime = '';
    if (rs.value.rdInstructions == null) rs.value.rdInstructions = '';
    if (rs.value.rdCompletedBy == null) rs.value.rdCompletedBy = null;
    if (rs.value.rdCompletedOn == null) rs.value.rdCompletedOn = null;

    if (rs.value.qcItemsGood == null) rs.value.qcItemsGood = null;
    if (rs.value.qcSignatureData == null) rs.value.qcSignatureData = '';

    if (rs.value.supplier == null) rs.value.supplier = null;

    if (rs.value.set && typeof rs.value.set === 'string') {
      try { rs.value.set = await api.get(`/tenant/sets/${rs.value.set}`); } catch (e) {}
    }

    selectedPersonId.value = rs.value.contact
      ? (typeof rs.value.contact === 'string' ? rs.value.contact : (rs.value.contact && rs.value.contact._id) || null)
      : null;

    await hydratePostPlace();
    await refreshAttachedItems(); // hydrate runsheet-level items
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to load runsheet';
  }
};

/* ============================== QC / Signature ============================== */
const setItemsGood = async (val) => {
  if (!rs.value || !rs.value._id) return;
  itemsGoodSaving.value = true;
  try {
    rs.value.qcItemsGood = !!val;
    await api.patch(`/tenant/runsheets/${rs.value._id}`, { qcItemsGood: rs.value.qcItemsGood });
    stamp();
  } catch (e) {
    rs.value.qcItemsGood = null;
    error.value = e?.response?.data?.error || 'Failed to save condition';
  } finally {
    itemsGoodSaving.value = false;
  }
};

const getSigPos = (e) => {
  const rect = sigCanvas.value.getBoundingClientRect();
  const isTouch = e.touches && e.touches[0];
  const clientX = isTouch ? e.touches[0].clientX : e.clientX;
  const clientY = isTouch ? e.touches[0].clientY : e.clientY;
  const x = (clientX - rect.left) * (sigCanvas.value.width / rect.width);
  const y = (clientY - rect.top) * (sigCanvas.value.height / rect.height);
  return { x, y };
};
const sigStart = (e) => { if (!sigCtx) return; sigDrawing = true; const { x, y } = getSigPos(e); sigLastX = x; sigLastY = y; };
const sigMove = (e) => {
  if (!sigDrawing || !sigCtx) return;
  const { x, y } = getSigPos(e);
  sigCtx.beginPath(); sigCtx.moveTo(sigLastX, sigLastY); sigCtx.lineTo(x, y); sigCtx.stroke();
  sigLastX = x; sigLastY = y;
};
const sigEnd = () => { sigDrawing = false; };
const clearSignature = () => { if (sigCtx && sigCanvas.value) sigCtx.clearRect(0, 0, sigCanvas.value.width, sigCanvas.value.height); };
const initSignatureCanvas = () => {
  if (!sigCanvas.value) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = sigCanvas.value.clientWidth || 600;
  const cssH = sigCanvas.value.clientHeight || 180;
  sigCanvas.value.width = Math.round(cssW * dpr);
  sigCanvas.value.height = Math.round(cssH * dpr);
  sigCtx = sigCanvas.value.getContext('2d');
  sigCtx.scale(dpr, dpr);
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  sigCtx.lineWidth = 2;
  sigCtx.strokeStyle = '#111';
};
let sigResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(sigResizeTimer);
  sigResizeTimer = setTimeout(() => {
    initSignatureCanvas();        // QC
    initPickupSignatureCanvas();  // Pickup
    initReturnSignatureCanvas();  // Return
  }, 150);
});
const saveSignature = async () => {
  if (!rs.value || !rs.value._id || !sigCanvas.value) return;
  sigSaving.value = true;
  try {
    const dataUrl = sigCanvas.value.toDataURL('image/png');
    rs.value.qcSignatureData = dataUrl;
    await api.patch(`/tenant/runsheets/${rs.value._id}`, { qcSignatureData: dataUrl });
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to save signature';
  } finally { sigSaving.value = false; }
};

const initPickupSignatureCanvas = () => {
  if (!pdSigCanvas.value) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = pdSigCanvas.value.clientWidth || 600;
  const cssH = pdSigCanvas.value.clientHeight || 180;

  pdSigCanvas.value.width  = Math.round(cssW * dpr);
  pdSigCanvas.value.height = Math.round(cssH * dpr);

  pdSigCtx = pdSigCanvas.value.getContext('2d');
  pdSigCtx.scale(dpr, dpr);
  pdSigCtx.lineCap = 'round';
  pdSigCtx.lineJoin = 'round';
  pdSigCtx.lineWidth = 2;
  pdSigCtx.strokeStyle = '#111';
};

const initReturnSignatureCanvas = () => {
  if (!rdSigCanvas.value) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = rdSigCanvas.value.clientWidth || 600;
  const cssH = rdSigCanvas.value.clientHeight || 180;

  rdSigCanvas.value.width  = Math.round(cssW * dpr);
  rdSigCanvas.value.height = Math.round(cssH * dpr);

  rdSigCtx = rdSigCanvas.value.getContext('2d');
  rdSigCtx.scale(dpr, dpr);
  rdSigCtx.lineCap = 'round';
  rdSigCtx.lineJoin = 'round';
  rdSigCtx.lineWidth = 2;
  rdSigCtx.strokeStyle = '#111';
};


/* ============================== Return / Drop Off ============================== */
const rdDateStr = computed({
  get() { const d = rs.value && rs.value.rdDate && new Date(rs.value.rdDate); return d && !isNaN(d) ? d.toISOString().slice(0,10) : ''; },
  set(v) { if (rs.value) rs.value.rdDate = v ? new Date(v).toISOString() : null; }
});
const rdCompletedOnStr = computed({
  get() { const d = rs.value && rs.value.rdCompletedOn && new Date(rs.value.rdCompletedOn); return d && !isNaN(d) ? d.toISOString().slice(0,10) : ''; },
  set(v) { if (rs.value) rs.value.rdCompletedOn = v ? new Date(v).toISOString() : null; }
});
const onToggleRdCheque = async (ev) => { if (!rs.value) return; rs.value.rdCheque = !!ev.target.checked; ev.target.checked = rs.value.rdCheque; await saveReturnDropoff(); };

const saveReturnDropoff = async () => {
  if (!rs.value || !rs.value._id) return;
  try {
    await api.patch(`/tenant/runsheets/${rs.value._id}`, {
      rdType: rs.value.rdType ?? null,
      rdCheque: !!rs.value.rdCheque,
      rdDate: rs.value.rdDate ?? null,
      rdTime: rs.value.rdTime || '',
      rdInstructions: rs.value.rdInstructions || '',
      rdCompletedBy: (rs.value.rdCompletedBy && rs.value.rdCompletedBy._id) ?? rs.value.rdCompletedBy ?? null,
      rdCompletedOn: rs.value.rdCompletedOn ?? null,
    });
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to save return/drop-off';
  }
};

/* ============================== Pickup / Delivering ============================== */
const pdDateStr = computed({
  get() { const d = rs.value && rs.value.pdDate && new Date(rs.value.pdDate); return d && !isNaN(d) ? d.toISOString().slice(0,10) : ''; },
  set(v) { if (rs.value) rs.value.pdDate = v ? new Date(v).toISOString() : null; }
});
const dateFinishedStr = computed({
  get() {
    const d = rs.value?.pdCompletedOn && new Date(rs.value.pdCompletedOn);
    return d && !isNaN(d) ? d.toISOString().slice(0,10) : '';
  },
  set(v) {
    if (rs.value) rs.value.pdCompletedOn = v ? new Date(v).toISOString() : null;
  }
});
const savePickupDelivering = async () => {
  if (!rs.value || !rs.value._id) return;
  try {
    await api.patch(`/tenant/runsheets/${rs.value._id}`, {
      pdType: rs.value.pdType ?? null,
      pdPaymentMethod: rs.value.pdPaymentMethod ?? null,
      pdDate: rs.value.pdDate ?? null,
      pdTime: rs.value.pdTime || '',
      pdInstructions: rs.value.pdInstructions || '',
      pdCompletedBy: (rs.value.pdCompletedBy && rs.value.pdCompletedBy._id) ?? rs.value.pdCompletedBy ?? null,
      pdCompletedOn: rs.value.pdCompletedOn ?? null,
    });
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to save pickup/delivering';
  }
};
/* ======================== Validate & Save core ======================== */
const validateBeforeSave = () => {
  if (rs.value && rs.value.purchaseType === 'rental') {
    if (!rs.value.pickupDate || !rs.value.returnDate) { error.value = 'Rental runsheets require both pickup and return dates.'; return false; }
    if (new Date(rs.value.returnDate) < new Date(rs.value.pickupDate)) { error.value = 'Return date cannot be before pickup date.'; return false; }
  }
  if (rs.value && rs.value.postLocation === 'address_below' && !(rs.value.postAddress || '').trim()) {
    if (!(rs.value.postPlace && rs.value.postPlace.address)) { error.value = 'Please provide the address for "Address Below".'; return false; }
  }
  return true;
};
const savePurchase = async () => {
  if (!rs.value || !rs.value._id) return;
  try {
    await api.patch(`/tenant/runsheets/${rs.value._id}`, {
      getInvoice: !!rs.value.getInvoice,
      getDeposit: !!rs.value.getDeposit,
      paid: !!rs.value.paid,
      chequeNumber: rs.value.chequeNumber || '',
      poNumber: rs.value.poNumber || '',
      amount: Number.isFinite(+rs.value.amount) ? +rs.value.amount : 0,
      receivedBy: (rs.value.receivedBy || '').trim()
    });
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to save purchase info';
  }
};

const save = async () => {
  if (!rs.value || !rs.value._id) return;
  if (!validateBeforeSave()) return;
  saving.value = true; error.value = '';

  try {
    // NOTE: runsheet-level items are managed via dedicated endpoints, not here.
    const payload = {
      title: rs.value.title,
      status: rs.value.status,
      date: rs.value.date,
      purchaseType: rs.value.purchaseType,
      pickupDate: rs.value.pickupDate,
      returnDate: rs.value.returnDate,
      takeTo: (rs.value.takeTo && rs.value.takeTo._id) ?? rs.value.takeTo ?? null,
      set: (rs.value.set && rs.value.set._id) ?? rs.value.set ?? null,
      supplier: (rs.value.supplier && rs.value.supplier._id) ?? rs.value.supplier ?? null,
      postLocation: rs.value.postLocation ?? null,
      postAddress: rs.value.postLocation === 'address_below'
        ? (rs.value.postAddress || (rs.value.postPlace && rs.value.postPlace.address) || '')
        : '',
      postPlace: rs.value.postLocation === 'address_below'
        ? ((rs.value.postPlace && rs.value.postPlace._id) ?? rs.value.postPlace ?? null)
        : null,
      getInvoice: !!rs.value.getInvoice,
      getDeposit: !!rs.value.getDeposit,
      paid: !!rs.value.paid,
      chequeNumber: rs.value.chequeNumber || '',
      poNumber: rs.value.poNumber || '',
      amount: Number.isFinite(+rs.value.amount) ? +rs.value.amount : 0,
      receivedBy: (rs.value.receivedBy || '').trim(),
      pdType: rs.value.pdType ?? null,
      pdPaymentMethod: rs.value.pdPaymentMethod ?? null,
      pdDate: rs.value.pdDate ?? null,
      pdTime: rs.value.pdTime || '',
      pdInstructions: rs.value.pdInstructions || '',
      pdCompletedBy:rs.value.pdCompletedBy,
      pdCompletedOn:rs.value.pdCompletedOn,
      rdType: rs.value.rdType ?? null,
      rdCheque: !!rs.value.rdCheque,
      rdDate: rs.value.rdDate ?? null,
      rdTime: rs.value.rdTime || '',
      rdInstructions: rs.value.rdInstructions || '',
      rdCompletedBy: (rs.value.rdCompletedBy && rs.value.rdCompletedBy._id) ?? rs.value.rdCompletedBy ?? null,
      rdCompletedOn: rs.value.rdCompletedOn ?? null,
    };

    rs.value = await api.patch(`tenant/runsheets/${rs.value._id}`, payload);

    if (!Array.isArray(rs.value.photos)) rs.value.photos = rs.value.photos || [];
    if (!Array.isArray(rs.value.receipts)) rs.value.receipts = rs.value.receipts || [];
    if (!Array.isArray(rs.value.items)) rs.value.items = rs.value.items || [];

    if (rs.value.set && typeof rs.value.set === 'string') {
      try { rs.value.set = await api.get(`/tenant/sets/${rs.value.set}`); } catch (e) {}
    }
    await hydratePostPlace();
    await refreshAttachedItems(); // keep rs.items synced after save
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to save';
  } finally {
    saving.value = false;
  }
};

/* ============================ Media ============================ */
const apiBase = (import.meta.env.IMAGE_BASE || '');
const IMAGE_BASE = import.meta.env.VITE_IMAGE_BASE || '/api'; // leave empty for same-origin

function imageUrl(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p; // already absolute
  let path = String(p);

  // normalize to /uploads/...
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  if (!path.startsWith('/uploads/')) {
    path = '/uploads/' + path.replace(/^\/+/, '');
  }

  // encode just the filename, not the whole path
  const parts = path.split('/');
  const file = parts.pop();
  return (IMAGE_BASE + [...parts, encodeURIComponent(file)].join('/'));
}
const isImage = (path) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path || '');

const uploadPhotos = async (e) => {
  const fd = new FormData();
  [...e.target.files].forEach(f => fd.append('photos', f));
  try {
    const resp = await api.post(`/tenant/runsheets/${rs.value._id}/photos`, fd);
    rs.value.photos = resp.photos;
    stamp();
  } catch (e2) {
    console.log(error);
    error.value = e2?.response?.data?.error || 'Failed to upload photos';
  } finally { e.target.value = ''; }
};
const removePhoto = async (url) => {
  try {
    const resp = await api.del(`/tenant/runsheets/${rs.value._id}/photos`, { url });
    rs.value.photos = resp.photos; stamp();
  } catch (e) { error.value = e?.response?.data?.error || 'Failed to remove photo'; }
};

const uploadReceipts = async (e) => {
  const fd = new FormData();
  [...e.target.files].forEach(f => fd.append('receipts', f));
  try {
    const resp = await api.post(`/tenant/runsheets/${rs.value._id}/receipts`, fd,);
    rs.value.receipts = resp.receipts || []; stamp();
  } catch (e2) {
    error.value = e2?.response?.data?.error || 'Failed to upload receipts';
  } finally { e.target.value = ''; }
};
const removeReceipt = async (url) => {
  try {
    const resp = await api.del(`tenant/runsheets/${rs.value._id}/receipts`, { url });
    rs.value.receipts = resp.receipts || []; stamp();
  } catch (e) { error.value = e?.response?.data?.error || 'Failed to remove receipt'; }
};

/* ============================ Stops ============================ */
const addStop = async (place) => {
  try {
    const updated = await api.post(`/tenant/runsheets/${rs.value._id}/stops`, { place: place._id, title: place.name, instructions: '' });
    rs.value = updated; stamp();
  } catch (e) { error.value = e?.response?.data?.error || 'Failed to add stop'; }
};
const saveStop = async (s) => {
  try {
    const updated = await api.patch(`/tenant/runsheets/${rs.value._id}/stops/${s._id}`, s);
    rs.value = updated; stamp();
  } catch (e) { error.value = e?.response?.data?.error || 'Failed to save stop'; }
};
const removeStop = async (stopId) => {
  if (!confirm('Remove this stop?')) return;
  try {
    const updated = await api.del(`/tenant/runsheets/${rs.value._id}/stops/${stopId}`);
    rs.value = updated; stamp();
  } catch (e) { error.value = e?.response?.data?.error || 'Failed to remove stop'; }
};
const moveStopUp = async (idx) => {
  if (idx <= 0) return;
  const arr = [...rs.value.stops];
  const [moved] = arr.splice(idx, 1);
  arr.splice(idx - 1, 0, moved);
  rs.value.stops = arr;
  await save();
};
const moveStopDown = async (idx) => {
  if (idx >= rs.value.stops.length - 1) return;
  const arr = [...rs.value.stops];
  const [moved] = arr.splice(idx, 1);
  arr.splice(idx + 1, 0, moved);
  rs.value.stops = arr;
  await save();
};

/* ========= RUNSHEET-LEVEL ITEMS: search / attach / remove / create+attach ========= */
const itemSearch     = ref('');
const itemResults    = ref([]);
const searchingItems = ref(false);
const itemListError  = ref('');
const attachedItems  = ref([]);

// Get attached items
async function refreshAttachedItems () {
  if (!rs.value || !rs.value._id) return;
  try {
    const data = await api.get(`/tenant/runsheets/${rs.value._id}/items`);
    const arr = Array.isArray(data) ? data : (data && data.items) || [];
    attachedItems.value = arr;
    rs.value.items = arr;
  } catch (e) {
    attachedItems.value = Array.isArray(rs.value && rs.value.items) ? rs.value.items : [];
  }
}

// Search catalog items
async function searchItems() {
  itemListError.value = '';
  searchingItems.value = true;
  try {
    const params = { q: (itemSearch.value || '').trim(), limit: 25 };
    itemResults.value = await api.get('/tenant/items', params);
  } catch (e) {
    itemListError.value = e?.response?.data?.error || 'Failed to load items';
    itemResults.value = [];
  } finally {
    searchingItems.value = false;
  }
}

// Attach an existing item to the runsheet
async function addItemToRunsheet(itemOrId, qty = 1) {
  const id = rs.value && rs.value._id;
  const itemId = typeof itemOrId === 'string' ? itemOrId : itemOrId && itemOrId._id;
  if (!id || !itemId) return;
  try {
    const resp = await api.post(`/tenant/runsheets/${id}/items`, { itemId, quantity: qty || 1 });
    if (Array.isArray(resp)) {
      attachedItems.value = resp;
      rs.value.items = resp;
    } else if (resp && resp.items) {
      attachedItems.value = resp.items;
      rs.value.items = resp.items;
    } else {
      await refreshAttachedItems();
    }
    stamp();
  } catch (e) {
    alert(e?.response?.data?.error || 'Could not attach item to runsheet');
  }
}

// Keep template calls working: "addItemToStop(stopId, it)" now attaches to RUNSHEET
async function addItemToStop(_stopId, it) {
  await addItemToRunsheet(it, 1);
}

// Remove an attached item
async function removeAttachedItem(itemId) {
  const id = rs.value && rs.value._id;
  if (!id || !itemId) return;
  try {
    const resp = await api.del(`/tenant/runsheets/${id}/items/${itemId}`);
    if (Array.isArray(resp)) {
      attachedItems.value = resp;
      rs.value.items = resp;
    } else if (resp && resp.items) {
      attachedItems.value = resp.items;
      rs.value.items = resp.items;
    } else {
      await refreshAttachedItems();
    }
    stamp();
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to remove item from runsheet';
  }
}

// Create a new Item (with image) and attach it to the runsheet
const newItem = ref({ name: '', description: '', qty: 1, file: null, preview: '' });
const creatingItem    = ref(false);
const createItemError = ref('');
function onNewItemImage(e) {
  const f = e.target && e.target.files && e.target.files[0] || null;
  newItem.value.file = f;
  newItem.value.preview = f ? URL.createObjectURL(f) : '';
}
async function createAndAddItemToStop(_stopId_ignored) {
  createItemError.value = '';
  if (!newItem.value.name.trim()) { createItemError.value = 'Name is required'; return; }
  creatingItem.value = true;
  try {
    const fd = new FormData();
    fd.append('name', newItem.value.name.trim());
    if (newItem.value.description && newItem.value.description.trim()) fd.append('description', newItem.value.description.trim());
    if (newItem.value.file) fd.append('image', newItem.value.file);

    const created = await api.post('/tenant/items', fd);
    await addItemToRunsheet(created._id, newItem.value.qty || 1);
    itemResults.value.unshift(created);
    newItem.value = { name: '', description: '', qty: 1, file: null, preview: '' };
  } catch (e) {
    createItemError.value = e?.response?.data?.error || 'Failed to create item';
  } finally { creatingItem.value = false; }
}

// Template might still offer "run item photos" per stop; now it’s N/A
const removeRunItem = async (_stopId, _idx) => {
  alert('Run-item rows are now runsheet-level. Remove from the “Attached Items” list instead.');
};
const uploadRunItemPhotos = async (_stopId, _idx, e) => {
  e.target.value = '';
  alert('Per-stop item photos are no longer supported. Add images to the Item itself.');
};

/* ============================ Assign to driver ============================ */
const userSearch = ref('');
const userResults = ref([]);
const searchUsers = async () => {
  try { userResults.value = await api.get('/tenant/members', { q: userSearch.value }); }
  catch (e) { error.value = e?.response?.data?.error || 'Failed to search users'; }
};
const assign = async (u) => {
  try { rs.value = await api.post(`/tenant/runsheets/${rs.value._id}/assign`, { userId: u._id }); stamp(); }
  catch (e) { error.value = e?.response?.data?.error || 'Failed to assign'; }
};

/* ============================ Destination (Place) ============================ */
const setTakeTo = async (place) => {
  try { rs.value = await api.patch(`/tenant/runsheets/${rs.value._id}`, { takeTo: place._id || place }); stamp(); }
  catch (e) { error.value = e?.response?.data?.error || 'Failed to set destination'; }
};
const clearTakeTo = async () => {
  try { rs.value = await api.patch(`/tenant/runsheets/${rs.value._id}`, { takeTo: null }); stamp(); }
  catch (e) { error.value = e?.response?.data?.error || 'Failed to clear destination'; }
};

/* ============================ Sets ============================ */
const setSearch = ref('');
const setResults = ref([]);
const searchSets = async () => {
  try { setResults.value = await api.get('/tenant/sets', setSearch.value ? { q: setSearch.value } : undefined); }
  catch (e) { error.value = e?.response?.data?.error || 'Failed to search sets'; }
};
const chooseSet = async (s) => {
  try { rs.value = await api.patch(`/tenant/runsheets/${rs.value._id}`, { set: s._id }); rs.value.set = s; stamp(); }
  catch (e) { error.value = e?.response?.data?.error || 'Failed to link set'; }
};
const clearSet = async () => {
  try { rs.value = await api.patch(`/tenant/runsheets/${rs.value._id}`, { set: null }); rs.value.set = null; stamp(); }
  catch (e) { error.value = e?.response?.data?.error || 'Failed to clear set'; }
};
const currentSetLabel = computed(() => {
  const v = rs.value && rs.value.set; if (!v) return ''; if (typeof v === 'string') return `#${v}`; return `${v.number} — ${v.name}`;
});

/* ============================ Supplier (separate) ============================ */
const selectedSupplier = ref(null);
const searching = ref(false);
const listError = ref('');
const suppliers = ref([]);
const search = ref('');
const creating = ref(false);
const createError = ref('');
const createForm = ref({ name: '', address: '', phone: '', contactName: '', hours: '' });

let searchTimer;
function debouncedFetchSuppliers(delay = 300) { clearTimeout(searchTimer); searchTimer = setTimeout(fetchSuppliers, delay); }
async function fetchSuppliers() {
  listError.value = ''; searching.value = true; suppliers.value = [];
  try { const q = (search.value || '').trim(); suppliers.value = await api.get('/tenant/suppliers', { q }); }
  catch (e) { listError.value = e?.response?.data?.error || 'Failed to load suppliers'; }
  finally { searching.value = false; }
}
async function persistSupplier(idOrNull) {
  if (!rs.value || !rs.value._id) return;
  saving.value = true;
  try { rs.value = await api.patch(`/tenant/runsheets/${rs.value._id}`, { supplier: idOrNull }); }
  finally { saving.value = false; }
}
async function chooseSupplier(s) {
  try { await persistSupplier(s._id); selectedSupplier.value = s; stamp(); }
  catch (e) { error.value = e?.response?.data?.error || 'Failed to set supplier'; }
}
async function clearSupplier() {
  try { await persistSupplier(null); selectedSupplier.value = null; stamp(); }
  catch (e) { error.value = e?.response?.data?.error || 'Failed to clear supplier'; }
}
function startChangeSupplier() { selectedSupplier.value = null; suppliers.value = []; search.value = ''; listError.value = ''; }
async function createSupplier() {
  createError.value = '';
  const body = {
    name: (createForm.value.name || '').trim(),
    address: (createForm.value.address || '').trim(),
    phone: (createForm.value.phone || '').trim() || undefined,
    contactName: (createForm.value.contactName || '').trim() || undefined,
    hours: (createForm.value.hours || '').trim() || undefined,
  };
  if (!body.name || !body.address) { createError.value = 'Name and address are required.'; return; }
  creating.value = true;
  try {
    const s = await api.post('/tenant/suppliers', body);
    await persistSupplier(s._id);
    selectedSupplier.value = s;
    createForm.value = { name: '', address: '', phone: '', contactName: '', hours: '' };
    stamp();
  } catch (e) {
    createError.value = e?.response?.data?.error || 'Failed to create supplier';
  } finally { creating.value = false; }
}

/* ============================ Misc ============================ */
const mapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
// Prefer route param, then tenant store, then a safe default
const slug = computed(() => route.params.slug ?? tenant.slug ?? 'demo')

// Used by the Back to list button
function goToRunsheets() {
  if (router.hasRoute('runsheets')) {
    router.push({ name: 'runsheets', params: { slug: slug.value } })
  } else {
    // Fallback if you don’t have a named route
    router.push(`/${slug.value}/runsheets`)
  }
}
const goToRunsheetView = () => {
  const id = rs.value && rs.value._id; if (!id) return;
  router.push({ name: 'runsheet-view', params: { id } })
    .catch(() => router.push(`/runsheets/${id}`))
    .catch(() => {});
};

/* ---------------- Pickup signature handlers ---------------- */
const pdSigStart = (e) => {
  if (!pdSigCtx) return;
  pdSigDrawing = true;
  const { x, y } = getCanvasPos(pdSigCanvas, e);
  pdSigLastX = x;
  pdSigLastY = y;
};
const pdSigMove = (e) => {
  if (!pdSigDrawing || !pdSigCtx) return;
  const { x, y } = getCanvasPos(pdSigCanvas, e);
  pdSigCtx.beginPath();
  pdSigCtx.moveTo(pdSigLastX, pdSigLastY);
  pdSigCtx.lineTo(x, y);
  pdSigCtx.stroke();
  pdSigLastX = x;
  pdSigLastY = y;
};
const pdSigEnd = () => { pdSigDrawing = false; };
const pdSigClear = () => {
  if (pdSigCtx && pdSigCanvas.value) {
    pdSigCtx.clearRect(0, 0, pdSigCanvas.value.width, pdSigCanvas.value.height);
  }
};
const savePdSignature = async () => {
  if (!rs.value || !rs.value._id || !pdSigCanvas.value) return;
  pdSigSaving.value = true;
  try {
    const dataUrl = pdSigCanvas.value.toDataURL('image/png');
    rs.value.pdSignatureData = dataUrl;
    await api.patch(`/tenant/runsheets/${rs.value._id}`, { pdSignatureData: dataUrl });
    stamp();
  } finally {
    pdSigSaving.value = false;
  }
};

/* ---------------- Return signature handlers ---------------- */
const rdSigStart = (e) => {
  if (!rdSigCtx) return;
  rdSigDrawing = true;
  const { x, y } = getCanvasPos(rdSigCanvas, e);
  rdSigLastX = x;
  rdSigLastY = y;
};
const rdSigMove = (e) => {
  if (!rdSigDrawing || !rdSigCtx) return;
  const { x, y } = getCanvasPos(rdSigCanvas, e);
  rdSigCtx.beginPath();
  rdSigCtx.moveTo(rdSigLastX, rdSigLastY);
  rdSigCtx.lineTo(x, y);
  rdSigCtx.stroke();
  rdSigLastX = x;
  rdSigLastY = y;
};
const rdSigEnd = () => { rdSigDrawing = false; };
const rdSigClear = () => {
  if (rdSigCtx && rdSigCanvas.value) {
    rdSigCtx.clearRect(0, 0, rdSigCanvas.value.width, rdSigCanvas.value.height);
  }
};
const saveRdSignature = async () => {
  if (!rs.value || !rs.value._id || !rdSigCanvas.value) return;
  rdSigSaving.value = true;
  try {
    const dataUrl = rdSigCanvas.value.toDataURL('image/png');
    rs.value.rdSignatureData = dataUrl;
    await api.patch(`/tenant/runsheets/${rs.value._id}`, { rdSignatureData: dataUrl });
    stamp();
  } finally {
    rdSigSaving.value = false;
  }
};

onMounted(async () => {
  loading.value = true;
  try {
    try { me.value = await auth.fetchMe(); } catch (e) {}
    await Promise.all([loadPeople(), searchSets(), load()]);
    if (rs.value && rs.value.supplier) {
      selectedSupplier.value = typeof rs.value.supplier === 'object'
        ? rs.value.supplier
        : await api.get(`/tenant/suppliers/${rs.value.supplier}`).catch(() => null);
    }
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to initialize runsheet';
  } finally {
  loading.value = false;
  setTimeout(() => {
    initSignatureCanvas();        // QC
    initPickupSignatureCanvas();  // Pickup
    initReturnSignatureCanvas();  // Return
  }, 0);
}})
</script>










<style scoped>
/* ---------- Layout ---------- */
.container {
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px 16px;
}

/* ---------- Panels / Cards ---------- */
.panel {
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,.04);
  padding: 14px 16px;
  margin-bottom: 12px;
}
.panel--danger {
  border-color: #ffe2df;
  background: #fff8f7;
}
.header {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: end;
}
.header .input--title {
  grid-column: 1 / -1;
}
.header__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  grid-column: 1 / -1;
}
.saved { margin-left: auto; }

/* ---------- Typography ---------- */
.subtitle { font-size: 16px; font-weight: 700; color: #111827; margin: 0; }
.mini-title { font-size: 14px; font-weight: 600; }

/* ---------- Rows / Fields ---------- */
.row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.row--wrap { flex-wrap: wrap; }
.row--tight { justify-content: flex-start; gap: 8px; }
.field { display: grid; gap: 6px; }
.field.w-full { width: 100%; }
.label { font-size: 12px; color: #6b7280; }

/* ---------- Inputs ---------- */
.input,
.select,
.textarea {
  border: 1px solid #d6d6d6;
  background: #fff;
  color: #111;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.input { height: 34px; }
.input--title {
  height: 40px;
  font-size: 18px;
  font-weight: 600;
}
.input--date { width: 220px; }
.input--qty { width: 82px; text-align: right; }
.textarea { width: 100%; resize: vertical; min-height: 72px; }
.select { height: 34px; }

@media (max-width: 920px) {
  .header { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .header { grid-template-columns: 1fr; }
  .input--date, .select { width: 100%; }
}

/* ---------- Radios / Checkboxes ---------- */
.radio, .checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  background: #fafafa;
  cursor: pointer;
  user-select: none;
}
.radio input, .checkbox input { accent-color: #111827; }

/* ---------- Buttons ---------- */
.btn {
  appearance: none;
  border: 1px solid #d6d6d6;
  background: #f7f7f7;
  color: #1f2937;
  font: inherit;
  font-size: 14px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  transition: background .15s ease, border-color .15s ease, transform .02s ease;
}
.btn:hover { background: #efefef; border-color: #cdcdcd; }
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: .6; cursor: not-allowed; }
.btn--primary {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.btn--primary:hover { background: #0b1220; border-color: #0b1220; }
.btn--danger {
  background: #fff;
  color: #b42318;
  border-color: #f1b3ac;
}
.btn--danger:hover { background: #fff5f5; border-color: #eba79f; }
.btn--ghost {
  background: #fff;
  color: #1f2937;
}

/* ---------- Pills (search results) ---------- */
.pillbar {
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;
}
.pill {
  border: 1px solid #e7e7e7;
  background: #fafafa;
  color: #111;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
}
.pill:hover { background: #f2f2f2; }

/* ---------- Select list (People) ---------- */
.selectlist { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.selectlist__item { background: #fff; border: 1px solid #ececec; border-radius: 10px; }
.selectlist__row {
  display: grid;
  grid-template-columns: 22px 1fr;
  gap: 10px; padding: 10px 12px; cursor: pointer;
}
.selectlist__meta { min-width: 0; }
.selectlist__title { font-weight: 600; }
.selectlist__sub { font-size: 12px; color: #6b7280; }

/* ---------- Images / Thumbs ---------- */
.thumbs { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
.thumb { position: relative; width: 84px; height: 84px; }
.thumb__img {
  width: 100%; height: 100%;
  object-fit: cover;
  border: 1px solid #eee;
  border-radius: 10px;
  background: #fafafa;
}
.chip {
  position: absolute; top: -6px; right: -6px;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #dcdcdc;
  display: grid; place-items: center;
  cursor: pointer;
}
.chip--x { font-weight: 600; }
.thumbs--small { gap: 6px; }
.thumb__img--sm {
  width: 56px; height: 56px;
  border-radius: 8px;
}

/* ---------- Stops ---------- */
.stop.card {
  border: 1px solid #ececec;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0,0,0,.04);
  padding: 12px;
  display: grid;
  gap: 10px;
}
.stop__head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.stop__meta { min-width: 0; }
.stop__title { font-weight: 700; }
.stop__addr { color: #6b7280; font-size: 12px; }
.stop__actions { display: flex; gap: 8px; }

/* ---------- Items within Stop ---------- */
.items { display: grid; gap: 10px; }
.item.card {
  border: 1px solid #f0f0f0; border-radius: 10px; padding: 10px 12px; background: #fff;
}
.item__row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.item__name { font-weight: 600; }
.qty { display: inline-flex; align-items: center; gap: 6px; }

/* ---------- Links ---------- */
.link { color: #0b1220; text-decoration: underline; }
.link--small { font-size: 12px; }

/* ---------- Signature ---------- */
.sigpad {
  border: 1px dashed #d6d6d6;
  border-radius: 8px;
  background: #fff;
}
.sigpad:active { cursor: crosshair; }

/* ---------- Helpers ---------- */
.muted { color: #6b7280; font-size: 12px; }
.error {
  margin-top: 12px;
  color: #b42318;
  background: #fff1f0;
  border: 1px solid #ffd7d5;
  padding: 10px 12px;
  border-radius: 8px;
}
.empty { padding: 12px; text-align: center; color: #6b7280; }
.mt-1 { margin-top: 6px; }
.mt-2 { margin-top: 10px; }
.ml-auto { margin-left: auto; }

/* ---------- Footer danger row ---------- */
.danger-footer .row { align-items: center; }

/* ---------- Responsive ---------- */
@media (max-width: 760px) {
  .stop__head { flex-direction: column; align-items: flex-start; }
  .header__actions { justify-content: flex-start; }
}
</style>
