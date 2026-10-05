import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PaymentStore } from './store.js';
import { PaymentService } from './payments.js';
import { PayPalAdapter } from './paypal.js';
import { SpikeError, type FlowType } from './model.js';

export type HarnessConfig = { port: number; clientId: string; configured: boolean };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new SpikeError('JSON_REQUIRED', 415);
  let content = '';
  for await (const chunk of request) { content += chunk.toString(); if (Buffer.byteLength(content) > 4096) throw new SpikeError('BODY_TOO_LARGE', 413); }
  try {
    const data: unknown = JSON.parse(content);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { throw new SpikeError('INVALID_JSON', 400); }
}

export function createHarness(config: HarnessConfig, service?: PaymentService) {
  const csrfToken = randomBytes(32).toString('hex');
  function json(response: ServerResponse, status: number, data: unknown) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(data));
  }
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const host = request.headers.host;
      if (host !== `localhost:${config.port}` && host !== `127.0.0.1:${config.port}`) throw new SpikeError('LOCAL_HOST_REQUIRED', 403);
      const url = new URL(request.url ?? '/', `http://${host}`);
      if (request.method === 'GET') {
        if (url.pathname === '/api/config') return json(response, 200, { environment: 'sandbox', configured: config.configured,
          clientId: config.clientId, csrfToken });
        if (url.pathname === '/api/payments') return json(response, 200, { payments: service ? await service.list() : [] });
        const assets: Record<string, [string, string]> = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
        const asset = assets[url.pathname];
        if (asset) { response.writeHead(200, { 'content-type': `${asset[1]}; charset=utf-8` }); response.end(await readFile(resolve('public', asset[0]))); return; }
        throw new SpikeError('NOT_FOUND', 404);
      }
      if (request.method !== 'POST') throw new SpikeError('METHOD_NOT_ALLOWED', 405);
      if (request.headers.origin !== `http://${host}` || request.headers['x-spike-csrf'] !== csrfToken) throw new SpikeError('INVALID_ORIGIN_OR_CSRF', 403);
      if (!service) throw new SpikeError('SANDBOX_CREDENTIALS_REQUIRED', 503);
      const data = await body(request);
      if (url.pathname === '/api/payments') {
        if (data.flowType !== 'VOID_TEST' && data.flowType !== 'CAPTURE_TEST') throw new SpikeError('INVALID_FLOW', 400);
        if (typeof data.clientKey !== 'string' || !uuid.test(data.clientKey)) throw new SpikeError('UUID_CLIENT_KEY_REQUIRED', 400);
        return json(response, 200, { payment: await service.create(data.flowType as FlowType, data.clientKey) });
      }
      const match = /^\/api\/payments\/([^/]+)\/(authorize|capture|void|verify)$/.exec(url.pathname);
      if (!match || !uuid.test(match[1]!)) throw new SpikeError('NOT_FOUND', 404);
      const id = match[1]!;
      let payment;
      if (match[2] === 'authorize') {
        if (typeof data.orderId !== 'string' || !/^[A-Z0-9]{1,36}$/.test(data.orderId)) throw new SpikeError('ORDER_ID_REQUIRED', 400);
        payment = await service.authorize(id, data.orderId);
      } else if (match[2] === 'capture') payment = await service.capture(id);
      else if (match[2] === 'void') payment = await service.void(id);
      else payment = await service.verify(id);
      return json(response, 200, { payment });
    } catch (error) {
      const known = error instanceof SpikeError ? error : new SpikeError('INTERNAL_ERROR', 500);
      json(response, known.httpStatus, { error: known.code, debugId: known.debugId });
    }
  });
}

export async function main() {
  if ((process.env.PAYPAL_ENVIRONMENT ?? 'sandbox') !== 'sandbox') throw new Error('This harness only permits PAYPAL_ENVIRONMENT=sandbox.');
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 through 65535.');
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim() ?? '';
  if (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() && process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID.trim() !== clientId)
    throw new Error('NEXT_PUBLIC_PAYPAL_CLIENT_ID must match PAYPAL_CLIENT_ID.');
  const configured = Boolean(clientId && clientSecret);
  const store = new PaymentStore(resolve('data'));
  await store.init();
  const service = configured ? new PaymentService(store, new PayPalAdapter(clientId, clientSecret)) : undefined;
  const server = createHarness({ port, clientId, configured }, service);
  server.listen(port, '127.0.0.1', () => {
    console.info(`Commit PayPal Sandbox spike: http://localhost:${port}`);
    console.info(configured ? 'Sandbox credentials configured.' : 'Add Sandbox credentials to .env and restart.');
  });
  server.on('error', async (error: NodeJS.ErrnoException) => { console.error(`Server could not listen (${error.code ?? 'UNKNOWN'}). Check PORT.`); await store.close(); process.exitCode = 1; });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return; stopping = true;
    server.close(async () => { await store.close(); process.exit(0); });
  };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Startup failed. Check .env, PORT, and data/spike.lock.'); process.exitCode = 1; });
}
