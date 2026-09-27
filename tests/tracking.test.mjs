import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const ADS = 'AW-17685937498';
const GA4_CONFIG = "gtag('config', 'G-8ZBE3LNX5E');";
const ADS_CONFIG = `gtag('config', '${ADS}');`;

function link(href, text, extra = {}) {
  const listeners = [];
  return {
    href, text, extra, textContent: text,
    getAttribute: (name) => (name === 'href' ? href : null),
    addEventListener: (type, fn) => type === 'click' && listeners.push(fn),
    click: () => listeners.forEach((fn) => fn()),
  };
}

function matches(el, selector) {
  const prefix = selector.match(/^a\[href\^="(.+)"\]$/);
  if (prefix) return el.href.startsWith(prefix[1]);
  if (selector === 'a[data-quote-form]') return Boolean(el.extra.quoteForm);
  throw new Error(`Unexpected selector ${selector}`);
}

function page(links, { gtag = true } = {}) {
  const calls = [];
  const windowListeners = {};
  const window = {
    addEventListener: (type, fn) => (windowListeners[type] ||= []).push(fn),
    dispatch: (type) => (windowListeners[type] || []).forEach((fn) => fn()),
  };
  if (gtag) window.gtag = (...args) => calls.push(args);
  const document = { querySelectorAll: (selector) => links.filter((el) => matches(el, selector)) };
  vm.runInContext(read('assets/js/main.js'), vm.createContext({ window, document }));
  return { calls, window };
}

const conversions = (calls) => calls.filter(([, name]) => name === 'conversion');
// Objects created inside the vm context have their own prototypes; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

test('a phone link click sends the Website - Call click conversion with nothing but send_to', () => {
  const call = link('tel:+17178709439', ' Call (717) 870-9439 ');
  const { calls } = page([call]);
  call.click();
  assert.deepEqual(plain(calls), [
    ['event', 'click_call_now', { link_text: 'Call (717) 870-9439', phone_number: '+17178709439' }],
    ['event', 'conversion', { send_to: `${ADS}/jQ_fCKq9voUdENr6p_FB` }],
  ]);
});

test('a confirmed booking request sends the Website - Booking request conversion', () => {
  const { calls, window } = page([]);
  window.dispatch('sneakyclean:booking-submitted');
  assert.deepEqual(plain(calls), [
    ['event', 'booking_request_submitted', {}],
    ['event', 'conversion', { send_to: `${ADS}/jaaTCKS9voUdENr6p_FB` }],
  ]);
});

test('text, booking and quote button clicks stay GA4-only', () => {
  const links = [
    link('sms:+17178709439', 'Text us'),
    link('#sc-book-mobile', 'Book now'),
    link('/estimate/', 'Get a quote', { quoteForm: true }),
  ];
  const { calls } = page(links);
  links.forEach((el) => el.click());
  assert.deepEqual(calls.map(([, name]) => name), ['click_text_quote', 'click_booking_cta', 'click_quote_cta']);
  assert.equal(conversions(calls).length, 0);
});

test('tracking is a no-op when the Google tag is missing', () => {
  const call = link('tel:+17178709439', 'Call');
  const { window } = page([call], { gtag: false });
  assert.doesNotThrow(() => { call.click(); window.dispatch('sneakyclean:booking-submitted'); });
});

function sitePages(dir = '.') {
  const skip = new Set(['.git', '.claude', 'node_modules', 'native-app', 'growth', 'tests']);
  return fs.readdirSync(new URL(dir + '/', root), { withFileTypes: true }).flatMap((entry) => {
    const file = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return skip.has(entry.name) ? [] : sitePages(file);
    return entry.name.endsWith('.html') ? [file] : [];
  });
}

test('every page that loads main.js configures the Google Ads tag after GA4', () => {
  const tracked = sitePages().filter((file) => /<script src="[^"]*assets\/js\/main\.js[^"]*"/.test(read(file)));
  assert.ok(tracked.length >= 11, `expected the homepage and service pages, found ${tracked.join(', ')}`);
  for (const file of tracked) {
    const html = read(file);
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-8ZBE3LNX5E/, file);
    assert.equal(html.split(GA4_CONFIG).length, 2, `${file} should configure GA4 once`);
    assert.equal(html.split(ADS_CONFIG).length, 2, `${file} should configure Google Ads once`);
    assert.ok(html.indexOf(ADS_CONFIG) > html.indexOf(GA4_CONFIG), `${file} should configure Google Ads after GA4`);
  }
});

test('regenerated SEO pages keep the Google Ads tag', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-pages-'));
  try {
    fs.mkdirSync(path.join(dir, 'content'));
    fs.copyFileSync(new URL('content/seo-pages.json', root), path.join(dir, 'content', 'seo-pages.json'));
    execFileSync(process.execPath, [fileURLToPath(new URL('scripts/site/generate-seo-pages.mjs', root))], { cwd: dir, stdio: 'ignore' });
    const slugs = JSON.parse(read('content/seo-pages.json')).map((p) => p.slug);
    for (const slug of slugs) {
      const html = fs.readFileSync(path.join(dir, slug, 'index.html'), 'utf8');
      assert.ok(html.includes(`    ${GA4_CONFIG}\n    ${ADS_CONFIG}\n`), `${slug} lost the Google Ads tag`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
