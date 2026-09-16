#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, EXPORT_DIR, paginate, square, ensureDir } from './lib.mjs';

const apply = process.argv.includes('--apply');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/memberships.json'), 'utf8'));
const objects = await paginate('/catalog/list?types=ITEM,SUBSCRIPTION_PLAN,DISCOUNT&limit=100', 'objects');
const objectName = o => o.item_data?.name || o.subscription_plan_data?.name || o.discount_data?.name;
const lookup = (type, name) => {
  const matches = objects.filter(o => o.type === type && objectName(o) === name && !o.is_deleted);
  if (matches.length > 1) throw new Error(`Duplicate ${type}: ${name}; resolve before syncing.`);
  return matches[0];
};
async function save(object) {
  if (!apply) { console.log(`preview ${object.type}: ${objectName(object) || object.subscription_plan_variation_data?.name}`); return object; }
  const result = await square('/catalog/object', { method: 'POST', body: { idempotency_key: randomUUID(), object } });
  return result.catalog_object;
}
const dollars = cents => `$${cents / 100}`;
const report = { plans: {}, initialClean: null };

for (const plan of config.plans) {
  const name = `${plan.name} Membership`;
  const description = [plan.description, ...plan.benefits,
    `1 vehicle: ${dollars(plan.prices['1'])}/month. 2 vehicles: ${dollars(plan.prices['2'])}/month. Benefits apply to each enrolled vehicle.`,
    `Separate initial deep clean: ${dollars(config.initialCleanPerVehicleCents)} per vehicle (${dollars(config.initialCleanPerVehicleCents * 2)} for two).`,
    'Recurring billing is enrolled through the matching Square subscription plan after the initial clean. This catalog entry describes the membership; a one-time item sale does not start a subscription.'
  ].join('\n');
  const priorItem = lookup('ITEM', name);
  const itemId = priorItem?.id || `#membership-${plan.key}`;
  const priorVariations = priorItem?.item_data?.variations || [];
  const item = await save({ ...(priorItem || {}), type: 'ITEM', id: itemId, present_at_all_locations: true,
    item_data: { ...(priorItem?.item_data || {}), name, description, product_type: 'REGULAR',
      variations: [1, 2].map(count => {
        const variationName = `${count} ${count === 1 ? 'Vehicle' : 'Vehicles'} — Monthly`;
        const prior = priorVariations.find(v => v.item_variation_data.name === variationName);
        return { ...(prior || {}), type: 'ITEM_VARIATION', id: prior?.id || `#${plan.key}-${count}-item`, present_at_all_locations: true,
          item_variation_data: { ...(prior?.item_variation_data || {}), item_id: itemId, name: variationName,
            pricing_type: 'FIXED_PRICING', price_money: { amount: plan.prices[count], currency: config.currency },
            track_inventory: false, sellable: true } };
      })
    }
  });
  let subscriptionPlan = lookup('SUBSCRIPTION_PLAN', name);
  if (!subscriptionPlan) subscriptionPlan = await save({ type: 'SUBSCRIPTION_PLAN', id: `#plan-${plan.key}`,
    present_at_all_locations: true, subscription_plan_data: { name, eligible_item_ids: [item.id], all_items: false } });
  const variants = {};
  for (const count of [1, 2]) {
    const variationName = `${plan.name} — ${count} ${count === 1 ? 'Vehicle' : 'Vehicles'} — ${dollars(plan.prices[count])}/month`;
    let variation = subscriptionPlan.subscription_plan_data.subscription_plan_variations?.find(v => v.subscription_plan_variation_data.name === variationName);
    if (variation) {
      const phases = variation.subscription_plan_variation_data.phases;
      if (phases.length !== 1 || phases[0].cadence !== 'MONTHLY' || phases[0].periods || phases[0].pricing?.type !== 'STATIC'
        || phases[0].pricing?.price_money?.amount !== plan.prices[count] || phases[0].pricing?.price_money?.currency !== config.currency
        || !variation.present_at_all_locations) throw new Error(`Existing plan variation does not match approved pricing: ${variationName}`);
    } else variation = await save({ type: 'SUBSCRIPTION_PLAN_VARIATION', id: `#${plan.key}-${count}-plan`, present_at_all_locations: true,
      subscription_plan_variation_data: { name: variationName, subscription_plan_id: subscriptionPlan.id,
        phases: [{ cadence: 'MONTHLY', ordinal: 0, pricing: { type: 'STATIC', price_money: { amount: plan.prices[count], currency: config.currency } } }] } });
    variants[count] = { variationId: variation.id, priceCents: plan.prices[count] };
  }
  const discountName = `${plan.shortName} Member — ${plan.discountPercent}% Off Details & Upgrades`;
  const priorDiscount = lookup('DISCOUNT', discountName);
  const discount = await save({ ...(priorDiscount || {}), type: 'DISCOUNT', id: priorDiscount?.id || `#discount-${plan.key}`,
    present_at_all_locations: true,
    discount_data: { ...(priorDiscount?.discount_data || {}), name: discountName, discount_type: 'FIXED_PERCENTAGE', percentage: String(plan.discountPercent) } });
  report.plans[plan.key] = { itemId: item.id, planId: subscriptionPlan.id, variants, discountId: discount.id };
  console.log(`${plan.name}: ${dollars(plan.prices['1'])} / ${dollars(plan.prices['2'])} monthly; ${plan.discountPercent}% member discount`);
}

// Use the existing Reset service's scheduling durations and assigned staff.
// The reduced membership initial-clean price is separate from recurring billing.
const reset = (await square('/catalog/object/HUOR6OTIZE2FIWJZUTFPFWDU')).object;
const initialName = 'Membership Initial Deep Clean — $199 Per Vehicle';
const priorInitial = lookup('ITEM', initialName);
const initialId = priorInitial?.id || '#membership-initial-clean';
const initial = await save({ ...(priorInitial || {}), type: 'ITEM', id: initialId, present_at_all_locations: true,
  item_data: { ...(priorInitial?.item_data || {}), name: initialName,
    description: 'One-time interior and exterior deep clean before Undercover Agent, Special Agent, or Black Ops monthly membership service begins. $199 per vehicle; $398 total for two vehicles. Schedule a separate initial-clean appointment for each vehicle. Monthly membership billing is separate. Record selected membership and vehicle count in appointment notes.',
    product_type: 'APPOINTMENTS_SERVICE', is_taxable: reset.item_data.is_taxable, tax_ids: reset.item_data.tax_ids,
    variations: reset.item_data.variations.map((source, index) => {
      const prior = priorInitial?.item_data.variations.find(v => v.item_variation_data.name === source.item_variation_data.name);
      return { ...(prior || {}), type: 'ITEM_VARIATION', id: prior?.id || `#initial-${index}`, present_at_all_locations: true,
        item_variation_data: { ...(prior?.item_variation_data || {}), item_id: initialId, name: source.item_variation_data.name,
          pricing_type: 'FIXED_PRICING', price_money: { amount: config.initialCleanPerVehicleCents, currency: config.currency },
          service_duration: source.item_variation_data.service_duration, available_for_booking: true,
          team_member_ids: source.item_variation_data.team_member_ids } };
    })
  }
});
report.initialClean = { itemId: initial.id, variations: initial.item_data.variations.map(v => ({
  id: v.id, name: v.item_variation_data.name, priceCents: v.item_variation_data.price_money.amount,
  durationMinutes: v.item_variation_data.service_duration / 60000, teamMemberIds: v.item_variation_data.team_member_ids
})) };
if (apply) {
  ensureDir(EXPORT_DIR);
  fs.writeFileSync(path.join(EXPORT_DIR, 'membership-square-setup.json'), JSON.stringify(report, null, 2) + '\n');
  const publicData = { ...config, square: report };
  fs.writeFileSync(path.join(ROOT, 'assets/js/membership-data.js'), '// Generated by scripts/square/setup-memberships.mjs from approved membership terms.\nwindow.SneakyCleanMemberships = ' + JSON.stringify(publicData, null, 2) + ';\n');
  console.log('Saved verified catalog IDs and browser membership data. No customers were enrolled or charged.');
} else console.log('Dry run only. Use --apply to synchronize this configuration with Square.');
