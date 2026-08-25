import fs from "node:fs";
import path from "node:path";
import {
  REPORT_DIR,
  buildCustomerAudit,
  ensureDir,
  getLocationIds,
  hasGroup,
  listCustomers,
  readCsv,
  square,
  todayStamp,
  writeCsv,
} from "./lib.mjs";

// Reactivation text campaign builder.
// Produces a working call sheet (CSV) and a copy-paste one-pager (Markdown)
// for personal 1:1 texts through Square Messages. It never sends anything.

const SENDER_NAME = process.env.CAMPAIGN_SENDER || "Drew";

// Customers Drew has confirmed are handled outside Square data
// (rebooked and joined monthly after the summer win-back).
const HANDLED_NAMES = [
  "Michelle Sims",
  "Cheri Pascual",
  "Roxana Alvarez",
  "Haley Smith",
];

// Special-case holds; keep out of the batch texts.
const HOLD_NOTES = new Map([
  ["Dan", "Was between jobs in June; asked to circle back around Sep 5. Text after that date."],
  ["Michael Arnold", "Partnership lead (QX80/dealership connection). Reach out personally, not with a campaign text."],
]);

const MEMBERSHIP_PROSPECTS = ["Lorenzo Edwards", "Dylan Baldridge"];

// Internal/owner records that should never get campaign texts.
const INTERNAL_NAMES = ["Drew Martin", "Paul Martin"];

// Customers to leave out of blasts entirely (bad fit, asked off, or recent sour note).
const DO_NOT_TEXT = new Map([
  ["Ally Helfrich", "Tried the monthly plan and cancelled — leave out of reactivation blasts (per Drew, Aug 2026)."],
  ["Mike  Vallis", "Left negative feedback on his Jun 15 sale. Needs a personal service-recovery message from Drew, not a blast."],
]);

async function fetchUpcomingBookings() {
  const locationId = getLocationIds()[0];
  const bookings = [];
  const now = new Date();
  let windowStart = now;
  const end = new Date(now.getTime() + 60 * 86400000);

  while (windowStart < end) {
    const windowEnd = new Date(Math.min(windowStart.getTime() + 30 * 86400000, end.getTime()));
    let cursor;
    do {
      const params = new URLSearchParams({
        location_id: locationId,
        start_at_min: windowStart.toISOString(),
        start_at_max: windowEnd.toISOString(),
        limit: "100",
      });
      if (cursor) params.set("cursor", cursor);
      const data = await square(`/bookings?${params}`);
      bookings.push(...(data.bookings || []));
      cursor = data.cursor;
    } while (cursor);
    windowStart = windowEnd;
  }

  return bookings.filter((b) => ["ACCEPTED", "PENDING"].includes(b.status));
}

function firstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  if (!first || /^(na|none|n\/a|\(no)$/i.test(first)) return "";
  return first;
}

function servicePhrase(services) {
  const text = String(services || "").toLowerCase();
  if (text.includes("motorcycle")) return "we detailed your bike";
  if (text.includes("full detail")) return "your full detail";
  if (text.includes("reset detail")) return "your reset detail";
  if (text.includes("refresh detail")) return "your refresh detail";
  if (text.includes("interior")) return "we detailed your interior";
  if (text.includes("exterior wash")) return "your wash";
  return "your last detail";
}

function monthName(isoDate) {
  if (!isoDate) return "a while back";
  return new Date(`${isoDate}T12:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

function draftFor(segment, record) {
  const first = firstName(record.customer_name) || "there";
  const phrase = servicePhrase(record.services_purchased);

  switch (segment) {
    case "membership-close":
      return `Hey ${first}, it's ${SENDER_NAME} with Sneaky Clean. When we last talked you were thinking over the monthly plan — one detail a month, we come to you, and you can alternate between two vehicles. We just opened a few more monthly spots for fall. Want me to grab you one?`;
    case "due-60-90":
      return `Hey ${first}, it's ${SENDER_NAME} with Sneaky Clean. It's been a couple of months since ${phrase}, which is right about when it's due again. We've got openings in the next couple weeks and we come to you — want me to set something up?`;
    case "check-in-30-60":
      return `Hey ${first}, it's ${SENDER_NAME} with Sneaky Clean. How's the car holding up since ${phrase}? If you want to stay ahead of it, I can pencil you in for a September refresh — we come to you as usual.`;
    case "lapsed-90-180":
      return `Hey ${first}, it's ${SENDER_NAME} with Sneaky Clean. It's been a few months since ${phrase}, and end of summer is the best time for a reset — road trips, sunscreen, and pollen all leave their mark. Want me to text you a couple of times that work? We come to you.`;
    case "lapsed-180-plus":
      return `Hey ${first}, it's ${SENDER_NAME} with Sneaky Clean — we detailed for you back in ${monthName(record.last_service_date)}. I'm reaching out to a few past customers with fall openings. If the car could use some attention, we'd love to take care of it again — we come to you.`;
    case "never-booked":
      return `Hey ${first}, it's ${SENDER_NAME} with Sneaky Clean, the mobile detailing service in Murfreesboro. We connected a while back but never got you on the schedule. We've got September openings and we come to you — want me to hold you a spot?`;
    default:
      return "";
  }
}

const SEGMENTS = [
  {
    key: "membership-close",
    priority: 1,
    title: "Membership closes (confirm they have not already joined)",
    batch: "Day 1",
  },
  {
    key: "due-60-90",
    priority: 2,
    title: "Due again now — serviced 60-90 days ago",
    batch: "Day 1",
  },
  {
    key: "check-in-30-60",
    priority: 3,
    title: "Warm check-ins — serviced 30-60 days ago",
    batch: "Day 2",
  },
  {
    key: "lapsed-90-180",
    priority: 4,
    title: "Lapsed — serviced 90-180 days ago",
    batch: "Day 2-3",
  },
  {
    key: "lapsed-180-plus",
    priority: 5,
    title: "Cold — serviced 180+ days ago",
    batch: "Day 3",
  },
  {
    key: "never-booked",
    priority: 6,
    title: "Leads who never booked",
    batch: "Day 4+",
  },
];

function segmentFor(record) {
  if (MEMBERSHIP_PROSPECTS.includes(record.customer_name.trim())) return "membership-close";
  const days = Number(record.days_since_last_service);
  if (!record.last_service_date) return "never-booked";
  if (Number.isNaN(days)) return "never-booked";
  if (days >= 180) return "lapsed-180-plus";
  if (days >= 90) return "lapsed-90-180";
  if (days >= 60) return "due-60-90";
  if (days >= 30) return "check-in-30-60";
  return null; // serviced within 30 days: leave alone
}

const [audit, customers, upcoming] = await Promise.all([
  buildCustomerAudit(),
  listCustomers(),
  fetchUpcomingBookings(),
]);

const notesById = new Map(customers.map((c) => [c.id, (c.note || "").trim()]));
const scheduledIds = new Set(upcoming.map((b) => b.customer_id).filter(Boolean));
const auditById = new Map(audit.map((r) => [r.customer_id, r]));

const rows = [];
const skipped = { members: [], handled: [], scheduled: [], holds: [], doNotText: [], noPhone: [], recent: [] };

for (const record of audit) {
  const name = record.customer_name.trim();

  if (INTERNAL_NAMES.includes(name)) continue;
  if (DO_NOT_TEXT.has(name)) {
    skipped.doNotText.push({ ...record, hold_note: DO_NOT_TEXT.get(name) });
    continue;
  }
  if (HOLD_NOTES.has(name)) {
    skipped.holds.push({ ...record, hold_note: HOLD_NOTES.get(name) });
    continue;
  }
  if (HANDLED_NAMES.includes(name)) {
    skipped.handled.push(record);
    continue;
  }
  if (hasGroup(record.groups, ["Maintenance Member", "Recurring"])) {
    skipped.members.push(record);
    continue;
  }
  if (scheduledIds.has(record.customer_id)) {
    skipped.scheduled.push(record);
    continue;
  }
  if (!record.phone) {
    skipped.noPhone.push(record);
    continue;
  }

  const segment = segmentFor(record);
  if (!segment) {
    skipped.recent.push(record);
    continue;
  }

  rows.push({
    priority: SEGMENTS.find((s) => s.key === segment).priority,
    segment,
    customer_name: record.customer_name,
    phone: record.phone,
    days_since_last_service: record.days_since_last_service,
    last_service_date: record.last_service_date,
    services_purchased: record.services_purchased,
    total_spend: record.total_spend,
    square_note: notesById.get(record.customer_id) || "",
    draft_text: draftFor(segment, record),
    status: "",
  });
}

rows.sort((a, b) => a.priority - b.priority || Number(b.days_since_last_service || 0) - Number(a.days_since_last_service || 0));

ensureDir(REPORT_DIR);
const stamp = todayStamp();

// Carry statuses forward from earlier campaign files so re-running the
// generator never produces a list that double-texts someone already contacted.
const priorFiles = fs.readdirSync(REPORT_DIR)
  .filter((f) => /^text-campaign-\d{4}-\d{2}-\d{2}\.csv$/.test(f))
  .sort();
const statusByName = new Map();
for (const f of priorFiles) {
  for (const r of readCsv(path.join(REPORT_DIR, f))) {
    if (r.status) statusByName.set(r.customer_name, r.status);
  }
}
for (const row of rows) {
  if (!row.status && statusByName.has(row.customer_name)) {
    row.status = statusByName.get(row.customer_name);
  }
}
const csvPath = path.join(REPORT_DIR, `text-campaign-${stamp}.csv`);
writeCsv(csvPath, rows);

const lines = [];
lines.push(`# Sneaky Clean Text Campaign - ${stamp}`);
lines.push("");
lines.push(`Textable customers: ${rows.length}`);
lines.push("");
lines.push("## How To Run It");
lines.push("");
lines.push("1. Send batches of about 10 per day through Square Messages so replies and bookings stay manageable.");
lines.push("2. Work top to bottom: the list is ordered by expected response rate.");
lines.push("3. Personalize before sending if you remember the vehicle or job — even one detail helps.");
lines.push(`4. Track progress in \`growth/reports/text-campaign-${stamp}.csv\` (status column: sent / replied / booked / no).`);
lines.push("5. No reply after 4 days? Send one bump: \"No rush at all — just wanted to float it before the fall schedule fills. If now's not the time, all good.\"");
lines.push("6. When someone books, offer the monthly plan at the appointment, and schedule their next visit before you leave.");
lines.push("");

for (const seg of SEGMENTS) {
  const allSegRows = rows.filter((r) => r.segment === seg.key);
  const segRows = allSegRows.filter((r) => !r.status);
  const contacted = allSegRows.length - segRows.length;
  if (!allSegRows.length) continue;
  lines.push(`## ${seg.priority}. ${seg.title} — ${seg.batch} (${segRows.length}${contacted ? ` to send, ${contacted} already handled` : ""})`);
  lines.push("");
  for (const row of segRows) {
    const meta = [
      row.phone,
      row.last_service_date ? `last service ${row.last_service_date} (${row.days_since_last_service}d)` : "never serviced",
      row.services_purchased || null,
      row.square_note ? `note: ${row.square_note}` : null,
    ].filter(Boolean).join(" · ");
    lines.push(`**${row.customer_name}** — ${meta}`);
    lines.push("");
    lines.push(`> ${row.draft_text}`);
    lines.push("");
  }
}

lines.push("## Not In This Campaign");
lines.push("");
for (const record of skipped.doNotText) {
  lines.push(`- DO NOT TEXT: ${record.customer_name} — ${record.hold_note}`);
}
for (const record of skipped.holds) {
  lines.push(`- HOLD: ${record.customer_name} (${record.phone || "no phone"}) — ${record.hold_note}`);
}
for (const record of skipped.handled) {
  lines.push(`- Handled: ${record.customer_name} — rebooked and joined monthly.`);
}
for (const record of skipped.members) {
  lines.push(`- Member: ${record.customer_name} — already on a monthly plan in Square.`);
}
for (const record of skipped.scheduled) {
  lines.push(`- Scheduled: ${record.customer_name} — already has an upcoming booking.`);
}
for (const record of skipped.recent) {
  lines.push(`- Too soon: ${record.customer_name} — serviced within the last 30 days.`);
}
if (skipped.noPhone.length) {
  const names = [...new Set(skipped.noPhone.map((r) => r.customer_name))];
  lines.push(`- No phone on file (${names.length}): ${names.join(", ")}`);
}
lines.push("");

const mdPath = path.join(REPORT_DIR, `text-campaign-${stamp}.md`);
fs.writeFileSync(mdPath, lines.join("\n"));

console.log(`Wrote ${csvPath}`);
console.log(`Wrote ${mdPath}`);
console.log(`Campaign rows: ${rows.length}`);
for (const seg of SEGMENTS) {
  const count = rows.filter((r) => r.segment === seg.key).length;
  if (count) console.log(`  ${seg.priority}. ${seg.key}: ${count}`);
}
const skippedTotal = Object.values(skipped).reduce((sum, list) => sum + list.length, 0);
console.log(`Skipped: ${skippedTotal} (members ${skipped.members.length}, handled ${skipped.handled.length}, scheduled ${skipped.scheduled.length}, holds ${skipped.holds.length}, recent ${skipped.recent.length}, no phone ${skipped.noPhone.length})`);

// Anyone upcoming who is not in the audit yet (brand-new customer) is fine to ignore.
const unknownScheduled = [...scheduledIds].filter((id) => !auditById.has(id));
if (unknownScheduled.length) {
  console.log(`Note: ${unknownScheduled.length} upcoming booking customer(s) not in the audit yet.`);
}
