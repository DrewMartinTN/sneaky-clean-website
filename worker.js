// Sneaky Clean booking worker
// Deploy: Cloudflare Workers (free tier)
// Env vars (set in Cloudflare dashboard, NOT in code):
//   SQUARE_ACCESS_TOKEN   - production access token from Square Developer Dashboard (Bearer)
//   SQUARE_LOCATION_ID    - LHZDJKB0H96NH
//   SQUARE_TEAM_MEMBER_ID - TMf-ND8UsRVBrYRS
//   ALLOWED_ORIGINS       - comma-separated allowed origins, no trailing slashes
//   MAILGUN_API_KEY       - optional Mailgun sending key
//   POPUP_NOTIFICATION_EMAIL - optional recipient for pop-up lead alerts
//   TWILIO_*              - optional SMS alert credentials and sender

const SQUARE_BASE = "https://connect.squareup.com/v2";
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOTES = 2000;
const MAX_NAME = 200;
const MAX_FIELD = 1000;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function notificationRows(rows) {
  return rows
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .map(([label, value]) => `<tr><th align="left" style="padding:6px 12px 6px 0;color:#42504d;vertical-align:top">${escapeHtml(label)}</th><td style="padding:6px 0;color:#001210">${escapeHtml(value)}</td></tr>`)
    .join("");
}

function buildPopupNotification(kind, data) {
  const resident = kind === "resident";
  const title = resident ? "New resident pop-up request" : "New property-manager pop-up inquiry";
  const rows = resident
    ? [
        ["Resident", data.name],
        ["Phone", data.phone],
        ["Email", data.email],
        ["Community", data.community],
        ["Unit", data.unitNumber],
        ["Vehicle", `${data.vehicleYear} ${data.vehicleMake} ${data.vehicleModel} (${data.vehicleColor})`],
        ["Availability", data.availability],
        ["Upgrades", data.upgrades.join(", ")],
        ["Condition notes", data.conditionNotes],
      ]
    : [
        ["Manager", data.name],
        ["Phone", data.phone],
        ["Email", data.email],
        ["Community", data.community],
        ["Property address", data.propertyAddress],
        ["Estimated vehicles", data.estimatedVehicles],
        ["Preferred dates", data.preferredDates],
        ["Preferred window", data.preferredWindow],
        ["Setup area", data.setupArea],
        ["Property notes", data.propertyNotes],
      ];
  rows.push(["Square customer ID", data.customerId]);

  const textRows = rows
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
  const smsDetail = resident
    ? `${data.name} at ${data.community}. ${data.vehicleYear} ${data.vehicleMake} ${data.vehicleModel}. ${data.availability}. ${data.phone}`
    : `${data.name} at ${data.community}. About ${data.estimatedVehicles} vehicles. ${data.preferredDates}, ${data.preferredWindow}. ${data.phone}`;

  return {
    subject: `${title}: ${data.community}`,
    text: `${title}\n\n${textRows}\n\nReview in Square: https://squareup.com/dashboard/customers/directory`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f7f6;font-family:Arial,sans-serif;color:#001210"><div style="max-width:640px;margin:0 auto;padding:28px 18px"><div style="background:#001210;padding:22px;color:#f4ffdb"><div style="color:#18e1b4;font-size:12px;font-weight:700;text-transform:uppercase">Sneaky Clean Pop-Up Alert</div><h1 style="margin:8px 0 0;font-size:26px">${escapeHtml(title)}</h1></div><div style="background:#fff;padding:22px;border:1px solid #dce4e2"><table style="width:100%;border-collapse:collapse">${notificationRows(rows)}</table><p style="margin:22px 0 0"><a href="https://squareup.com/dashboard/customers/directory" style="display:inline-block;padding:12px 16px;background:#db0758;color:#fff;text-decoration:none;font-weight:700">Review in Square</a></p></div></div></body></html>`,
    sms: `Sneaky Clean pop-up lead: ${smsDetail}`.slice(0, 480),
  };
}

async function sendMailgunNotification(env, notification) {
  if (!env.MAILGUN_API_KEY || !env.POPUP_NOTIFICATION_EMAIL) return false;

  const domain = env.MAILGUN_DOMAIN || "sneakycleantn.com";
  const apiBase = (env.MAILGUN_API_BASE || "https://api.mailgun.net").replace(/\/$/, "");
  const body = new FormData();
  body.set("from", `Sneaky Clean Alerts <${env.MAILGUN_FROM_EMAIL || `notifications@${domain}`}>`);
  body.set("to", env.POPUP_NOTIFICATION_EMAIL);
  body.set("subject", notification.subject);
  body.set("text", notification.text);
  body.set("html", notification.html);

  const response = await fetch(`${apiBase}/v3/${encodeURIComponent(domain)}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}` },
    body,
  });
  if (!response.ok) throw new Error(`Mailgun notification failed (${response.status})`);
  return true;
}

async function sendTwilioNotification(env, notification) {
  const configured = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER && env.POPUP_NOTIFICATION_PHONE;
  if (!configured) return false;

  const body = new URLSearchParams({
    To: env.POPUP_NOTIFICATION_PHONE,
    From: env.TWILIO_FROM_NUMBER,
    Body: notification.sms,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!response.ok) throw new Error(`Twilio notification failed (${response.status})`);
  return true;
}

async function sendPopupNotifications(env, notification) {
  const results = await Promise.allSettled([
    sendMailgunNotification(env, notification),
    sendTwilioNotification(env, notification),
  ]);
  for (const result of results) {
    if (result.status === "rejected") console.error(result.reason?.message || result.reason);
  }
}

function queuePopupNotifications(ctx, env, kind, data) {
  const notification = buildPopupNotification(kind, data);
  const task = sendPopupNotifications(env, notification);
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else task.catch((error) => console.error(error?.message || error));
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

  const slots = (data.availabilities || []).map((a) => a.start_at);
  return json({ slots }, 200, origin);
}

async function getVariationVersion(env, variationId) {
  const data = await square(env, "/catalog/object/" + encodeURIComponent(variationId), "GET");
  return data.object?.version;
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

async function handlePopupResident(req, env, origin, ctx) {
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

  queuePopupNotifications(ctx, env, "resident", {
    ...contact,
    community,
    unitNumber,
    vehicleYear,
    vehicleMake,
    vehicleModel,
    vehicleColor,
    availability,
    upgrades,
    conditionNotes: cleanText(body.conditionNotes, MAX_FIELD),
    customerId,
  });

  return json({ ok: true, community }, 200, origin);
}

async function handlePopupManager(req, env, origin, ctx) {
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

  queuePopupNotifications(ctx, env, "manager", {
    ...contact,
    community,
    propertyAddress,
    estimatedVehicles,
    preferredDates,
    preferredWindow,
    setupArea,
    propertyNotes: cleanText(body.propertyNotes, MAX_FIELD),
    customerId,
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
  if (!c.email || !EMAIL_RE.test(c.email))
    return badInput("Please provide a valid email address", origin);
  if (notes && typeof notes === "string" && notes.length > MAX_NOTES)
    return badInput(`Notes must be under ${MAX_NOTES} characters`, origin);

  try {
    const version = await getVariationVersion(env, serviceVariationId);
    if (!version) return json({ error: "Service not found" }, 404, origin);

    const customerId = await findOrCreateCustomer(env, c);

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
            service_variation_version: version,
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
      emailNotificationsConfigured: !!(env.MAILGUN_API_KEY && env.POPUP_NOTIFICATION_EMAIL),
      smsNotificationsConfigured: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER && env.POPUP_NOTIFICATION_PHONE),
      allowedOrigins: env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "(unset)",
    },
  };
  return json(ok, 200, origin);
}

export default {
  async fetch(request, env, ctx) {
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return await handleHealth(env, origin);
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
        return await handlePopupResident(request, env, origin, ctx);
      }
      if (url.pathname === "/popup/manager") {
        if (request.method !== "POST")
          return json({ error: "Method not allowed" }, 405, origin);
        return await handlePopupManager(request, env, origin, ctx);
      }
      return json({ error: "Not found" }, 404, origin);
    } catch (err) {
      return json({ error: err.message || "Server error" }, err.status || 500, origin);
    }
  },
};
