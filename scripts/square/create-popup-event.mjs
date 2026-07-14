import fs from "node:fs/promises";
import path from "node:path";
import { EXPORT_DIR, getLocationIds, square } from "./lib.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const communityIndex = args.indexOf("--community");
const community = communityIndex >= 0 ? String(args[communityIndex + 1] || "").trim() : "";

if (!community) {
  console.error('Usage: npm run square:create-popup-event -- --community "Community Name" [--apply]');
  process.exit(1);
}

const name = `${community} Resident Pop-Up — $60 Express Clean`;
const locationIds = getLocationIds();
const itemRef = "#popup-item";
const variationRef = "#popup-variation";
const object = {
  type: "ITEM",
  id: itemRef,
  present_at_all_locations: true,
  item_data: {
    name,
    description:
      "Community-only maintenance service: quick exterior wash, wheels and tires, quick interior blow-out, and vacuum. Not a full detail.",
    product_type: "APPOINTMENTS_SERVICE",
    variations: [
      {
        type: "ITEM_VARIATION",
        id: variationRef,
        present_at_all_locations: true,
        item_variation_data: {
          item_id: itemRef,
          name: "$60 Express Clean",
          pricing_type: "FIXED_PRICING",
          price_money: { amount: 6000, currency: "USD" },
          available_for_booking: false,
          service_duration: 45 * 60 * 1000,
          team_member_ids: [],
        },
      },
    ],
  },
};

if (!apply) {
  console.log(`Dry run: would create hidden service "${name}" at $60 for 45 minutes.`);
  console.log("Run again with --apply after the community date is approved.");
  process.exit(0);
}

const response = await square("/catalog/object", {
  method: "POST",
  body: {
    idempotency_key: crypto.randomUUID(),
    object,
  },
});

const item = response.catalog_object;
const variation = item?.item_data?.variations?.[0];
await fs.mkdir(EXPORT_DIR, { recursive: true });
const safeName = community.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const outputPath = path.join(EXPORT_DIR, `popup-event-${safeName}.json`);
await fs.writeFile(
  outputPath,
  `${JSON.stringify({ community, name, locationIds, itemId: item?.id, variationId: variation?.id }, null, 2)}\n`,
);

console.log(`Created hidden service: ${name}`);
console.log(`Item ID: ${item?.id}`);
console.log(`Variation ID: ${variation?.id}`);
console.log(`Saved ${outputPath}`);
