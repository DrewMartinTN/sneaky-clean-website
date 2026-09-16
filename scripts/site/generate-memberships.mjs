import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const config = JSON.parse(await fs.readFile(path.join(root, 'content/memberships.json'), 'utf8'));
const money = cents => `$${cents / 100}`;
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const summary = config.plans.map(plan => `${plan.name}: ${money(plan.prices['1'])}/month for 1 vehicle or ${money(plan.prices['2'])}/month for 2. ${plan.benefits.join('; ')}.`).join(' ')
  + ` Each vehicle requires a separate ${money(config.initialCleanPerVehicleCents)} initial deep clean (${money(config.initialCleanPerVehicleCents * 2)} for two). Book each initial clean online; recurring billing is set up separately in Square after the initial clean.`;
const cards = config.plans.map(plan => `          <article class="membership-tier membership-tier--${plan.key}" aria-labelledby="${plan.key}-title">
            <p class="membership-tier__label${plan.key === 'special-agent' ? ' membership-tier__label--popular' : plan.key === 'black-ops' ? ' membership-tier__label--value' : ''}">${plan.key === 'undercover' ? 'For already well-kept vehicles' : plan.key === 'special-agent' ? 'Most popular' : 'Best value'}</p>
            <h3 id="${plan.key}-title">${plan.name}</h3>
            <div class="membership-prices" aria-label="${plan.name} monthly pricing">
              <p><span>1 vehicle</span><strong>${money(plan.prices['1'])}<small>/mo</small></strong></p>
              <p><span>2 vehicles</span><strong>${money(plan.prices['2'])}<small>/mo</small></strong></p>
            </div>
            <ul class="membership-tier__features">
${plan.benefits.map(benefit => `              <li>${escape(benefit)}</li>`).join('\n')}
${plan.key === 'undercover' ? '              <li>About one hour per vehicle for monthly maintenance</li>\n' : ''}            </ul>
            <a class="button button--dark" href="#sc-membership-${plan.key}">Choose ${plan.shortName}</a>
          </article>`).join('\n');
const section = `    <section class="membership" id="membership" aria-labelledby="membership-title">
      <div class="wrap membership__panel membership__panel--tiers">
        <div class="membership__intro">
          <div class="membership__copy">
            <p class="eyebrow">Choose your clearance level</p>
            <h2 id="membership-title">Monthly car-care memberships.</h2>
            <p>Consistent professional care at your home, office, or approved business location. Choose your membership, add one or two vehicles, and start with an interior and exterior deep clean.</p>
            <ul class="membership-perks">
              <li>One- and two-vehicle monthly plans</li>
              <li>Benefits for each enrolled vehicle</li>
              <li>15–30% off additional details and upgrades</li>
            </ul>
          </div>
          <aside class="membership-start" aria-labelledby="membership-start-title">
            <p class="eyebrow">Every vehicle starts with a reset</p>
            <h3 id="membership-start-title">Initial deep clean</h3>
            <p class="membership-start__price">$199 <span>per vehicle</span></p>
            <p class="membership-start__note">Separate one-time charge before monthly care. Two vehicles: $398 total.</p>
            <p>A complete interior and exterior deep clean to bring each vehicle to membership standard. Schedule a separate appointment for each vehicle.</p>
            <a class="button" href="#sc-book-membership">Book an Initial Clean</a>
          </aside>
        </div>
        <div class="membership-tiers" aria-label="Monthly membership pricing">
${cards}
        </div>
        <p class="membership__footer">Choose a plan to book your initial clean. No payment is taken with the appointment request; monthly billing is set up separately in Square after the initial clean.</p>
      </div>
    </section>`;
const homePath = path.join(root, 'index.html');
let home = await fs.readFile(homePath, 'utf8');
home = home.replace(/    <section class="membership"[\s\S]*?<\/section>/, section);
home = home.replace(/("name": "What monthly memberships do you offer\?",[\s\S]*?"text": )"[^"\n]*"/, (_match, prefix) => prefix + JSON.stringify(summary));
home = home.replace(/(<h3>What monthly memberships do you offer\?<\/h3>\s*<p>)[\s\S]*?(<\/p>)/, (_match, prefix, suffix) => prefix + summary + suffix);
await fs.writeFile(homePath, home);

// Keep the public answers consistent across the generated location pages.
const contentPath = path.join(root, 'content/seo-pages.json');
const pages = JSON.parse(await fs.readFile(contentPath, 'utf8'));
function update(value) {
  if (Array.isArray(value)) return value.map(update);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, update(v)]));
  if (typeof value === 'string' && /Undercover|monthly memberships start at \$99/i.test(value)) return summary;
  if (typeof value === 'string' && value.includes('Monthly memberships from $99')) return 'Monthly memberships for 1 or 2 vehicles — from $99/month, plus a $199 initial clean per vehicle';
  return value;
}
await fs.writeFile(contentPath, JSON.stringify(update(pages), null, 2).replace(/[^\x00-\x7f]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')) + '\n');
const llmsPath = path.join(root, 'llms.txt');
let llms = await fs.readFile(llmsPath, 'utf8');
llms = llms.replace(/^- Monthly car-care memberships:.*$/m, `- Monthly car-care memberships: ${summary}`)
  .replace(/^- Every membership starts.*$/m, '- Initial deep clean: separate $199 per vehicle ($398 for two), before monthly membership care.')
  .replace(/^- Member perks:.*$/m, '- Start a membership by booking each vehicle’s initial clean: https://www.sneakycleantn.com/#membership');
await fs.writeFile(llmsPath, llms);
console.log('Updated membership cards, FAQ, location-page content, and llms.txt from approved terms.');
