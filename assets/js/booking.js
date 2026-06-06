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
    title: "Reset Detail",
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

const state = {
  service: null,
  variationId: null,
  slot: null,
};

function openBooking(serviceKey) {
  const service = SERVICES[serviceKey];
  if (!service) return;

  state.service = service;
  state.variationId = service.tiers[0].id;
  state.slot = null;

  el("booking-title").textContent = service.title;
  el("booking-subtitle").textContent = service.subtitle;

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
  el("date").value = "";
  el("slots").innerHTML = '<div class="empty">Choose a date to see times</div>';
  el("message").className = "message";
  el("message").textContent = "";
  el("submit").disabled = true;
  el("submit").textContent = "Request Booking";

  el("booking-modal").classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeBooking() {
  el("booking-modal").classList.remove("is-open");
  document.body.style.overflow = "";

  if (/^#sc-book(var)?-/.test(location.hash)) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function formatSlot(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function checkReady() {
  const ready = state.slot && el("name").value.trim() && el("email").value.trim();
  el("submit").disabled = !ready;
}

async function loadSlots() {
  const date = el("date").value;
  if (!date) return;

  state.slot = null;
  checkReady();
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
      el("slots").innerHTML = '<div class="empty">No times available - try another date</div>';
      return;
    }

    el("slots").innerHTML = "";
    data.slots.forEach((iso) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = formatSlot(iso);
      button.addEventListener("click", () => {
        state.slot = iso;
        el("slots").querySelectorAll("button").forEach((slotButton) => {
          slotButton.classList.remove("selected");
        });
        button.classList.add("selected");
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
    message.textContent = "Booking requested! You'll receive an email confirmation once it's accepted.";
    submit.textContent = "Done";
    window.dispatchEvent(new CustomEvent("sneakyclean:booking-submitted"));
    setTimeout(closeBooking, 3500);
  } catch {
    message.className = "message error";
    message.textContent = "Something went wrong. Please try again or text us.";
    submit.disabled = false;
    submit.textContent = "Request Booking";
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

el("booking-close").addEventListener("click", closeBooking);
el("booking-modal").addEventListener("click", (event) => {
  if (event.target.id === "booking-modal") closeBooking();
});
el("tier").addEventListener("change", (event) => {
  state.variationId = event.target.value;
  state.slot = null;
  if (el("date").value) loadSlots();
});
el("date").addEventListener("change", loadSlots);
["name", "email"].forEach((id) => el(id).addEventListener("input", checkReady));
el("submit").addEventListener("click", submitBooking);
window.addEventListener("hashchange", checkHash);

window.SneakyCleanBook = openBooking;
window.SneakyCleanBookVariation = openByVariation;
checkHash();
