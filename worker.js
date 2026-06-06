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
      "Square-Version": "2025-01-23",
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

  const created = await square(env, "/customers", "POST", {
    idempotency_key: crypto.randomUUID(),
    given_name,
    family_name,
    email_address: email,
    phone_number: phone || undefined,
  });
  return created.customer.id;
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
      allowedOrigin: env.ALLOWED_ORIGIN || "(unset)",
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
      return json({ error: "Not found" }, 404, origin);
    } catch (err) {
      return json({ error: err.message || "Server error" }, err.status || 500, origin);
    }
  },
};
