// Read-only context lookup. No PayPal credentials or application data are sent.
import { writeFile, mkdir } from 'node:fs/promises';
const endpoint = 'https://chatbotapi.apimatic.io/mcp/plugins';
let session;
let nextId = 1;
async function rpc(method, params, notification = false) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream',
      'X-Apimatic-Mcp-Client': 'Codex',
      ...(session ? { 'Mcp-Session-Id': session, 'MCP-Protocol-Version': '2025-03-26' } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: nextId++ }), method, params }),
    signal: AbortSignal.timeout(45000),
  });
  session = response.headers.get('mcp-session-id') || session;
  const body = await response.text();
  if (!response.ok) throw new Error(`MCP ${method}: HTTP ${response.status}; ${body.slice(0, 500)}`);
  if (!body.trim()) return {};
  const message = body.startsWith('event:') || body.startsWith('data:')
    ? JSON.parse(body.split('\n').filter(line => line.startsWith('data:')).at(-1).slice(5).trim())
    : JSON.parse(body);
  if (message.error) throw new Error(JSON.stringify(message.error));
  return message.result;
}
const evidence = { checkedAt: new Date().toISOString(), endpoint, transport: 'Streamable HTTP JSON-RPC from Codex shell', queries: [] };
try {
  evidence.initialize = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'Codex feasibility spike', version: '0.1.0' } });
  await rpc('notifications/initialized', {}, true);
  evidence.tools = await rpc('tools/list', {});
  const [name, argumentsJson] = process.argv.slice(2);
  if (name) evidence.queries.push({ name, arguments: JSON.parse(argumentsJson), result: await rpc('tools/call', { name, arguments: JSON.parse(argumentsJson) }) });
} catch (error) { evidence.error = error.message; }
await mkdir('docs', { recursive: true });
const file = process.argv[2] ? `docs/apimatic-${process.argv[2]}-evidence.json` : 'docs/apimatic-connection-evidence.json';
await writeFile(file, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
