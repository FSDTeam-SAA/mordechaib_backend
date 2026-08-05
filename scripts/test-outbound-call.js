/**
 * Local test script for the outgoing call feature (mock mode).
 *
 * Usage:
 *   1. Start the backend:  pnpm start:dev
 *   2. Run:                node scripts/test-outbound-call.js
 *
 * Set TWILIO_LIVE_MODE=false (default) so calls are mocked and no real
 * Twilio credits are spent. The full API + database flow still executes.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api/v1';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const email = process.env.LOGIN_EMAIL || (await prompt('Login email: '));
  const password = process.env.LOGIN_PASSWORD || (await prompt('Login password: '));
  const clientPhone = process.env.CLIENT_PHONE || (await prompt('Client phone (E.164): '));
  const agentPhone = process.env.AGENT_PHONE || (await prompt('Agent phone (E.164): '));

  // 1. Login
  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const token = login.data?.accessToken || login.data?.tokens?.accessToken;
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log('[1/4] Login OK');

  // 2. Save Twilio settings (twilio number + agent forwarding number)
  await request('/twilio/settings', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      twilioNumber: '+17373855812',
      forwardingNumber: agentPhone,
      isRecordingEnabled: true,
      status: 'ACTIVE',
    }),
  });
  console.log('[2/4] Twilio settings saved');

  // 3. Initiate outbound call
  const outbound = await request('/calls/outbound', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ clientPhone, agentPhone }),
  });
  console.log('[3/4] Outbound call initiated:', JSON.stringify(outbound, null, 2));

  // 4. List calls to verify persistence
  const calls = await request('/calls', { headers: auth });
  console.log('[4/4] Calls in DB:', JSON.stringify(calls.data?.length ?? calls.data, null, 2));
}

// Minimal prompt polyfill for Node < 22
function prompt(label) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(label, (answer) => { rl.close(); resolve(answer.trim()); }));
}

main().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });