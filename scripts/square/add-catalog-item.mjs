#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import process from "node:process";
import { square, getLocationIds } from "./lib.mjs";

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--name") args.name = argv[++i];
    else if (arg === "--price") args.priceDollars = Number(argv[++i]);
    else if (arg === "--duration-min") args.durationMinutes = Number(argv[++i]);
    else if (arg === "--variation-name") args.variationName = argv[++i];
    else if (arg === "--description") args.description = argv[++i];
    else if (arg === "--no-booking") args.availableForBooking = false;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.name) {
    console.error("Missing --name");
    process.exit(1);
  }
  if (!Number.isFinite(args.priceDollars)) {
    console.error("Missing or invalid --price");
    process.exit(1);
  }
  const durationMinutes = Number.isFinite(args.durationMinutes) ? args.durationMinutes : 120;
  const priceCents = Math.round(args.priceDollars * 100);
  const availableForBooking = args.availableForBooking !== false;
  const variationName = args.variationName || "Regular";
  const locationIds = getLocationIds();

  const itemRef = "#NEW_ITEM";
  const variationRef = "#NEW_VARIATION";

  const body = {
    idempotency_key: randomUUID(),
    object: {
      type: "ITEM",
      id: itemRef,
      present_at_all_locations: true,
      item_data: {
        name: args.name,
        description: args.description || undefined,
        product_type: "APPOINTMENTS_SERVICE",
        variations: [
          {
            type: "ITEM_VARIATION",
            id: variationRef,
            present_at_all_locations: true,
            item_variation_data: {
              item_id: itemRef,
              name: variationName,
              pricing_type: "FIXED_PRICING",
              price_money: { amount: priceCents, currency: "USD" },
              service_duration: durationMinutes * 60 * 1000,
              available_for_booking: availableForBooking,
              team_member_ids: [],
            },
          },
        ],
      },
    },
  };

  console.log("Catalog item to create:");
  console.log(JSON.stringify(body.object, null, 2));
  console.log(`Locations: ${locationIds.join(", ")}`);

  if (args.dryRun) {
    console.log("\nDry run — not sending to Square.");
    return;
  }

  const result = await square("/catalog/object", { method: "POST", body });
  const item = result.catalog_object;
  const variation = item?.item_data?.variations?.[0];
  console.log("\nCreated:");
  console.log(`  Item ID:      ${item?.id}`);
  console.log(`  Variation ID: ${variation?.id}`);
  console.log(`  Name:         ${item?.item_data?.name}`);
  console.log(`  Price:        $${(priceCents / 100).toFixed(2)}`);
  console.log(`  Duration:     ${durationMinutes} min`);
  console.log(`  Bookable:     ${availableForBooking}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
