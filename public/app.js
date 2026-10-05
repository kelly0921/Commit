const config = await fetch('/api/config').then(response => response.json());
const configLabel = document.querySelector('#configuration');
configLabel.textContent = config.configured ? 'SANDBOX ONLY — ready for Sandbox buyer approval.' : 'Sandbox credentials missing. Copy .env.example to .env, fill the two credentials, and restart npm run dev.';
let records = [];
const panels = [];
async function api(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spike-csrf': config.csrfToken }, body: JSON.stringify(data ?? {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${result.error}${result.debugId ? ` (PayPal debug ID: ${result.debugId})` : ''}`);
  return result.payment;
}
async function reload() {
  records = (await fetch('/api/payments').then(response => response.json())).payments;
  for (const panel of panels) panel.update();
  const history = document.querySelector('#history'); history.replaceChildren();
  for (const record of [...records].reverse()) {
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = `${record.flowType} — ${record.state} — ${record.paypalOrderId ?? 'order not created'}`;
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify(record, null, 2);
    details.append(summary, pre); history.append(details);
  }
}
document.querySelector('#reload').addEventListener('click', () => reload().catch(error => { configLabel.textContent = error.message; }));

function addPanel(flowType, heading, action) {
  const storageKey = `commit-spike:${flowType}`;
  let clientKey = localStorage.getItem(storageKey);
  // Reuse the latest record after storage is cleared; a new test requires an explicit click.
  clientKey ??= records.filter(record => record.flowType === flowType).at(-1)?.clientKey ?? crypto.randomUUID();
  localStorage.setItem(storageKey, clientKey);
  let busy = false;
  const section = document.createElement('section');
  const title = document.createElement('h2'); title.textContent = heading;
  const amount = document.createElement('p'); amount.textContent = 'Authorize $10.00 USD';
  const buttonHost = document.createElement('div'); buttonHost.className = 'paypal-button';
  const state = document.createElement('pre');
  const message = document.createElement('p'); message.className = 'message'; message.setAttribute('role', 'status');
  const actionButton = document.createElement('button'); actionButton.textContent = action === 'void' ? 'Void Authorization' : 'Capture Authorization';
  const authorizeButton = document.createElement('button'); authorizeButton.textContent = 'Retry server authorization';
  const verifyButton = document.createElement('button'); verifyButton.textContent = 'Retrieve / Verify PayPal state';
  const newButton = document.createElement('button'); newButton.textContent = 'Start a separate $10 test';
  section.append(title, amount, buttonHost, state, message, actionButton, authorizeButton, verifyButton, newButton);
  document.querySelector('#flows').append(section);
  const current = () => records.find(record => record.clientKey === clientKey);
  function update() {
    const record = current();
    state.textContent = record ? [
      `Local state: ${record.state}`, `Order: ${record.paypalOrderId ?? '—'} (${record.orderStatus ?? '—'})`,
      `Authorization: ${record.paypalAuthorizationId ?? '—'} (${record.authorizationStatus ?? '—'})`,
      `Capture: ${record.paypalCaptureId ?? '—'} (${record.captureStatus ?? '—'})`,
      `Authorized amount: ${record.amount} ${record.currency}`, `Captured amount: ${record.capturedAmount ?? '—'}`,
      `Expires: ${record.authorizationExpiresAt ?? '—'}`, `Last verified: ${record.verifiedAt ?? '—'}`,
      `Pending operation: ${record.pendingOperation ?? '—'}`, `Last error: ${record.lastError?.code ?? '—'}`,
    ].join('\n') : 'No order created yet.';
    actionButton.disabled = busy || !config.configured || !record || record.state !== 'AUTHORIZED' ||
      (action === 'capture' ? record.pendingOperation === 'void' : Boolean(record.paypalCaptureId) || record.pendingOperation === 'capture');
    authorizeButton.disabled = busy || !record?.paypalOrderId || Boolean(record.paypalAuthorizationId);
    verifyButton.disabled = busy || !record?.paypalOrderId;
    newButton.disabled = busy || Boolean(record && !['VOIDED', 'CAPTURED'].includes(record.state));
    buttonHost.hidden = Boolean(record?.paypalAuthorizationId);
    buttonHost.style.pointerEvents = busy ? 'none' : '';
    if (record?.state === 'VOIDED' && !record.paypalCaptureId) { message.className = 'message success'; message.textContent = 'VOID TEST PASS — authorization verified VOIDED; no capture exists in this order.'; }
    if (record?.state === 'CAPTURED') { message.className = 'message success'; message.textContent = 'CAPTURE TEST PASS — capture retrieved with status COMPLETED.'; }
  }
  async function run(work) {
    if (busy) return; busy = true; message.className = 'message'; message.textContent = 'Waiting for server / PayPal confirmation…'; update();
    try { await work(); await reload(); }
    catch (error) { await reload().catch(() => undefined); message.className = 'message error'; message.textContent = error.message; }
    finally { busy = false; update(); }
  }
  actionButton.addEventListener('click', () => run(() => api(`/api/payments/${current().id}/${action}`)));
  authorizeButton.addEventListener('click', () => run(() => api(`/api/payments/${current().id}/authorize`, { orderId: current().paypalOrderId })));
  verifyButton.addEventListener('click', () => run(() => api(`/api/payments/${current().id}/verify`)));
  newButton.addEventListener('click', () => { if (newButton.disabled) return; clientKey = crypto.randomUUID(); localStorage.setItem(storageKey, clientKey); message.textContent = ''; update(); });
  if (config.configured) {
    paypal.Buttons({
      fundingSource: paypal.FUNDING.PAYPAL,
      style: { label: 'paypal', layout: 'vertical' },
      createOrder: async () => {
        if (busy) throw new Error('Operation in progress');
        busy = true; update();
        try { const payment = await api('/api/payments', { flowType, clientKey }); await reload(); return payment.paypalOrderId; }
        finally { busy = false; update(); }
      },
      onApprove: data => run(() => api(`/api/payments/${current().id}/authorize`, { orderId: data.orderID })),
      onCancel: () => { message.className = 'message'; message.textContent = 'Approval cancelled. No automatic capture occurs.'; },
      onError: () => { message.className = 'message error'; message.textContent = 'PayPal approval or server operation failed. Inspect the persisted record and use Retrieve / Verify or Retry server authorization.'; },
    }).render(buttonHost).catch(() => { message.textContent = 'PayPal button could not load. Check Sandbox credentials and network access.'; });
  }
  panels.push({ update }); update();
}
await reload();
if (config.configured) {
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const query = new URLSearchParams({ 'client-id': config.clientId, currency: 'USD', intent: 'authorize', components: 'buttons' });
      script.src = `https://www.paypal.com/sdk/js?${query}`; script.onload = resolve; script.onerror = reject; document.head.append(script);
    });
  } catch { configLabel.textContent = 'PayPal JavaScript SDK failed to load. Check the network and Sandbox client ID.'; config.configured = false; }
}
addPanel('VOID_TEST', 'AUTHORIZE → VOID', 'void');
addPanel('CAPTURE_TEST', 'AUTHORIZE → CAPTURE', 'capture');
