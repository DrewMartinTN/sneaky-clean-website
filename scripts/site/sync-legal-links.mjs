import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sitemap = await fs.readFile(path.join(root, 'sitemap.xml'), 'utf8');
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const links = '<nav aria-label="Legal"><a href="/terms/">Terms of Service</a> · <a href="/privacy/">Privacy Policy</a></nav>';
const bookingNotice = '<p class="booking-legal">Booking requests are subject to our <a href="/terms/" target="_blank" rel="noopener">Terms of Service</a>. See our <a href="/privacy/" target="_blank" rel="noopener">Privacy Policy</a> for how we use your details. We may text about this request; this is not a marketing signup. Message and data rates may apply. Reply STOP to opt out or HELP for help.</p>';
for (const route of new Set([...routes, '/estimate/', '/pop-up/'])) {
  const file = path.join(root, route, 'index.html');
  let html = await fs.readFile(file, 'utf8');
  html = html.replace(/<nav aria-label="Legal">[\s\S]*?<\/nav>/g, '');
  if (!html.includes('</footer>')) throw new Error(`Missing footer: ${route}`);
  html = html.includes('site-footer__inner')
    ? html.replace(/<\/div>\s*<\/footer>/, `${links}</div></footer>`)
    : html.replace('</footer>', `${links}</footer>`);
  html = html.replace(/<p class="booking-legal">[\s\S]*?<\/p>/g, '');
  html = html.replace(/(<button class="submit" id="submit"[^>]*>)/, `${bookingNotice}$1`);
  await fs.writeFile(file, html);
  console.log(`Linked legal pages: ${route}`);
}
