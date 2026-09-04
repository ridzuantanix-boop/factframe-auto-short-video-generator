import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function harness(offline = false) {
  const events = {}; const cached = []; const removed = []; let skipped = 0;
  const offlinePage = new Response('offline');
  vm.runInNewContext(source, {
    URL, Response,
    self: { location: { origin: 'https://pawarna.test' }, addEventListener: (name, fn) => { events[name] = fn; }, clients: { claim: async () => {} }, skipWaiting: () => skipped++ },
    caches: { open: async () => ({ addAll: async paths => cached.push(...paths) }), keys: async () => ['pawarna-offline-v0', 'pawarna-offline-v1', 'unrelated'], delete: async key => removed.push(key), match: async path => path === '/offline.html' ? offlinePage : undefined },
    fetch: async () => { if (offline) throw new Error('offline'); return new Response('network'); },
  });
  return { events, cached, removed, skipped: () => skipped };
}
test('only public offline assets are precached; updates require explicit activation', async () => {
  const h = harness(); let task;
  h.events.install({ waitUntil: p => { task = p; } }); await task;
  assert.equal(h.cached.length, 5);
  assert.ok(h.cached.every(p => p === '/offline.html' || p.startsWith('/icons/')));
  assert.equal(h.skipped(), 0);
  h.events.activate({ waitUntil: p => { task = p; } }); await task;
  assert.deepEqual(h.removed, ['pawarna-offline-v0', 'pawarna-offline-v1']);
  h.events.message({ data: { type: 'ACTIVATE_UPDATE' } }); assert.equal(h.skipped(), 1);
});
test('paid POST, private API/media and cross-origin requests are not intercepted', () => {
  const h = harness();
  for (const [method, path] of [['POST', '/api/generate'], ['GET', '/api/factory'], ['GET', '/api/factory/jobs/one/media'], ['GET', 'https://external.test/image.jpg']]) {
    let intercepted = false;
    h.events.fetch({ request: { method, url: new URL(path, 'https://pawarna.test').href, mode: 'cors' }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
test('navigation uses network online and a static fallback offline', async () => {
  for (const offline of [false, true]) {
    const h = harness(offline); let response;
    h.events.fetch({ request: { method: 'GET', url: 'https://pawarna.test/', mode: 'navigate' }, respondWith: p => { response = p; } });
    assert.equal(await (await response).text(), offline ? 'offline' : 'network');
  }
});
