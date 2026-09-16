const WORKER_URL = "https://sneaky-clean-booking.drew-martin331.workers.dev";

const SERVICES = {
  refresh: {
    title: "Refresh Detail",
    subtitle: "Maintenance clean for already-cared-for vehicles",
    tiers: [
      { id: "BYS5Z5ZZU3IQ3SPMKWPSWOF4", label: "Coupe/Sedan - $199 (2h)" },
      { id: "2M4CO7VFX5KWGGJNWLTFN23O", label: "Small SUV / Small Truck - $229 (2h)" },
      { id: "GF7DA4MDHU4QX52PHBP3ZR7K", label: "Large SUV / 3-Row / Full-Size Truck - $259 (2.5h)" },
    ],
  },
  reset: {
    title: "Full Reset Detail",
    subtitle: "Full reset for daily drivers and family vehicles",
    tiers: [
      { id: "AU7PB35CEVMIJ2CUVNVPNPIF", label: "Coupe/Sedan - $299 (4h)" },
      { id: "ZWDOB5W4BMA64NTEDPXJAWZI", label: "Small SUV / Small Truck - $349 (4.5h)" },
      { id: "IGLRLIZGH4PVEBWNGCZOAS6M", label: "Large SUV / 3-Row / Full-Size Truck - $399 (5h)" },
    ],
  },
  "rescue-quote": {
    title: "Free Photo Review",
    subtitle: "30-minute review for package recommendation or heavily soiled vehicles",
    tiers: [{ id: "37OHZSEUAONVHAKJMBQ4YH6U", label: "Photo Review (free, 30 min)" }],
  },
  "ceramic-consult": {
    title: "Ceramic Coating Consultation",
    subtitle: "30-minute review for ceramic / paint correction / glass coating quotes. Free.",
    tiers: [{ id: "OQGOMIQAC6HVDZHPAXUE2JBL", label: "Consultation (free, 30 min)" }],
  },
  "paint-correction-consult": {
    title: "Paint Correction Consultation",
    subtitle: "30-minute review for swirl removal and gloss correction quotes. Free.",
    tiers: [{ id: "3O2UULVW527PIY5VBRHMHIAK", label: "Consultation (free, 30 min)" }],
  },
};

const el = (id) => document.getElementById(id);
const MEMBERSHIPS = globalThis.SneakyCleanMemberships;
if (MEMBERSHIPS) {
  SERVICES.membership = {
    title: "Start Your Membership",
    subtitle: "Choose your membership and book the initial deep clean for one vehicle.",
    tiers: MEMBERSHIPS.square.initialClean.variations.map((v) => ({
      id: v.id,
      label: `${v.name} — $${v.priceCents / 100} initial clean (${v.durationMinutes / 60}h)`,
    })),
  };
}

const SMS_LINK = 'sms:+17178709439?&body=Hi%20Sneaky%20Clean!%20I%20couldn%27t%20find%20a%20time%20online%20%E2%80%94%20can%20you%20fit%20me%20in%3F';
const DIRECT_BOOK_KEYS = ["refresh", "reset", "membership"];
const SELF_BOOK_DAYS = [1, 3, 5]; // Mon, Wed, Fri
const BUSINESS_TIME_ZONE = "America/Chicago";
const IS_FILE_PREVIEW = location.protocol === "file:";

const state = {
  serviceKey: null,
  service: null,
  variationId: null,
  slot: null,
  nextOpenDate: null,
  dateChosen: false,
  membershipPlan: "undercover",
  membershipVehicles: "1",
  membershipVehicle: "1",
  membershipSchedule: "every-two-weeks",
  membershipBookedVehicles: [],
  submitting: false,
};

const modal = el("booking-modal");
const modalPanel = modal.querySelector(".booking-modal__panel");
const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

let lastFocusedElement = null;
let bodyOverflowBeforeModal = "";
let bookingCloseTimer = null;
let slotsRequest = 0;

function businessDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, "0"),
    String(result.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function firstBookableDate() {
  return addCalendarDays(businessDateKey(), 1);
}

function bookableDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    && date >= firstBookableDate()
    && SELF_BOOK_DAYS.includes(new Date(`${date}T12:00:00Z`).getUTCDay());
}

// Resolve midnight in Tennessee, independent of the customer's time zone.
function businessMidnight(date) {
  const target = Date.parse(`${date}T00:00:00Z`);
  let instant = target;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
    instant += target - Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  }
  return new Date(instant).toISOString();
}

function populateDates(preferredDate) {
  let select = el("date");
  // Also repair a cached page containing the old unrestricted date input.
  if (select.tagName !== "SELECT") {
    const replacement = document.createElement("select");
    replacement.id = "date";
    select.replaceWith(replacement);
    select = replacement;
  }
  select.innerHTML = "";
  const first = firstBookableDate();
  for (let day = 0; day < 56; day++) {
    const date = addCalendarDays(first, day);
    if (!bookableDate(date)) continue;
    const option = document.createElement("option");
    option.value = date;
    option.textContent = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC", weekday: "long", month: "short", day: "numeric",
    });
    select.appendChild(option);
  }
  if (Array.from(select.options).some((option) => option.value === preferredDate)) select.value = preferredDate;
  select.disabled = IS_FILE_PREVIEW;
  select.onchange = () => { state.dateChosen = true; loadSlots(); };
}

function liveBookingLink() {
  return `https://www.sneakycleantn.com/#sc-bookvar-${encodeURIComponent(state.variationId)}`;
}

function getFocusableElements() {
  return Array.from(modalPanel.querySelectorAll(focusableSelector)).filter((element) => {
    return !element.closest("[hidden]") && element.getClientRects().length > 0;
  });
}

function handleModalKeydown(event) {
  if (!modal.classList.contains("is-open")) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeBooking();
    return;
  }

  if (event.key !== "Tab") return;

  const focusableElements = getFocusableElements();
  if (!focusableElements.length) {
    event.preventDefault();
    modalPanel.focus();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const focusIsInsideModal = modal.contains(document.activeElement);

  if (event.shiftKey && (!focusIsInsideModal || document.activeElement === firstElement)) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && (!focusIsInsideModal || document.activeElement === lastElement)) {
    event.preventDefault();
    firstElement.focus();
  }
}

function openBooking(serviceKey, variationId, preferredDate) {
  if (state.submitting) return;
  const service = SERVICES[serviceKey];
  if (!service) return;

  const wasOpen = modal.classList.contains("is-open");
  if (!wasOpen && serviceKey === "membership") state.membershipBookedVehicles = [];
  if (bookingCloseTimer !== null) {
    clearTimeout(bookingCloseTimer);
    bookingCloseTimer = null;
  }

  if (!wasOpen) {
    const activeElement = document.activeElement;
    lastFocusedElement = activeElement instanceof HTMLElement
      && activeElement !== document.body
      && !modal.contains(activeElement)
      ? activeElement
      : null;
    bodyOverflowBeforeModal = document.body.style.overflow;
  }

  state.serviceKey = serviceKey;
  state.service = service;
  state.variationId = service.tiers.some((tier) => tier.id === variationId) ? variationId : service.tiers[0].id;
  state.slot = null;
  state.dateChosen = Boolean(preferredDate);

  el("booking-title").textContent = service.title;
  el("booking-subtitle").textContent = service.subtitle;
  updateMembershipFields();

  // Older cached pages may lack the service dropdown; degrade gracefully.
  const serviceWrap = el("service-wrap");
  const serviceSelect = el("service");
  const directlyBookable = DIRECT_BOOK_KEYS.includes(serviceKey);
  if (serviceWrap && serviceSelect) {
    serviceWrap.hidden = !directlyBookable;
    if (directlyBookable) serviceSelect.value = serviceKey;
  }

  const tierWrap = el("tier-wrap");
  const tier = el("tier");
  tier.innerHTML = "";

  service.tiers.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    tier.appendChild(option);
  });

  tierWrap.hidden = service.tiers.length <= 1;
  tier.value = state.variationId;
  populateDates(preferredDate || state.nextOpenDate);
  el("message").className = "message";
  el("message").textContent = "";
  el("submit").disabled = true;
  el("submit").textContent = bookingButtonLabel();

  loadSlots();

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (!wasOpen) {
    el("booking-close").focus({ preventScroll: true });
  }
}

function closeBooking() {
  if (state.submitting) return;
  if (!modal.classList.contains("is-open")) return;
  slotsRequest++;
  state.slot = null;
  checkReady();

  if (bookingCloseTimer !== null) {
    clearTimeout(bookingCloseTimer);
    bookingCloseTimer = null;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = bodyOverflowBeforeModal;

  if (/^#sc-(book(var)?-|membership-)/.test(location.hash)) {
    history.replaceState(null, "", location.pathname + location.search);
  }

  const focusTarget = lastFocusedElement;
  lastFocusedElement = null;
  if (focusTarget?.isConnected && !focusTarget.hasAttribute("disabled")) {
    focusTarget.focus({ preventScroll: true });
  }
}

function formatSlot(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: BUSINESS_TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

function checkReady() {
  const phoneDigits = el("phone").value.replace(/\D/g, "");
  const ready = state.slot && bookableDate(el("date").value)
    && businessDateKey(new Date(state.slot)) === el("date").value
    && el("name").value.trim() && phoneDigits.length >= 10
    && (state.serviceKey !== "membership" || el("notes").value.trim().length >= 5);
  el("submit").disabled = !ready || state.submitting;
}

function bookingButtonLabel() {
  return state.serviceKey === "membership" ? "Request Initial Clean" : "Request Booking";
}

function membershipSelection() {
  const plan = MEMBERSHIPS?.plans.find((p) => p.key === state.membershipPlan);
  if (!plan || !["1", "2"].includes(state.membershipVehicles)) return null;
  return { plan, count: Number(state.membershipVehicles), price: plan.prices[state.membershipVehicles] / 100 };
}

function updateMembershipFields() {
  const fields = el("membership-fields");
  if (!fields || !MEMBERSHIPS) return;
  const isMembership = state.serviceKey === "membership";
  fields.hidden = !isMembership;
  const bookingNote = modalPanel.querySelector(".booking-modal__note");
  if (bookingNote) bookingNote.textContent = isMembership
    ? "No payment today. We confirm your initial clean by text. Monthly billing is set up separately in Square after the initial clean."
    : "No payment today. We confirm by text, usually within the hour.";
  if (!isMembership) return;
  const { plan, count, price } = membershipSelection();
  el("membership-plan").value = plan.key;
  el("membership-vehicles").value = String(count);
  el("membership-vehicle-wrap").hidden = count !== 2;
  if (count === 1) state.membershipVehicle = "1";
  el("membership-vehicle").value = state.membershipVehicle;
  el("membership-schedule-wrap").hidden = plan.key !== "black-ops";
  el("membership-schedule").value = state.membershipSchedule;
  el("membership-benefits").textContent = plan.benefits.join(". ") + ".";
  el("membership-summary").textContent = `${plan.name}: $${price}/month for ${count} ${count === 1 ? "vehicle" : "vehicles"}. Separate initial clean: $199 per vehicle${count === 2 ? " ($398 total; book one appointment per vehicle)" : ""}. This appointment is $199 for vehicle ${state.membershipVehicle}.`;
}

function bookingNotes() {
  const notes = el("notes").value.trim();
  if (state.serviceKey !== "membership") return notes;
  const { plan, count, price } = membershipSelection();
  const schedule = state.membershipSchedule === "monthly-deep-clean" ? "One monthly deep clean" : "Undercover cleaning every two weeks";
  return [
    `MEMBERSHIP INITIAL CLEAN — ${plan.name}`,
    `Selected membership: ${count} vehicle(s), $${price}/month.`,
    `This appointment: vehicle ${state.membershipVehicle} of ${count}; $199 initial clean. Total initial cleans: $${199 * count}.`,
    ...(plan.key === "black-ops" ? [`Black Ops care choice: ${schedule}.`] : []),
    `Benefits: ${plan.benefits.join("; ")}.`,
    "Membership enrollment and recurring billing are pending; this appointment request does not activate a subscription.",
    notes,
  ].join("\n");
}

function initMembershipBooking() {
  if (!MEMBERSHIPS || el("membership-fields")) return;
  const fields = document.createElement("fieldset");
  fields.id = "membership-fields";
  fields.className = "booking-membership";
  fields.hidden = true;
  fields.innerHTML = `
    <legend>Membership selection</legend>
    <label for="membership-plan">Membership</label>
    <select id="membership-plan"></select>
    <label for="membership-vehicles">Vehicles in your membership</label>
    <select id="membership-vehicles"><option value="1">1 vehicle</option><option value="2">2 vehicles</option></select>
    <div id="membership-vehicle-wrap" hidden><label for="membership-vehicle">Vehicle for this initial-clean appointment</label>
      <select id="membership-vehicle"><option value="1">Vehicle 1</option><option value="2">Vehicle 2</option></select></div>
    <div id="membership-schedule-wrap" hidden><label for="membership-schedule">Black Ops care schedule</label>
      <select id="membership-schedule"><option value="every-two-weeks">Undercover cleaning every two weeks</option><option value="monthly-deep-clean">One monthly deep clean</option></select></div>
    <p id="membership-benefits" class="booking-membership__benefits"></p>
    <p id="membership-summary" class="booking-membership__summary" aria-live="polite"></p>`;
  modalPanel.insertBefore(fields, el("tier-wrap"));
  MEMBERSHIPS.plans.forEach(plan => {
    const option = document.createElement("option"); option.value = plan.key; option.textContent = plan.name;
    el("membership-plan").appendChild(option);
  });
  for (const [id, key] of [["membership-plan", "membershipPlan"], ["membership-vehicles", "membershipVehicles"], ["membership-vehicle", "membershipVehicle"], ["membership-schedule", "membershipSchedule"]]) {
    el(id).addEventListener("change", event => {
      state[key] = event.target.value;
      if (key === "membershipPlan" || key === "membershipVehicles") state.membershipBookedVehicles = [];
      updateMembershipFields();
    });
  }
  if (el("service")) {
    const option = document.createElement("option"); option.value = "membership";
    option.textContent = "Start a Membership — $199 initial clean per vehicle"; el("service").appendChild(option);
  }
}

async function loadSlots() {
  const request = ++slotsRequest;
  const date = el("date").value;
  const variationId = state.variationId;

  state.slot = null;
  checkReady();

  if (IS_FILE_PREVIEW) {
    el("slots").innerHTML = `<div class="empty"><a href="${liveBookingLink()}">Continue to live booking to see current openings</a>.</div>`;
    return;
  }
  if (!bookableDate(date)) {
    el("slots").innerHTML = `<div class="empty">Choose a future Monday, Wednesday, or Friday. Tuesday and Thursday are reserved for rush jobs: <a href="${SMS_LINK}">text us to request a slot</a>.</div>`;
    return;
  }

  el("slots").innerHTML = '<div class="empty">Loading...</div>';

  try {
    const response = await fetch(`${WORKER_URL}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        serviceVariationId: variationId,
        startAt: businessMidnight(date),
        endAt: new Date(Date.parse(businessMidnight(addCalendarDays(date, 1))) - 1).toISOString(),
      }),
    });
    const data = await response.json();

    if (request !== slotsRequest) return;
    if (!response.ok || data.error || !Array.isArray(data.slots)) throw new Error("Availability unavailable");
    const slots = data.slots.filter((iso) => Number.isFinite(Date.parse(iso))
      && businessDateKey(new Date(iso)) === date);

    if (!slots.length) {
      el("slots").innerHTML = `<div class="empty">No online openings for this service that day. Try another date, or <a href="${SMS_LINK}">text us about availability</a>.</div>`;
      return;
    }

    el("slots").innerHTML = "";
    slots.forEach((iso) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = formatSlot(iso);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        if (request !== slotsRequest) return;
        state.slot = iso;
        el("slots").querySelectorAll("button").forEach((slotButton) => {
          slotButton.classList.remove("selected");
          slotButton.setAttribute("aria-pressed", "false");
        });
        button.classList.add("selected");
        button.setAttribute("aria-pressed", "true");
        checkReady();
      });
      el("slots").appendChild(button);
    });
  } catch {
    if (request !== slotsRequest) return;
    el("slots").innerHTML = `<div class="empty">We couldn't load live times. Try another date, or <a href="${SMS_LINK}">text (717) 870-9439 for an opening</a>.</div>`;
  }
}

async function submitBooking() {
  const submit = el("submit");
  const message = el("message");
  if (submit.disabled || IS_FILE_PREVIEW) return;
  checkReady();
  if (submit.disabled) return;
  const notes = bookingNotes();
  if (notes.length > 2000) {
    message.className = "message error";
    message.textContent = "Please shorten your vehicle and address notes, then try again.";
    return;
  }

  const membership = state.serviceKey === "membership";
  state.submitting = true;
  el("membership-fields")?.setAttribute("disabled", "");
  submit.disabled = true;
  submit.textContent = "Requesting...";
  message.className = "message";
  message.textContent = "";

  try {
    const response = await fetch(`${WORKER_URL}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceVariationId: state.variationId,
        startAt: state.slot,
        customer: {
          name: el("name").value.trim(),
          email: el("email").value.trim(),
          phone: el("phone").value.trim(),
        },
        notes,
      }),
    });

    const data = await response.json();
    if (!response.ok || data.error || !data.bookingId) {
      message.className = "message error";
      message.textContent = data.error || "We couldn't confirm that request. Please try again.";
      submit.disabled = false;
      submit.textContent = bookingButtonLabel();
      return;
    }

    message.className = "message success";
    message.textContent = membership
      ? "Initial clean requested. We'll text to confirm your appointment and arrange monthly membership enrollment separately."
      : "You're on the list! We'll text you shortly to confirm your spot.";
    state.slot = null;
    submit.textContent = "Done";
    window.dispatchEvent(new CustomEvent("sneakyclean:booking-submitted"));
    if (membership) {
      state.membershipBookedVehicles.push(state.membershipVehicle);
      const otherVehicle = ["1", "2"].find(vehicle => !state.membershipBookedVehicles.includes(vehicle));
      if (state.membershipVehicles === "2" && otherVehicle) {
        const next = document.createElement("button");
        next.type = "button"; next.className = "membership-next-vehicle";
        next.textContent = `Book initial clean for vehicle ${otherVehicle}`;
        next.addEventListener("click", () => {
          state.membershipVehicle = otherVehicle;
          el("notes").value = "";
          openBooking("membership");
        });
        message.appendChild(next);
      }
      return;
    }
    bookingCloseTimer = setTimeout(() => {
      bookingCloseTimer = null;
      closeBooking();
    }, 3500);
  } catch {
    message.className = "message error";
    message.innerHTML = `Something went wrong. Please try again, or <a href="${SMS_LINK}">text us at (717) 870-9439</a>.`;
    submit.disabled = false;
    submit.textContent = bookingButtonLabel();
  } finally {
    state.submitting = false;
    el("membership-fields")?.removeAttribute("disabled");
    checkReady();
  }
}

function formatOpenDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: BUSINESS_TIME_ZONE, weekday: "long", month: "short", day: "numeric" });
}

async function initNextOpen() {
  const chip = document.getElementById("next-open");
  const fallback = () => {
    if (!chip) return;
    const link = document.createElement("a");
    link.href = IS_FILE_PREVIEW ? "https://www.sneakycleantn.com/#sc-book-reset" : SMS_LINK;
    link.textContent = IS_FILE_PREVIEW ? "See live openings & book online" : "Text us for the next opening";
    chip.replaceChildren(link);
    chip.hidden = false;
  };
  if (IS_FILE_PREVIEW) { fallback(); return; }
  try {
    const response = await fetch(`${WORKER_URL}/next-availability`, { signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok || !data.nextSlot || !Number.isFinite(Date.parse(data.nextSlot))) { fallback(); return; }
    const date = businessDateKey(new Date(data.nextSlot));
    if (!bookableDate(date)) { fallback(); return; }
    state.nextOpenDate = date;

    if (chip) {
      chip.querySelector("strong").textContent = formatOpenDate(data.nextSlot);
      chip.hidden = false;
    }
    if (modal.classList.contains("is-open") && !state.dateChosen && !state.slot && el("date").value !== date) {
      populateDates(date);
      loadSlots();
    }
  } catch {
    fallback();
  }
}

function openByVariation(variationId) {
  for (const [key, service] of Object.entries(SERVICES)) {
    const tier = service.tiers.find((item) => item.id === variationId);
    if (tier) {
      openBooking(key, variationId);
      return true;
    }
  }
  return false;
}

function checkHash() {
  const hash = location.hash || "";
  const membershipMatch = hash.match(/^#sc-membership-(undercover|special-agent|black-ops)(?:-([12]))?$/);
  if (membershipMatch && MEMBERSHIPS) {
    state.membershipPlan = membershipMatch[1];
    state.membershipVehicles = membershipMatch[2] || "1";
    state.membershipVehicle = "1";
    state.membershipBookedVehicles = [];
    openBooking("membership");
    return;
  }
  const bookMatch = hash.match(/^#sc-book-(.+)$/);
  if (bookMatch && SERVICES[bookMatch[1]]) {
    openBooking(bookMatch[1]);
    return;
  }

  const variationMatch = hash.match(/^#sc-bookvar-(.+)$/);
  if (variationMatch) openByVariation(variationMatch[1]);
}

modal.setAttribute("aria-hidden", "true");
initMembershipBooking();
modal.setAttribute("aria-describedby", "booking-subtitle");
modalPanel.setAttribute("tabindex", "-1");
el("message").setAttribute("aria-live", "polite");
el("message").setAttribute("aria-atomic", "true");
el("slots").setAttribute("aria-live", "polite");

el("booking-close").addEventListener("click", closeBooking);
modal.addEventListener("click", (event) => {
  if (event.target.id === "booking-modal") closeBooking();
});
document.addEventListener("keydown", handleModalKeydown);
el("tier").addEventListener("change", (event) => {
  state.variationId = event.target.value;
  state.slot = null;
  if (el("date").value) loadSlots();
});
el("service")?.addEventListener("change", (event) => {
  const key = event.target.value;
  if (!SERVICES[key] || key === state.serviceKey) return;
  const keepDate = el("date").value;
  openBooking(key, undefined, keepDate);
});
["name", "email", "phone", "notes"].forEach((id) => el(id).addEventListener("input", checkReady));
el("submit").addEventListener("click", submitBooking);
window.addEventListener("hashchange", checkHash);

window.SneakyCleanBook = openBooking;
window.SneakyCleanBookVariation = openByVariation;
checkHash();
initNextOpen();
