import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../assets/js/fleet.js', import.meta.url), 'utf8');
const validFields = {
  name: 'Test Fleet Contact', email: 'fleet@example.com', phone: '615-555-0100',
  address: '123 Test Street, Murfreesboro, TN 37130',
  message: '12 work vans\n\nWeekly exterior cleaning.\nInclude cab interiors monthly.',
  _honey: '', _subject: 'New Fleet/Commercial Inquiry — Sneaky Clean',
};

function setup(fetch, values = {}) {
  const fields = Object.fromEntries(Object.entries({ ...validFields, ...values })
    .map(([name, value]) => [name, { value, focus() { this.focused = true; } }]));
  const status = { textContent: '', classList: { toggle() {} } };
  const success = { hidden: true, focus() { this.focused = true; } };
  const submit = { disabled: false };
  const form = {
    hidden: false, action: 'https://formsubmit.co/0887b6b01adb60894d676cd69fe2b7af', elements: fields,
    querySelector: selector => selector === '[data-form-status]' ? status : submit,
    querySelectorAll: () => ['name', 'email', 'phone', 'address', 'message'].map(key => fields[key]),
    reportValidity: () => ['name', 'email', 'phone', 'address', 'message'].every(key => !!fields[key].value),
    setAttribute() {}, removeAttribute() {},
    addEventListener(type, callback) { this.onSubmit = callback; },
  };
  class FormDataDouble {
    get(key) { return fields[key]?.value; }
    entries() { return Object.entries(fields).map(([key, field]) => [key, field.value]); }
  }
  const events = [];
  vm.runInNewContext(code, {
    document: { querySelector: selector => selector === '[data-fleet-form]' ? form : success },
    window: { gtag: (...args) => events.push(args) },
    FormData: FormDataDouble, URL, AbortController, setTimeout, clearTimeout, fetch,
  });
  return { form, fields, status, success, submit, events, send: () => form.onSubmit({ preventDefault() {} }) };
}

test('forwards every contact field and preserves the full multiline scope and reply address', async () => {
  let sent;
  const app = setup(async (url, options) => {
    sent = { url, data: JSON.parse(options.body) };
    return Response.json({ success: 'true' });
  });
  await app.send();
  assert.equal(sent.url, 'https://formsubmit.co/ajax/0887b6b01adb60894d676cd69fe2b7af');
  for (const key of ['name', 'email', 'phone', 'address', 'message']) assert.equal(sent.data[key], validFields[key]);
  assert.equal(sent.data._replyto, validFields.email);
  assert.equal(app.form.hidden, true);
  assert.equal(app.success.hidden, false);
  assert.equal(app.success.focused, true);
  assert.equal(app.events[0][1], 'fleet_commercial_inquiry_submitted');
  assert.equal(app.events[0].length, 2, 'Analytics must not include customer contact details');
});

test('HTTP 200 activation/rejection, HTTP failure and network failure preserve answers without success', async () => {
  for (const fetch of [
    async () => Response.json({ success: 'false', message: 'Activation required' }),
    async () => Response.json({ success: false }),
    async () => Response.json({ success: 'true' }, { status: 503 }),
    async () => { throw new Error('Offline'); },
  ]) {
    const app = setup(fetch);
    await app.send();
    assert.equal(app.form.hidden, false);
    assert.equal(app.success.hidden, true);
    assert.equal(app.submit.disabled, false);
    assert.equal(app.fields.message.value, validFields.message);
    assert.match(app.status.textContent, /couldn't confirm/);
    assert.match(app.status.textContent, /sneakycleantn@gmail.com/);
    assert.equal(app.events.length, 0);
  }
});

test('duplicate clicks send only one request while an inquiry is pending', async () => {
  let resolve, calls = 0;
  const app = setup(() => { calls++; return new Promise(done => { resolve = done; }); });
  const first = app.send();
  await app.send();
  assert.equal(calls, 1);
  assert.equal(app.submit.disabled, true);
  resolve(Response.json({ success: true }));
  await first;
  assert.equal(app.success.hidden, false);
});

test('empty answers, incomplete phones and honeypot entries do not send inquiries', async () => {
  for (const values of [{ name: '   ' }, { message: ' \n ' }, { phone: '1234' }, { _honey: 'spam' }]) {
    const app = setup(() => { assert.fail('No request expected'); }, values);
    await app.send();
    assert.equal(app.success.hidden, true);
    assert.equal(app.submit.disabled, false);
  }
});
