import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createHarness } from '../src/server.js';

test('HTTP harness serves one page, reports missing credentials, and rejects untrusted mutations', async t => {
  const config = { port: 0, clientId: 'sandbox-public-id', configured: false };
  const server = createHarness(config);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); config.port = address.port;
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${address.port}`;
  assert.match(await fetch(base).then(response => response.text()), /Commit — PayPal Sandbox Spike/);
  const publicConfig = await fetch(`${base}/api/config`).then(response => response.json());
  assert.equal(publicConfig.clientId, 'sandbox-public-id'); assert.equal(publicConfig.configured, false);
  assert.equal('clientSecret' in publicConfig, false);
  assert.equal((await fetch(`${base}/api/payments`, { method: 'POST' })).status, 403);
  assert.equal((await fetch(`${base}/api/payments`, { method: 'POST', headers: { origin: 'https://attacker.example', 'x-spike-csrf': publicConfig.csrfToken } })).status, 403);
  assert.equal((await fetch(`${base}/api/payments`, { method: 'POST', headers: { origin: base, 'x-spike-csrf': publicConfig.csrfToken } })).status, 503);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/data/payments.json`)).status, 404);
  // Node fetch normalizes Host; a raw HTTP request exercises the DNS-rebinding guard.
  const hostileHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(`${base}/api/config`, { headers: { host: `evil.example:${address.port}` } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(hostileHostStatus, 403);
});
