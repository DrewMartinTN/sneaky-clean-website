// Sneaky Clean booking worker
// Deploy: Cloudflare Workers (free tier)
// Env vars (set in Cloudflare dashboard, NOT in code):
//   SQUARE_ACCESS_TOKEN   - production access token from Square Developer Dashboard (Bearer)
//   SQUARE_LOCATION_ID    - LHZDJKB0H96NH
//   SQUARE_TEAM_MEMBER_ID - TMf-ND8UsRVBrYRS
//   ALLOWED_ORIGINS       - comma-separated allowed origins, no trailing slashes

const SQUARE_BASE = "https://connect.squareup.com/v2";
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOTES = 2000;
const MAX_NAME = 200;
const MAX_FIELD = 1000;

// Schedule shape: at most this many real details per day, with drive/setup
// buffer between jobs. Bookings shorter than DETAIL_MIN_MINUTES (free
// consultations, photo reviews) don't count against the cap or buffer.
const MAX_DETAILS_PER_DAY = 3;
const BUFFER_MINUTES = 60;
const DETAIL_MIN_MINUTES = 60;
const BOOKABLE_STATUSES = new Set(["PENDING", "ACCEPTED"]);
const BUSINESS_TIME_ZONE = "America/Chicago";
// Shortest mainline detail; used to find the next bookable opening.
const NEXT_OPEN_VARIATION_ID = "BYS5Z5ZZU3IQ3SPMKWPSWOF4";
const NEXT_OPEN_CACHE_SECONDS = 600;
const POPUP_SERVICE = "$60 Express Wash + Vacuum";
const POPUP_AVAILABILITY = new Set([
  "Weekday morning",
  "Weekday afternoon",
  "Weekday evening",
  "Saturday morning",
  "Saturday afternoon",
]);
const POPUP_UPGRADES = new Set([
  "Glass ceramic",
  "Ceramic wax",
  "Interior spray and wipe",
  "None",
]);

function allowedOrigin(req, env) {
  const requestOrigin = req.headers.get("Origin") || "";
  const configured = env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "https://sneakycleantn.com";
  const allowed = configured.split(",").map((item) => item.trim()).filter(Boolean);

  if (allowed.includes("*")) return "*";
  if (allowed.includes(requestOrigin)) return requestOrigin;
  return allowed[0] || "https://sneakycleantn.com";
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

async function square(env, path, method, body) {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": "2026-05-20",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.errors?.[0];
    const err = new Error(e?.detail || `Square API error ${res.status}`);
    err.status = res.status;
    err.code = e?.code;
    err.category = e?.category;
    throw err;
  }
  return data;
}

function badInput(msg, origin) {
  return json({ error: msg }, 400, origin);
}

function businessDay(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

async function fetchBookingsInRange(env, startAt, endAt) {
  const bookings = [];
  let cursor;
  do {
    const params = new URLSearchParams({
      location_id: env.SQUARE_LOCATION_ID,
      start_at_min: startAt,
      start_at_max: endAt,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);
    const data = await square(env, `/bookings?${params}`, "GET");
    bookings.push(...(data.bookings || []));
    cursor = data.cursor;
  } while (cursor);
  return bookings.filter((b) => BOOKABLE_STATUSES.has(b.status));
}

function segmentsMinutes(segments) {
  return (segments || []).reduce((sum, seg) => sum + (seg.duration_minutes || 0), 0);
}

// Existing details as time windows, keyed for cap/buffer checks.
function detailWindows(bookings) {
  return bookings
    .map((b) => ({
      start: new Date(b.start_at).getTime(),
      minutes: segmentsMinutes(b.appointment_segments),
      day: businessDay(b.start_at),
    }))
    .filter((w) => w.minutes >= DETAIL_MIN_MINUTES)
    .map((w) => ({ day: w.day, start: w.start, end: w.start + w.minutes * 60000 }));
}

function slotAllowed(startISO, durationMinutes, windows) {
  const day = businessDay(startISO);
  const sameDay = windows.filter((w) => w.day === day);
  if (sameDay.length >= MAX_DETAILS_PER_DAY) return false;

  const buffer = BUFFER_MINUTES * 60000;
  const start = new Date(startISO).getTime();
  const end = start + durationMinutes * 60000;
  return windows.every((w) => end + buffer <= w.start || start >= w.end + buffer);
}

async function searchAvailability(env, serviceVariationId, startAt, endAt) {
  const data = await square(env, "/bookings/availability/search", "POST", {
    query: {
      filter: {
        start_at_range: { start_at: startAt, end_at: endAt },
        location_id: env.SQUARE_LOCATION_ID,
        segment_filters: [
          {
            service_variation_id: serviceVariationId,
            team_member_id_filter: { any: [env.SQUARE_TEAM_MEMBER_ID] },
          },
        ],
      },
    },
  });
  return data.availabilities || [];
}

async function handleAvailability(req, env, origin) {
  let body;
  try { body = await req.json(); } catch { return badInput("Invalid JSON body", origin); }
  const { serviceVariationId, startAt, endAt } = body || {};
  if (!serviceVariationId || typeof serviceVariationId !== "string")
    return badInput("Missing or invalid serviceVariationId", origin);
  if (!startAt || !ISO_RE.test(startAt))
    return badInput("Missing or invalid startAt (must be RFC 3339)", origin);
  if (!endAt || !ISO_RE.test(endAt))
    return badInput("Missing or invalid endAt (must be RFC 3339)", origin);
  if (new Date(endAt) <= new Date(startAt))
    return badInput("endAt must be after startAt", origin);

  const [availabilities, bookings] = await Promise.all([
    searchAvailability(env, serviceVariationId, startAt, endAt),
    fetchBookingsInRange(env, startAt, endAt),
  ]);
  const windows = detailWindows(bookings);

  const slots = availabilities
    .filter((a) => slotAllowed(a.start_at, segmentsMinutes(a.appointment_segments) || 120, windows))
    .map((a) => a.start_at);
  return json({ slots }, 200, origin);
}

async function handleNextAvailability(env, origin) {
  const cacheKey = new Request("https://sneaky-clean-booking.cache/next-availability");
  const cache = caches.default;

  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = await cached.text();
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json", ...cors(origin) },
      });
    }
  } catch {}

  const searchStart = new Date(Date.now() + 60 * 60000);
  const searchEnd = new Date(Date.now() + 14 * 86400000);
  const [availabilities, bookings] = await Promise.all([
    searchAvailability(env, NEXT_OPEN_VARIATION_ID, searchStart.toISOString(), searchEnd.toISOString()),
    fetchBookingsInRange(env, searchStart.toISOString(), searchEnd.toISOString()),
  ]);
  const windows = detailWindows(bookings);

  const next = availabilities.find((a) =>
    slotAllowed(a.start_at, segmentsMinutes(a.appointment_segments) || 120, windows));

  const payload = JSON.stringify({ nextSlot: next ? next.start_at : null });
  try {
    await cache.put(cacheKey, new Response(payload, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${NEXT_OPEN_CACHE_SECONDS}`,
      },
    }));
  } catch {}

  return new Response(payload, {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

async function getVariationInfo(env, variationId) {
  const data = await square(env, "/catalog/object/" + encodeURIComponent(variationId), "GET");
  const object = data.object;
  if (!object?.version) return null;
  const durationMs = object.item_variation_data?.service_duration || 0;
  return {
    version: object.version,
    durationMinutes: Math.round(durationMs / 60000) || 120,
  };
}

async function findOrCreateCustomer(env, { name, email, phone }) {
  const trimmed = (name || "").trim();
  const [given_name, ...rest] = trimmed.split(/\s+/);
  const family_name = rest.join(" ") || undefined;

  if (email) {
    const search = await square(env, "/customers/search", "POST", {
      query: { filter: { email_address: { exact: email } } },
      limit: 1,
    });
    const existing = search.customers?.[0];
    if (existing) return existing.id;
  }

  if (phone) {
    const search = await square(env, "/customers/search", "POST", {
      query: { filter: { phone_number: { exact: phone } } },
      limit: 1,
    });
    const existing = search.customers?.[0];
    if (existing) return existing.id;
  }

  const created = await square(env, "/customers", "POST", {
    idempotency_key: crypto.randomUUID(),
    given_name,
    family_name,
    email_address: email,
    phone_number: phone || undefined,
  });
  return created.customer.id;
}

function cleanText(value, max = MAX_FIELD) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

function communityKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function validNameEmailPhone(body, origin) {
  const name = cleanText(body.name, MAX_NAME);
  const email = cleanText(body.email, 320).toLowerCase();
  const phone = normalizePhone(body.phone);
  if (name.length < 2) return { error: badInput("Please provide your full name", origin) };
  if (!EMAIL_RE.test(email)) return { error: badInput("Please provide a valid email address", origin) };
  if (!phone) return { error: badInput("Please provide a valid 10-digit mobile phone number", origin) };
  return { name, email, phone };
}

async function addCustomerToGroup(env, customerId, groupId) {
  if (!groupId) throw new Error("Pop-up customer group is not configured");
  await square(
    env,
    `/customers/${encodeURIComponent(customerId)}/groups/${encodeURIComponent(groupId)}`,
    "PUT",
  );
}

async function upsertCustomerAttributes(env, customerId, attributes) {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === "" || value === null || value === undefined) continue;
    await square(
      env,
      `/customers/${encodeURIComponent(customerId)}/custom-attributes/${encodeURIComponent(key)}`,
      "POST",
      {
        idempotency_key: crypto.randomUUID(),
        custom_attribute: { value: typeof value === "string" ? value.slice(0, MAX_FIELD) : value },
      },
    );
  }
}

function parseUpgrades(value) {
  const upgrades = Array.isArray(value) ? value.map((item) => cleanText(item, 100)) : [];
  if (!upgrades.length || upgrades.some((item) => !POPUP_UPGRADES.has(item))) return null;
  if (upgrades.includes("None")) return ["None"];
  return [...new Set(upgrades)];
}

async function handlePopupResident(req, env, origin) {
  let body;
  try { body = await req.json(); } catch { return badInput("Invalid JSON body", origin); }
  if (body.companyWebsite) return json({ ok: true }, 200, origin);

  const contact = validNameEmailPhone(body, origin);
  if (contact.error) return contact.error;

  const community = cleanText(body.community, 200);
  const unitNumber = cleanText(body.unitNumber, 100);
  const vehicleYear = cleanText(body.vehicleYear, 4);
  const vehicleMake = cleanText(body.vehicleMake, 100);
  const vehicleModel = cleanText(body.vehicleModel, 100);
  const vehicleColor = cleanText(body.vehicleColor, 100);
  const availability = cleanText(body.availability, 100);
  const upgrades = parseUpgrades(body.upgrades);

  if (!community) return badInput("Please provide your apartment community", origin);
  if (!unitNumber) return badInput("Please provide your building or unit number", origin);
  if (!/^\d{4}$/.test(vehicleYear)) return badInput("Please provide a four-digit vehicle year", origin);
  if (!vehicleMake || !vehicleModel || !vehicleColor) return badInput("Please complete the vehicle information", origin);
  if (!POPUP_AVAILABILITY.has(availability)) return badInput("Please choose a preferred availability window", origin);
  if (body.service !== POPUP_SERVICE) return badInput("Please select the Express Wash + Vacuum", origin);
  if (!upgrades) return badInput("Please choose an upgrade preference", origin);
  if (body.smsConsent !== true) return badInput("SMS consent is required for event coordination", origin);

  const customerId = await findOrCreateCustomer(env, contact);
  await addCustomerToGroup(env, customerId, env.SQUARE_POPUP_INTEREST_GROUP_ID);
  await upsertCustomerAttributes(env, customerId, {
    "apartment-community": community,
    "unit-number": unitNumber,
    "vehicle-year": vehicleYear,
    "vehicle-make": vehicleMake,
    "vehicle-model": vehicleModel,
    "vehicle-color": vehicleColor,
    "popup-upgrade-interest": upgrades.join(" | "),
    "popup-preferred-availability": availability,
    "popup-vehicle-notes": cleanText(body.conditionNotes, MAX_FIELD),
    "popup-sms-consent": true,
    "popup-role": "Resident",
    "popup-status": "Interest received",
    "popup-requested-at": new Date().toISOString(),
    "popup-community-key": communityKey(community),
    "popup-service-selection": POPUP_SERVICE,
  });

  return json({ ok: true, community }, 200, origin);
}

async function handlePopupManager(req, env, origin) {
  let body;
  try { body = await req.json(); } catch { return badInput("Invalid JSON body", origin); }
  if (body.companyWebsite) return json({ ok: true }, 200, origin);

  const contact = validNameEmailPhone(body, origin);
  if (contact.error) return contact.error;

  const community = cleanText(body.community, 200);
  const propertyAddress = cleanText(body.propertyAddress, 300);
  const estimatedVehicles = Number(body.estimatedVehicles);
  const preferredDates = cleanText(body.preferredDates, 500);
  const preferredWindow = cleanText(body.preferredWindow, 200);
  const setupArea = cleanText(body.setupArea, 500);

  if (!community || !propertyAddress) return badInput("Please complete the community name and property address", origin);
  if (!Number.isInteger(estimatedVehicles) || estimatedVehicles < 1 || estimatedVehicles > 200)
    return badInput("Please provide a reasonable estimated vehicle count", origin);
  if (!preferredDates || !preferredWindow || !setupArea)
    return badInput("Please complete the preferred dates, time window, and setup area", origin);
  if (body.sitePermission !== true)
    return badInput("Please confirm permission for mobile vehicle cleaning on-site", origin);

  const customerId = await findOrCreateCustomer(env, contact);
  await addCustomerToGroup(env, customerId, env.SQUARE_POPUP_MANAGER_GROUP_ID);
  await upsertCustomerAttributes(env, customerId, {
    "apartment-community": community,
    "popup-role": "Property Manager",
    "popup-status": "Manager inquiry received",
    "popup-requested-at": new Date().toISOString(),
    "popup-community-key": communityKey(community),
    "property-address": propertyAddress,
    "popup-estimated-vehicles": String(estimatedVehicles),
    "popup-preferred-dates": preferredDates,
    "popup-time-window": preferredWindow,
    "popup-setup-area": setupArea,
    "popup-property-notes": cleanText(body.propertyNotes, MAX_FIELD),
    "popup-site-permission": true,
  });

  return json({ ok: true, community }, 200, origin);
}

function friendlyBookingError(err) {
  const detail = err.message || "";
  if (/Merchant subscription does not support/i.test(detail))
    return "This booking system needs a Square Appointments Plus subscription to accept bookings online. We'll be back online soon — please text or call to book in the meantime.";
  if (err.status === 409 || /conflict|already booked|unavailable/i.test(detail))
    return "That time slot was just taken. Please pick another time.";
  if (err.status === 401 || err.status === 403)
    return "Booking system isn't currently authorized. Please text or call to book.";
  if (/customer/i.test(detail) && /email/i.test(detail))
    return "There was a problem with the email address. Please double-check and try again.";
  return detail || "Could not complete booking. Please try again or contact us.";
}

async function handleBook(req, env, origin) {
  let body;
  try { body = await req.json(); } catch { return badInput("Invalid JSON body", origin); }
  const { serviceVariationId, startAt, customer, notes } = body || {};
  const c = customer || {};

  if (!serviceVariationId || typeof serviceVariationId !== "string")
    return badInput("Missing serviceVariationId", origin);
  if (!startAt || !ISO_RE.test(startAt))
    return badInput("Missing or invalid startAt", origin);
  if (new Date(startAt) < new Date())
    return badInput("startAt must be in the future", origin);
  if (!c.name || typeof c.name !== "string" || c.name.trim().length < 2)
    return badInput("Please provide your full name", origin);
  if (c.name.length > MAX_NAME)
    return badInput("Name is too long", origin);
  const phone = normalizePhone(c.phone);
  if (!phone)
    return badInput("Please provide a valid 10-digit mobile number so we can confirm by text", origin);
  const email = cleanText(c.email, 320).toLowerCase();
  if (email && !EMAIL_RE.test(email))
    return badInput("That email address doesn't look right — fix it or leave it blank", origin);
  if (notes && typeof notes === "string" && notes.length > MAX_NOTES)
    return badInput(`Notes must be under ${MAX_NOTES} characters`, origin);

  try {
    const variation = await getVariationInfo(env, serviceVariationId);
    if (!variation) return json({ error: "Service not found" }, 404, origin);

    // Re-check the day cap and drive buffer at booking time: the slot list in
    // the customer's browser may be minutes old.
    const slotTime = new Date(startAt).getTime();
    const rangeStart = new Date(slotTime - 16 * 3600000).toISOString();
    const rangeEnd = new Date(slotTime + 16 * 3600000).toISOString();
    const windows = detailWindows(await fetchBookingsInRange(env, rangeStart, rangeEnd));
    if (!slotAllowed(startAt, variation.durationMinutes, windows)) {
      return json(
        { error: "That time was just taken and no longer fits the day's schedule. Please pick another time." },
        409,
        origin,
      );
    }

    const customerId = await findOrCreateCustomer(env, {
      name: c.name,
      email: email || undefined,
      phone,
    });

    const booking = await square(env, "/bookings", "POST", {
      idempotency_key: crypto.randomUUID(),
      booking: {
        location_id: env.SQUARE_LOCATION_ID,
        start_at: startAt,
        customer_id: customerId,
        customer_note: (notes || "").slice(0, MAX_NOTES),
        appointment_segments: [
          {
            team_member_id: env.SQUARE_TEAM_MEMBER_ID,
            service_variation_id: serviceVariationId,
            service_variation_version: variation.version,
          },
        ],
      },
    });

    return json(
      { bookingId: booking.booking.id, status: booking.booking.status },
      200,
      origin,
    );
  } catch (err) {
    return json({ error: friendlyBookingError(err) }, err.status || 500, origin);
  }
}

async function handleHealth(env, origin) {
  const ok = {
    ok: true,
    time: new Date().toISOString(),
    config: {
      locationConfigured: !!env.SQUARE_LOCATION_ID,
      teamMemberConfigured: !!env.SQUARE_TEAM_MEMBER_ID,
      tokenConfigured: !!env.SQUARE_ACCESS_TOKEN,
      allowedOrigins: env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "(unset)",
    },
  };
  return json(ok, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return await handleHealth(env, origin);
      }
      if (request.method === "GET" && url.pathname === "/next-availability") {
        return await handleNextAvailability(env, origin);
      }
      if (url.pathname === "/availability") {
        if (request.method !== "POST")
          return json({ error: "Method not allowed" }, 405, origin);
        return await handleAvailability(request, env, origin);
      }
      if (url.pathname === "/book") {
        if (request.method !== "POST")
          return json({ error: "Method not allowed" }, 405, origin);
        return await handleBook(request, env, origin);
      }
      if (url.pathname === "/popup/resident") {
        if (request.method !== "POST")
          return json({ error: "Method not allowed" }, 405, origin);
        return await handlePopupResident(request, env, origin);
      }
      if (url.pathname === "/popup/manager") {
        if (request.method !== "POST")
          return json({ error: "Method not allowed" }, 405, origin);
        return await handlePopupManager(request, env, origin);
      }
      return json({ error: "Not found" }, 404, origin);
    } catch (err) {
      return json({ error: err.message || "Server error" }, err.status || 500, origin);
    }
  },
};
