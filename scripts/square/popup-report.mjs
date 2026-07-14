#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  REPORT_DIR,
  customerName,
  ensureDir,
  listCustomerCustomAttributes,
  listCustomerGroups,
  listCustomers,
  todayStamp,
  writeCsv,
} from "./lib.mjs";

const INTEREST_GROUP = "Apartment Pop-Up Interest";
const MANAGER_GROUP = "Apartment Property Manager";

function shortKey(key) {
  return String(key || "").split(":").at(-1);
}

function attributeMap(attributes) {
  return Object.fromEntries(attributes.map((attribute) => [shortKey(attribute.key), attribute.value]));
}

function vehicleLabel(fields) {
  return [fields["vehicle-year"], fields["vehicle-make"], fields["vehicle-model"], fields["vehicle-color"]]
    .filter(Boolean)
    .join(" ");
}

const [customers, groups] = await Promise.all([listCustomers(), listCustomerGroups()]);
const interestGroupId = groups.find((group) => group.name === INTEREST_GROUP)?.id;
const managerGroupId = groups.find((group) => group.name === MANAGER_GROUP)?.id;

if (!interestGroupId) throw new Error(`Missing Square customer group: ${INTEREST_GROUP}`);

const relevant = customers.filter((customer) =>
  customer.group_ids?.some((id) => id === interestGroupId || id === managerGroupId),
);

const records = await Promise.all(
  relevant.map(async (customer) => ({
    customer,
    fields: attributeMap(await listCustomerCustomAttributes(customer.id)),
  })),
);

const communities = new Map();
for (const record of records) {
  const key = record.fields["popup-community-key"] || record.fields["apartment-community"]?.toLowerCase();
  if (!key) continue;
  if (!communities.has(key)) communities.set(key, { residents: [], managers: [] });
  const target = record.fields["popup-role"] === "Property Manager" ? "managers" : "residents";
  communities.get(key)[target].push(record);
}

const rows = [...communities.entries()]
  .map(([key, community]) => {
    const sample = community.residents[0] || community.managers[0];
    const residentNames = community.residents.map(({ customer }) => customerName(customer));
    const managerNames = community.managers.map(({ customer }) => customerName(customer));
    const vehicles = community.residents.map(({ fields }) => vehicleLabel(fields)).filter(Boolean);
    const availability = [...new Set(community.residents.map(({ fields }) => fields["popup-preferred-availability"]).filter(Boolean))];
    const upgrades = [...new Set(community.residents.flatMap(({ fields }) => String(fields["popup-upgrade-interest"] || "").split(" | ")).filter(Boolean))];
    return {
      community: sample?.fields["apartment-community"] || key,
      community_key: key,
      interested_vehicles: community.residents.length,
      threshold_reached: community.residents.length >= 2 ? "Yes" : "No",
      property_manager_found: community.managers.length ? "Yes" : "No",
      resident_names: residentNames.join(" | "),
      resident_vehicles: vehicles.join(" | "),
      preferred_availability: availability.join(" | "),
      upgrade_interest: upgrades.join(" | "),
      manager_names: managerNames.join(" | "),
      manager_contacts: community.managers
        .map(({ customer }) => customer.email_address || customer.phone_number || "")
        .filter(Boolean)
        .join(" | "),
      suggested_action: community.residents.length >= 2
        ? community.managers.length
          ? "Contact property manager and approve a service window"
          : "Find property manager contact and approve a service window"
        : "Keep collecting resident interest",
    };
  })
  .sort((a, b) => Number(b.interested_vehicles) - Number(a.interested_vehicles) || a.community.localeCompare(b.community));

ensureDir(REPORT_DIR);
const stamp = todayStamp();
const csvPath = path.join(REPORT_DIR, `pop-up-community-report-${stamp}.csv`);
const mdPath = path.join(REPORT_DIR, `pop-up-community-report-${stamp}.md`);
writeCsv(csvPath, rows);

const ready = rows.filter((row) => row.threshold_reached === "Yes");
const markdown = [
  "# Apartment Pop-Up Community Report",
  "",
  `Generated: ${new Date().toLocaleString()}`,
  "",
  `Communities tracked: ${rows.length}`,
  `Communities at 2+ interested vehicles: ${ready.length}`,
  "",
  "## Ready For Manual Coordination",
  "",
  ...(ready.length
    ? ready.map((row) => `- **${row.community}** — ${row.interested_vehicles} vehicles; ${row.suggested_action}.`)
    : ["No communities have reached the two-vehicle threshold yet."]),
  "",
  "## All Communities",
  "",
  ...(rows.length
    ? rows.map((row) => `- **${row.community}** — ${row.interested_vehicles} interested; manager: ${row.property_manager_found}; next: ${row.suggested_action}.`)
    : ["No apartment pop-up requests found in Square."]),
  "",
].join("\n");

fs.writeFileSync(mdPath, markdown);
console.log(`Wrote ${rows.length} communities to ${csvPath}`);
console.log(`Wrote summary to ${mdPath}`);
console.log(`${ready.length} communities have reached the two-vehicle threshold.`);
