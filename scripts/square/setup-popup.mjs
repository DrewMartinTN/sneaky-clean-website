#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  EXPORT_DIR,
  createCustomerCustomAttributeDefinition,
  createCustomerGroup,
  ensureDir,
  getLocationIds,
  listCustomerCustomAttributeDefinitions,
  listCustomerGroups,
  paginate,
  square,
} from "./lib.mjs";

const STRING_SCHEMA = {
  $ref: "https://developer-production-s.squarecdn.com/schemas/v1/common.json#squareup.common.String",
};
const BOOLEAN_SCHEMA = {
  $ref: "https://developer-production-s.squarecdn.com/schemas/v1/common.json#squareup.common.Boolean",
};

export const POPUP_CUSTOM_FIELDS = [
  field("apartment-community", "Apartment Community", "Apartment community associated with this customer."),
  field("unit-number", "Unit Number", "Apartment building or unit number."),
  field("vehicle-year", "Vehicle Year", "Vehicle model year."),
  field("vehicle-make", "Vehicle Make", "Vehicle manufacturer."),
  field("vehicle-model", "Vehicle Model", "Vehicle model."),
  field("vehicle-color", "Vehicle Color", "Vehicle color."),
  field("popup-upgrade-interest", "Pop-Up Upgrade Interest", "Requested apartment pop-up upgrades."),
  field("popup-preferred-availability", "Pop-Up Preferred Availability", "Resident's preferred event availability."),
  field("popup-vehicle-notes", "Pop-Up Vehicle Notes", "Vehicle-condition notes for the apartment pop-up."),
  field("popup-sms-consent", "Pop-Up SMS Consent", "Whether the customer consented to event-related text messages.", BOOLEAN_SCHEMA),
  field("popup-role", "Pop-Up Role", "Resident or property manager."),
  field("popup-status", "Pop-Up Status", "Current apartment pop-up workflow status."),
  field("popup-requested-at", "Pop-Up Requested At", "UTC timestamp of the latest pop-up request."),
  field("popup-community-key", "Pop-Up Community Key", "Normalized community key used for grouping submissions."),
  field("popup-service-selection", "Pop-Up Service Selection", "Requested apartment pop-up service."),
  field("property-address", "Property Address", "Apartment community street address."),
  field("popup-estimated-vehicles", "Estimated Pop-Up Vehicles", "Property manager's estimated interested vehicle count."),
  field("popup-preferred-dates", "Preferred Pop-Up Dates", "Property manager's preferred event dates."),
  field("popup-time-window", "Preferred Pop-Up Window", "Property manager's preferred service window."),
  field("popup-setup-area", "Pop-Up Setup Area", "Designated setup or parking area."),
  field("popup-property-notes", "Pop-Up Property Notes", "Property access or setup notes."),
  field("popup-site-permission", "Pop-Up Site Permission", "Property manager confirmed permission for on-site mobile cleaning.", BOOLEAN_SCHEMA),
];

const GROUP_NAMES = ["Apartment Pop-Up Interest", "Apartment Property Manager"];
const TEMPLATE_NAME = "Resident Pop-Up — $60 Express Clean (Template)";
const TEMPLATE_DESCRIPTION = "Hidden template for confirmed apartment-community pop-ups. Includes a quick exterior wash, wheels and tires, quick interior blow-out, and interior vacuum. Maintenance service, not a full detail.";

function field(key, name, description, schema = STRING_SCHEMA) {
  return {
    key,
    name,
    description,
    visibility: "VISIBILITY_READ_WRITE_VALUES",
    schema,
  };
}

function parseArgs() {
  return { dryRun: process.argv.includes("--dry-run") };
}

async function ensureGroups(dryRun) {
  const existing = await listCustomerGroups();
  const byName = new Map(existing.map((group) => [group.name, group]));
  const groups = {};

  for (const name of GROUP_NAMES) {
    if (byName.has(name)) {
      groups[name] = byName.get(name).id;
      console.log(`exists  group  ${name}`);
    } else if (dryRun) {
      groups[name] = "(dry-run)";
      console.log(`create  group  ${name}`);
    } else {
      const created = await createCustomerGroup(name);
      groups[name] = created.id;
      console.log(`created group  ${name}`);
    }
  }
  return groups;
}

async function ensureCustomFields(dryRun) {
  const existing = await listCustomerCustomAttributeDefinitions();
  const byOwnKey = new Map(existing.map((definition) => [definition.key.split(":").at(-1), definition]));
  const definitions = {};

  for (const desired of POPUP_CUSTOM_FIELDS) {
    if (byOwnKey.has(desired.key)) {
      definitions[desired.key] = byOwnKey.get(desired.key).key;
      console.log(`exists  field  ${desired.name}`);
    } else if (dryRun) {
      definitions[desired.key] = desired.key;
      console.log(`create  field  ${desired.name}`);
    } else {
      const created = await createCustomerCustomAttributeDefinition(desired);
      definitions[desired.key] = created.key;
      console.log(`created field  ${desired.name}`);
    }
  }
  return definitions;
}

async function ensureTemplateService(dryRun) {
  const items = await paginate("/catalog/list?types=ITEM&limit=100", "objects");
  const existing = items.find((item) => item.item_data?.name === TEMPLATE_NAME);
  if (existing) {
    const variation = existing.item_data?.variations?.[0];
    console.log(`exists  service ${TEMPLATE_NAME}`);
    return { itemId: existing.id, variationId: variation?.id || "", name: TEMPLATE_NAME };
  }

  if (dryRun) {
    console.log(`create  service ${TEMPLATE_NAME}`);
    return { itemId: "(dry-run)", variationId: "(dry-run)", name: TEMPLATE_NAME };
  }

  const itemRef = "#POPUP_ITEM";
  const variationRef = "#POPUP_VARIATION";
  const result = await square("/catalog/object", {
    method: "POST",
    body: {
      idempotency_key: randomUUID(),
      object: {
        type: "ITEM",
        id: itemRef,
        present_at_all_locations: true,
        item_data: {
          name: TEMPLATE_NAME,
          description: TEMPLATE_DESCRIPTION,
          product_type: "APPOINTMENTS_SERVICE",
          variations: [
            {
              type: "ITEM_VARIATION",
              id: variationRef,
              present_at_all_locations: true,
              item_variation_data: {
                item_id: itemRef,
                name: "45 minutes",
                pricing_type: "FIXED_PRICING",
                price_money: { amount: 6000, currency: "USD" },
                service_duration: 45 * 60 * 1000,
                available_for_booking: false,
                team_member_ids: [],
              },
            },
          ],
        },
      },
    },
  });
  const item = result.catalog_object;
  const variation = item?.item_data?.variations?.[0];
  console.log(`created service ${TEMPLATE_NAME}`);
  return { itemId: item?.id || "", variationId: variation?.id || "", name: TEMPLATE_NAME };
}

const args = parseArgs();
const [groups, customFields, service] = await Promise.all([
  ensureGroups(args.dryRun),
  ensureCustomFields(args.dryRun),
  ensureTemplateService(args.dryRun),
]);

const config = {
  generatedAt: new Date().toISOString(),
  locationIds: getLocationIds(),
  groups,
  customFields,
  service,
};

console.log("\nConfiguration:");
console.log(JSON.stringify(config, null, 2));

if (!args.dryRun) {
  ensureDir(EXPORT_DIR);
  const output = path.join(EXPORT_DIR, "popup-square-config.json");
  fs.writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`\nSaved ${output}`);
}
