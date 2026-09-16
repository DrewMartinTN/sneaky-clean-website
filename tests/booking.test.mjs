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
  removeAttribute() {}
  addEventListener(name, fn) { this.handlers[name] = fn; }
  querySelector() { return this.part ||= new Element(); }
  querySelectorAll() { return this.children; }
  contains() { return false; }
  focus() {}
}
function frontend(fetch, protocol = 'https:', memberships = false) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element(['date', 'tier', 'service'].includes(id) ? 'SELECT' : 'DIV')); return elements.get(id); };
  const body = new Element();
  const context = vm.createContext({ Date: FixedDate, Intl, AbortSignal, setTimeout, clearTimeout, fetch, HTMLElement: Element,
    window: { dispatchEvent() {} }, CustomEvent: class { constructor(name) { this.type = name; } },
    location: { protocol, hash: '', pathname: '/', search: '' }, history: { replaceState() {} },
    document: { getElementById: get, createElement: tag => new Element(tag.toUpperCase()), body, activeElement: body },
  });
  if (memberships) {
    vm.runInContext(fs.readFileSync(new URL('../assets/js/membership-data.js', import.meta.url), 'utf8')
      .replace('window.SneakyCleanMemberships', 'globalThis.SneakyCleanMemberships'), context);
  }
  // Split at the initialization block (not the identical statement inside closeBooking).
  const full = fs.readFileSync(new URL('../assets/js/booking.js', import.meta.url), 'utf8');
  vm.runInContext(full.slice(0, full.lastIndexOf('\nmodal.setAttribute("aria-hidden", "true");')) + '\nglobalThis.api = { openBooking, loadSlots, initNextOpen, businessMidnight, populateDates, checkReady, state, openByVariation, bookingNotes, updateMembershipFields, submitBooking };', context);
  return { ...context.api, get };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('all six membership choices keep monthly pricing separate from per-vehicle initial appointments', async () => {
  const app = frontend(async () => reply({ slots: [] }), 'https:', true);
  for (const [key, prices] of [['undercover', [99, 179]], ['special-agent', [149, 269]], ['black-ops', [199, 359]]]) {
    for (const count of [1, 2]) {
      app.state.membershipPlan = key;
      app.state.membershipVehicles = String(count);
      app.openBooking('membership');
      await flush();
      assert.ok(app.get('membership-summary').textContent.includes(`$${prices[count - 1]}/month`));
      assert.match(app.get('membership-summary').textContent, /This appointment is \$199 for vehicle 1/);
      assert.equal(app.get('membership-vehicle-wrap').hidden, count === 1);
      assert.equal(app.get('membership-schedule-wrap').hidden, key !== 'black-ops');
      assert.ok(app.get('tier').options.every(option => option.textContent.includes('$199 initial clean')));
    }
  }
});

test('membership request captures Black Ops choice and vehicle identity without enrolling or charging', async () => {
  const writes = [];
  let complete;
  const app = frontend(async (url, options) => {
    if (url.endsWith('/availability')) return reply({ slots: ['2026-09-09T17:00:00Z'] });
    assert.ok(url.endsWith('/book'), 'Only an appointment request may be written');
    writes.push(JSON.parse(options.body));
    return new Promise(resolve => { complete = resolve; });
  }, 'https:', true);
  app.state.membershipPlan = 'black-ops';
  app.state.membershipVehicles = '2';
  app.state.membershipVehicle = '2';
  app.state.membershipSchedule = 'monthly-deep-clean';
  app.openBooking('membership');
  await flush();
  app.get('name').value = 'Example Customer';
  app.get('phone').value = '6155550100';
  app.get('slots').children[0].handlers.click();
  assert.equal(app.get('submit').disabled, true, 'Vehicle and address are required for an initial clean');
  app.get('notes').value = 'Vehicle 2: 2021 SUV at 123 Example St';
  app.checkReady();
  const first = app.submitBooking();
  await app.submitBooking();
  assert.equal(writes.length, 1, 'Duplicate taps must not create another request');
  assert.match(writes[0].notes, /2 vehicle\(s\), \$359\/month/);
  assert.match(writes[0].notes, /vehicle 2 of 2; \$199 initial clean. Total initial cleans: \$398/);
  assert.match(writes[0].notes, /One monthly deep clean/);
  assert.match(writes[0].notes, /does not activate a subscription/);
  assert.match(writes[0].notes, /2021 SUV/);
  complete(reply({ bookingId: 'mock-membership-initial', status: 'PENDING' }));
  await first;
  assert.match(app.get('message').textContent, /enrollment separately/);
  assert.equal(app.get('submit').disabled, true);
  assert.equal(app.get('message').children[0].textContent, 'Book initial clean for vehicle 1');
  app.get('message').children[0].handlers.click();
  assert.equal(app.state.membershipVehicle, '1');
  assert.equal(app.get('notes').value, '');
});

test('HTTP failures and missing booking IDs never show a membership success', async () => {
  for (const response of [new Response('{}', { status: 500 }), reply({})]) {
    const app = frontend(async url => url.endsWith('/availability') ? reply({ slots: ['2026-09-09T17:00:00Z'] }) : response, 'https:', true);
    app.openBooking('membership'); await flush();
    app.get('name').value = 'Example Customer'; app.get('phone').value = '6155550100'; app.get('notes').value = 'SUV at 123 Example St';
    app.get('slots').children[0].handlers.click();
    await app.submitBooking();
    assert.equal(app.get('message').className, 'message error');
    assert.equal(app.get('notes').value, 'SUV at 123 Example St');
    assert.equal(app.get('submit').disabled, false);
  }
});

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
