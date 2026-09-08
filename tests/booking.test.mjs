import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const NOW = '2026-09-08T18:00:00Z';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return Date.parse(NOW); }
}
const origin = 'https://www.sneakycleantn.com';
const env = { ALLOWED_ORIGINS: origin, SQUARE_LOCATION_ID: 'location', SQUARE_TEAM_MEMBER_ID: 'team' };
const reply = (data) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const request = (path, body) => new Request(`https://booking.test${path}`, {
  method: body ? 'POST' : 'GET', headers: { Origin: origin, 'Content-Type': 'application/json' },
  ...(body && { body: JSON.stringify(body) }),
});
function backend(fetch) {
  const context = vm.createContext({ Date: FixedDate, Intl, Request, Response, URL, URLSearchParams,
    fetch, crypto, caches: { default: { match: async () => undefined, put: async () => {} } } });
  vm.runInContext(fs.readFileSync(new URL('../worker.js', import.meta.url), 'utf8')
    .replace('export default', 'globalThis.worker ='), context);
  return (req) => context.worker.fetch(req, env);
}

test('availability and next opening exclude rush days, weekends and same-day; include Friday', async () => {
  const times = ['2026-09-12', '2026-09-11', '2026-09-10', '2026-09-09', '2026-09-08', '2026-09-13', '2026-09-14'];
  const worker = backend(async (url) => url.endsWith('/availability/search')
    ? reply({ availabilities: times.map(day => ({ start_at: `${day}T17:00:00Z`, appointment_segments: [{ duration_minutes: 120 }] })) })
    : reply({ bookings: [] }));
  const res = await worker(request('/availability', { serviceVariationId: 'service', startAt: `${times[4]}T05:00:00Z`, endAt: '2026-09-15T05:00:00Z' }));
  const data = await res.json();
  assert.deepEqual(data.slots.sort(), ['2026-09-09T17:00:00Z', '2026-09-11T17:00:00Z', '2026-09-14T17:00:00Z']);
  const next = await worker(request('/next-availability'));
  assert.equal((await next.json()).nextSlot, '2026-09-09T17:00:00Z');
  assert.equal(next.headers.get('Access-Control-Allow-Origin'), origin);
});

test('booking rejects Tuesday, Thursday, Saturday and Sunday before contacting Square', async () => {
  const worker = backend(() => { throw new Error('Square must not be contacted'); });
  for (const day of ['2026-09-10', '2026-09-12', '2026-09-13', '2026-09-15']) {
    const res = await worker(request('/book', { serviceVariationId: 'service', startAt: `${day}T17:00:00Z`, customer: { name: 'Test Customer', phone: '6155550100' } }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Monday, Wednesday, and Friday/);
  }
});

test('Friday booking reaches the existing Square booking flow using mocked data only', async () => {
  const writes = [];
  const worker = backend(async (url, options) => {
    if (url.includes('/catalog/object/')) return reply({ object: { version: 1, item_variation_data: { service_duration: 7200000 } } });
    if (url.includes('/bookings?')) return reply({ bookings: [] });
    if (url.endsWith('/customers/search')) return reply({ customers: [{ id: 'mock-customer' }] });
    if (url.endsWith('/bookings')) { writes.push(JSON.parse(options.body)); return reply({ booking: { id: 'mock-booking', status: 'PENDING' } }); }
    throw new Error(`Unexpected request: ${url}`);
  });
  const res = await worker(request('/book', { serviceVariationId: 'service', startAt: '2026-09-11T17:00:00Z', customer: { name: 'Test Customer', phone: '6155550100' } }));
  assert.equal(res.status, 200);
  assert.equal(writes[0].booking.start_at, '2026-09-11T17:00:00Z');
});

// A small DOM double exercises state changes; real layout is checked in the browser.
class Element {
  constructor(tag = 'DIV') { this.tagName = tag; this.children = []; this.value = ''; this.style = {}; this.hidden = false; this.disabled = false; this.textContent = ''; this.handlers = {}; this.classes = new Set(); this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x), contains: x => this.classes.has(x) }; }
  set innerHTML(value) { this.html = value; this.children = []; this.value = ''; }
  get innerHTML() { return this.html || ''; }
  get options() { return this.children; }
  appendChild(child) { this.children.push(child); if (this.tagName === 'SELECT' && this.children.length === 1) this.value = child.value; }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(name, fn) { this.handlers[name] = fn; }
  querySelector() { return this.part ||= new Element(); }
  querySelectorAll() { return this.children; }
  contains() { return false; }
  focus() {}
}
function frontend(fetch, protocol = 'https:') {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element(['date', 'tier', 'service'].includes(id) ? 'SELECT' : 'DIV')); return elements.get(id); };
  const body = new Element();
  const context = vm.createContext({ Date: FixedDate, Intl, AbortSignal, setTimeout, clearTimeout, fetch, HTMLElement: Element,
    location: { protocol, hash: '', pathname: '/', search: '' }, history: { replaceState() {} },
    document: { getElementById: get, createElement: tag => new Element(tag.toUpperCase()), body, activeElement: body },
  });
  // Split at the initialization block (not the identical statement inside closeBooking).
  const full = fs.readFileSync(new URL('../assets/js/booking.js', import.meta.url), 'utf8');
  vm.runInContext(full.slice(0, full.lastIndexOf('\nmodal.setAttribute("aria-hidden", "true");')) + '\nglobalThis.api = { openBooking, loadSlots, initNextOpen, businessMidnight, populateDates, checkReady, state, openByVariation };', context);
  return { ...context.api, get };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('date selector offers future M/W/F dates only and loads immediately', async () => {
  const calls = [];
  const app = frontend(async (url, options) => { calls.push(JSON.parse(options.body)); return reply({ slots: [] }); });
  app.openBooking('reset');
  await flush();
  const dates = app.get('date').options.map(o => o.value);
  assert.ok(dates.length >= 20);
  assert.equal(dates[0], '2026-09-09');
  assert.ok(dates.every(day => [1, 3, 5].includes(new Date(`${day}T12:00:00Z`).getUTCDay())));
  assert.equal(calls[0].startAt, '2026-09-09T05:00:00.000Z');
  assert.equal(calls[0].endAt, '2026-09-10T04:59:59.999Z');
});

test('Tennessee day boundaries work across daylight saving changes', () => {
  const app = frontend(() => { throw new Error('No network expected'); });
  for (const [date, expected] of [['2026-03-08', '06'], ['2026-03-09', '05'], ['2026-11-01', '05'], ['2026-11-02', '06']]) {
    assert.equal(app.businessMidnight(date), `${date}T${expected}:00:00.000Z`);
  }
});

test('late availability responses cannot replace a newer date or service', async () => {
  const pending = [];
  const app = frontend((url, options) => new Promise(resolve => pending.push({ resolve, body: JSON.parse(options.body) })));
  app.openBooking('reset');
  app.get('date').value = '2026-09-11';
  const latest = app.loadSlots();
  pending[1].resolve(reply({ slots: ['2026-09-11T17:00:00Z', '2026-09-12T17:00:00Z'] }));
  await latest;
  assert.equal(app.get('slots').children.length, 1);
  assert.equal(app.get('slots').children[0].textContent, '12:00 PM');
  pending[0].resolve(reply({ slots: ['2026-09-09T15:00:00Z'] }));
  await flush();
  assert.equal(app.get('slots').children[0].textContent, '12:00 PM');
  app.get('slots').children[0].handlers.click();
  app.get('date').value = '';
  await app.loadSlots();
  assert.equal(app.state.slot, null);
  assert.equal(app.get('submit').disabled, true);
});

test('next-opening failure gives a usable fallback and does not invent a date', async () => {
  const app = frontend(async () => { throw new Error('Offline'); });
  await app.initNextOpen();
  assert.equal(app.state.nextOpenDate, null);
  assert.equal(app.get('next-open').children[0].textContent, 'Text us for the next opening');
});

test('local-file preview links to live booking without making blocked API requests', async () => {
  const app = frontend(() => { throw new Error('No network expected'); }, 'file:');
  app.openBooking('reset');
  await app.initNextOpen();
  assert.equal(app.get('date').disabled, true);
  assert.match(app.get('slots').innerHTML, /https:\/\/www.sneakycleantn.com\/#sc-bookvar-AU7PB/);
  assert.equal(app.get('next-open').children[0].textContent, 'See live openings & book online');
});

test('a vehicle-size deep link requests that size on its first availability search', async () => {
  const calls = [];
  const app = frontend(async (url, options) => { calls.push(JSON.parse(options.body)); return reply({ slots: [] }); });
  app.openByVariation('IGLRLIZGH4PVEBWNGCZOAS6M');
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].serviceVariationId, 'IGLRLIZGH4PVEBWNGCZOAS6M');
});

test('late next-opening data updates an untouched date but preserves a customer choice', async () => {
  const app = frontend(async (url) => url.endsWith('/next-availability')
    ? reply({ nextSlot: '2026-09-11T17:00:00Z' }) : reply({ slots: [] }));
  app.openBooking('reset');
  await app.initNextOpen();
  assert.equal(app.get('date').value, '2026-09-11');
  app.get('date').value = '2026-09-14';
  app.get('date').onchange();
  await app.initNextOpen();
  assert.equal(app.get('date').value, '2026-09-14');
});
