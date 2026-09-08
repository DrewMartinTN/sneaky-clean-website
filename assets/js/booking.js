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

const SMS_LINK = 'sms:+16154810464?&body=Hi%20Sneaky%20Clean!%20I%20couldn%27t%20find%20a%20time%20online%20%E2%80%94%20can%20you%20fit%20me%20in%3F';
const DIRECT_BOOK_KEYS = ["refresh", "reset"];
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
  const service = SERVICES[serviceKey];
  if (!service) return;

  const wasOpen = modal.classList.contains("is-open");
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
  el("submit").textContent = "Request Booking";

  loadSlots();

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (!wasOpen) {
    el("booking-close").focus({ preventScroll: true });
  }
}

function closeBooking() {
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

  if (/^#sc-book(var)?-/.test(location.hash)) {
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
    && el("name").value.trim() && phoneDigits.length >= 10;
  el("submit").disabled = !ready;
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
    el("slots").innerHTML = `<div class="empty">We couldn't load live times. Try another date, or <a href="${SMS_LINK}">text 615-481-0464 for an opening</a>.</div>`;
  }
}

async function submitBooking() {
  const submit = el("submit");
  const message = el("message");
  if (submit.disabled || IS_FILE_PREVIEW) return;
  checkReady();
  if (submit.disabled) return;

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
        notes: el("notes").value.trim(),
      }),
    });

    const data = await response.json();
    if (data.error) {
      message.className = "message error";
      message.textContent = data.error;
      submit.disabled = false;
      submit.textContent = "Request Booking";
      return;
    }

    message.className = "message success";
    message.textContent = "You're on the list! We'll text you shortly to confirm your spot.";
    submit.textContent = "Done";
    window.dispatchEvent(new CustomEvent("sneakyclean:booking-submitted"));
    bookingCloseTimer = setTimeout(() => {
      bookingCloseTimer = null;
      closeBooking();
    }, 3500);
  } catch {
    message.className = "message error";
    message.innerHTML = `Something went wrong. Please try again, or <a href="${SMS_LINK}">text us at 615-481-0464</a>.`;
    submit.disabled = false;
    submit.textContent = "Request Booking";
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
  const bookMatch = hash.match(/^#sc-book-(.+)$/);
  if (bookMatch && SERVICES[bookMatch[1]]) {
    openBooking(bookMatch[1]);
    return;
  }

  const variationMatch = hash.match(/^#sc-bookvar-(.+)$/);
  if (variationMatch) openByVariation(variationMatch[1]);
}

modal.setAttribute("aria-hidden", "true");
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
["name", "email", "phone"].forEach((id) => el(id).addEventListener("input", checkReady));
el("submit").addEventListener("click", submitBooking);
window.addEventListener("hashchange", checkHash);

window.SneakyCleanBook = openBooking;
window.SneakyCleanBookVariation = openByVariation;
checkHash();
initNextOpen();
