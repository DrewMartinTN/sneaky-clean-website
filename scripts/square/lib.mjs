import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "../..");
export const REPORT_DIR = path.join(ROOT, "growth", "reports");
export const EXPORT_DIR = path.join(ROOT, "growth", "exports");
export const SQUARE_BASE = "https://connect.squareup.com/v2";
export const SQUARE_VERSION = process.env.SQUARE_VERSION || "2026-05-20";

const DEFAULT_LOCATION_ID = "LHZDJKB0H96NH";

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function getSquareToken() {
  if (process.env.SQUARE_ACCESS_TOKEN) return process.env.SQUARE_ACCESS_TOKEN.trim();

  const tokenPath = path.join(ROOT, ".sq-token");
  if (fs.existsSync(tokenPath)) {
    const token = fs.readFileSync(tokenPath, "utf8").trim();
    if (token) return token;
  }

  throw new Error("Missing Square token. Set SQUARE_ACCESS_TOKEN or run ./save-sq-token.sh.");
}

export function getLocationIds() {
  const explicit = process.env.SQUARE_LOCATION_IDS || process.env.SQUARE_LOCATION_ID;
  if (explicit) return explicit.split(",").map((item) => item.trim()).filter(Boolean);

  const wranglerPath = path.join(ROOT, "wrangler.jsonc");
  if (fs.existsSync(wranglerPath)) {
    const match = fs.readFileSync(wranglerPath, "utf8").match(/"SQUARE_LOCATION_ID"\s*:\s*"([^"]+)"/);
    if (match) return [match[1]];
  }

  return [DEFAULT_LOCATION_ID];
}

export async function square(pathname, options = {}) {
  const token = getSquareToken();
  const res = await fetch(`${SQUARE_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.errors?.[0];
    throw new Error(`${res.status} ${err?.code || "SQUARE_ERROR"}: ${err?.detail || res.statusText}`);
  }
  return data;
}

export async function paginate(initialPath, resultKey) {
  const items = [];
  let pathWithCursor = initialPath;

  while (pathWithCursor) {
    const data = await square(pathWithCursor);
    items.push(...(data[resultKey] || []));
    pathWithCursor = data.cursor
      ? `${initialPath}${initialPath.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(data.cursor)}`
      : null;
  }

  return items;
}

export async function listCustomers() {
  return paginate("/customers?limit=50", "customers");
}

export async function listCustomerGroups() {
  return paginate("/customers/groups?limit=50", "groups");
}

export async function listCustomerCustomAttributeDefinitions() {
  return paginate("/customers/custom-attribute-definitions?limit=100", "custom_attribute_definitions");
}

export async function listCustomerCustomAttributes(customerId) {
  return paginate(
    `/customers/${encodeURIComponent(customerId)}/custom-attributes?limit=100`,
    "custom_attributes",
  );
}

export async function createCustomerCustomAttributeDefinition(definition) {
  const data = await square("/customers/custom-attribute-definitions", {
    method: "POST",
    body: {
      idempotency_key: randomUUID(),
      custom_attribute_definition: definition,
    },
  });
  return data.custom_attribute_definition;
}

export async function upsertCustomerCustomAttribute(customerId, key, value) {
  const data = await square(
    `/customers/${encodeURIComponent(customerId)}/custom-attributes/${encodeURIComponent(key)}`,
    {
      method: "POST",
      body: {
        idempotency_key: randomUUID(),
        custom_attribute: { value },
      },
    },
  );
  return data.custom_attribute;
}

export async function createCustomerGroup(name) {
  const data = await square("/customers/groups", {
    method: "POST",
    body: {
      idempotency_key: randomUUID(),
      group: { name },
    },
  });
  return data.group;
}

export async function addCustomerToGroup(customerId, groupId) {
  return square(`/customers/${encodeURIComponent(customerId)}/groups/${encodeURIComponent(groupId)}`, {
    method: "PUT",
  });
}

export async function searchCompletedOrders() {
  const locationIds = getLocationIds();
  const orders = [];
  let cursor;

  do {
    const data = await square("/orders/search", {
      method: "POST",
      body: {
        location_ids: locationIds,
        cursor,
        limit: 50,
        return_entries: false,
        query: {
          filter: {
            state_filter: { states: ["COMPLETED"] },
          },
          sort: {
            sort_field: "CLOSED_AT",
            sort_order: "DESC",
          },
        },
      },
    });
    orders.push(...(data.orders || []));
    cursor = data.cursor;
  } while (cursor);

  return orders;
}

export function money(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((cents || 0) / 100);
}

export function daysSince(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

export function customerName(customer) {
  const parts = [
    customer.given_name,
    customer.family_name,
  ].filter(Boolean);
  return parts.join(" ").trim() || customer.company_name || customer.nickname || "(No name)";
}

export function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function writeCsv(file, rows) {
  ensureDir(path.dirname(file));
  if (!rows.length) {
    fs.writeFileSync(file, "");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  fs.writeFileSync(file, `${csv}\n`);
}

export function readCsv(file) {
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return [];
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes && char === '"' && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char === ",") {
      row.push(value);
      value = "";
    } else if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  rows.push(row);

  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

export function inferServiceGroups(serviceNames) {
  const text = serviceNames.join(" | ").toLowerCase();
  const groups = [];
  if (/ceramic|coating/.test(text)) groups.push("Ceramic Customer");
  if (/paint correction|correction|polish|swirl/.test(text)) groups.push("Paint Correction");
  if (/motorcycle|bike|touring/.test(text)) groups.push("Motorcycle");
  if (/reset/.test(text)) groups.push("Reset Detail");
  if (/refresh/.test(text)) groups.push("Refresh Detail");
  return groups;
}

export function groupList(value) {
  return String(value || "")
    .split("|")
    .map((group) => group.trim())
    .filter(Boolean);
}

export function hasGroup(value, names) {
  const wanted = names.map((name) => name.toLowerCase());
  return groupList(value).some((group) => wanted.includes(group.toLowerCase()));
}

export function isMaintenanceMember(value) {
  return hasGroup(value, ["Maintenance Member", "Recurring"]);
}

export function suggestedAction(record) {
  const days = Number(record.days_since_last_service);
  const groups = String(record.groups || "");
  const visits = Number(record.total_visits || 0);

  if (hasGroup(groups, ["Follow Up In 90 Days"])) return "Follow up in 90 days";
  if (hasGroup(groups, ["Membership Prospect"])) return "Check in on membership decision";
  if (!record.email || !record.phone) return "Update missing contact info";
  if (!record.last_service_date) return "Send first-service nurture message";
  if (groups.includes("Ceramic Customer") && days >= 120) return "Send ceramic coating check-in";
  if (days >= 90) return "Send 90-day maintenance reminder";
  if (days >= 60) return "Send inactive customer check-in";
  if (visits >= 2 && !isMaintenanceMember(groups)) return "Offer monthly maintenance membership";
  if (days >= 30) return "Send 30-day check-in";
  return "No immediate follow-up";
}

export async function buildCustomerAudit() {
  const [customers, groups, orders] = await Promise.all([
    listCustomers(),
    listCustomerGroups(),
    searchCompletedOrders(),
  ]);

  const groupsById = new Map(groups.map((group) => [group.id, group.name]));
  const ordersByCustomer = new Map();

  for (const order of orders) {
    if (!order.customer_id) continue;
    if (!ordersByCustomer.has(order.customer_id)) ordersByCustomer.set(order.customer_id, []);
    ordersByCustomer.get(order.customer_id).push(order);
  }

  return customers.map((customer) => {
    const customerOrders = ordersByCustomer.get(customer.id) || [];
    const serviceNames = [...new Set(customerOrders.flatMap((order) => (
      order.line_items || []
    ).map((item) => item.name).filter(Boolean)))];
    const lastOrder = customerOrders
      .slice()
      .sort((a, b) => new Date(b.closed_at || b.created_at || 0) - new Date(a.closed_at || a.created_at || 0))[0];
    const lastDate = lastOrder?.closed_at || lastOrder?.created_at || "";
    const groupNames = (customer.group_ids || []).map((id) => groupsById.get(id) || id);
    const inferredGroups = inferServiceGroups(serviceNames);
    if (lastDate && daysSince(lastDate) >= 90) inferredGroups.push("90+ Days Since Service");
    if (lastDate && daysSince(lastDate) >= 60) inferredGroups.push("Needs Follow-Up");
    const suggestedGroups = [...new Set(inferredGroups.filter((group) => !groupNames.includes(group)))];
    const totalCents = customerOrders.reduce((sum, order) => sum + (order.total_money?.amount || 0), 0);
    const currency = customerOrders.find((order) => order.total_money?.currency)?.total_money.currency || "USD";

    const record = {
      customer_id: customer.id,
      customer_name: customerName(customer),
      email: customer.email_address || "",
      phone: customer.phone_number || "",
      last_service_date: lastDate ? lastDate.slice(0, 10) : "",
      total_visits: customerOrders.length,
      total_spend: money(totalCents, currency),
      total_spend_cents: totalCents,
      services_purchased: serviceNames.join(" | "),
      groups: groupNames.join(" | "),
      suggested_groups: suggestedGroups.join(" | "),
      days_since_last_service: daysSince(lastDate),
      suggested_follow_up_action: "",
    };
    record.suggested_follow_up_action = suggestedAction(record);
    return record;
  }).sort((a, b) => {
    const aDays = Number(a.days_since_last_service || -1);
    const bDays = Number(b.days_since_last_service || -1);
    return bDays - aDays;
  });
}
