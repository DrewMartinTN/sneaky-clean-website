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
const SELF_BOOK_DAYS = [1, 3, 6]; // Mon, Wed, Sat
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const state = {
  serviceKey: null,
  service: null,
  variationId: null,
  slot: null,
  nextOpenDate: null,
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

function openBooking(serviceKey) {
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
  state.variationId = service.tiers[0].id;
  state.slot = null;

  el("booking-title").textContent = service.title;
  el("booking-subtitle").textContent = service.subtitle;

  const serviceWrap = el("service-wrap");
  const serviceSelect = el("service");
  const directlyBookable = DIRECT_BOOK_KEYS.includes(serviceKey);
  serviceWrap.hidden = !directlyBookable;
  if (directlyBookable) serviceSelect.value = serviceKey;

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

  const dateInput = el("date");
  const today = new Date();
  dateInput.min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  dateInput.value = "";
  el("slots").innerHTML = '<div class="empty">Choose a date to see times</div>';
  el("message").className = "message";
  el("message").textContent = "";
  el("submit").disabled = true;
  el("submit").textContent = "Request Booking";

  // Start on the next day with an opening so most customers never hunt.
  if (state.nextOpenDate && state.nextOpenDate >= dateInput.min) {
    dateInput.value = state.nextOpenDate;
    loadSlots();
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (!wasOpen) {
    el("booking-close").focus({ preventScroll: true });
  }
}

function closeBooking() {
  if (!modal.classList.contains("is-open")) return;

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
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function checkReady() {
  const phoneDigits = el("phone").value.replace(/\D/g, "");
  const ready = state.slot && el("name").value.trim() && phoneDigits.length >= 10;
  el("submit").disabled = !ready;
}

async function loadSlots() {
  const date = el("date").value;
  if (!date) return;

  state.slot = null;
  checkReady();

  const chosenDay = new Date(`${date}T12:00:00`).getDay();
  if (!SELF_BOOK_DAYS.includes(chosenDay)) {
    const rushSms = `sms:+16154810464?&body=${encodeURIComponent(`Hi Sneaky Clean! Any chance of a rush detail on ${date}?`)}`;
    el("slots").innerHTML = `<div class="empty">Online booking runs <strong>Mon, Wed & Sat</strong>. Need ${DAY_NAMES[chosenDay]}? <a href="${rushSms}">Text us about a rush slot</a> — we can usually make it happen.</div>`;
    return;
  }

  el("slots").innerHTML = '<div class="empty">Loading...</div>';

  try {
    const response = await fetch(`${WORKER_URL}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceVariationId: state.variationId,
        startAt: new Date(`${date}T00:00:00`).toISOString(),
        endAt: new Date(`${date}T23:59:59`).toISOString(),
      }),
    });
    const data = await response.json();

    if (data.error) {
      el("slots").innerHTML = '<div class="empty">Error loading times</div>';
      return;
    }

    if (!data.slots || !data.slots.length) {
      el("slots").innerHTML = `<div class="empty">That day is full. Try another date, or <a href="${SMS_LINK}">text us</a> and we'll fit you in.</div>`;
      return;
    }

    el("slots").innerHTML = "";
    data.slots.forEach((iso) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = formatSlot(iso);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
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
    el("slots").innerHTML = '<div class="empty">Error loading times</div>';
  }
}

async function submitBooking() {
  const submit = el("submit");
  const message = el("message");

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
  return new Date(iso).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

async function initNextOpen() {
  const chip = document.getElementById("next-open");
  try {
    const response = await fetch(`${WORKER_URL}/next-availability`);
    const data = await response.json();
    if (!data.nextSlot) return;

    const slotDate = new Date(data.nextSlot);
    state.nextOpenDate = [
      slotDate.getFullYear(),
      String(slotDate.getMonth() + 1).padStart(2, "0"),
      String(slotDate.getDate()).padStart(2, "0"),
    ].join("-");

    if (chip) {
      chip.querySelector("strong").textContent = formatOpenDate(data.nextSlot);
      chip.hidden = false;
    }
  } catch {
    /* chip stays hidden */
  }
}

function openByVariation(variationId) {
  for (const [key, service] of Object.entries(SERVICES)) {
    const tier = service.tiers.find((item) => item.id === variationId);
    if (tier) {
      openBooking(key);
      el("tier").value = variationId;
      state.variationId = variationId;
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
el("service").addEventListener("change", (event) => {
  const key = event.target.value;
  if (!SERVICES[key] || key === state.serviceKey) return;
  const keepDate = el("date").value;
  openBooking(key);
  if (keepDate) {
    el("date").value = keepDate;
    loadSlots();
  }
});
el("date").addEventListener("change", loadSlots);
["name", "email", "phone"].forEach((id) => el(id).addEventListener("input", checkReady));
el("submit").addEventListener("click", submitBooking);
window.addEventListener("hashchange", checkHash);

window.SneakyCleanBook = openBooking;
window.SneakyCleanBookVariation = openByVariation;
checkHash();
initNextOpen();
