import assert from 'node:assert/strict';
import { test } from 'node:test';

// Built by `npm run build` (npm test builds first), like bridge-exit.test.mjs.
const { createLoginGate } = await import(new URL('../dist/login-gate.js', import.meta.url).href);

const quiet = () => {};

function gateWith(overrides = {}) {
  const calls = { login: 0, tokens: [] };
  const gate = createLoginGate({
    enabled: true,
    log: quiet,
    login: async () => {
      calls.login += 1;
      return 'token-1';
    },
    onToken: token => calls.tokens.push(token),
    signedIn: false,
    waitMs: 1000,
    ...overrides,
  });
  return { calls, gate };
}

test('initialize and listing never wait for the sign-in', () => {
  const { calls, gate } = gateWith();
  for (const [id, method] of ['initialize', 'tools/list', 'prompts/list', 'resources/list', 'ping'].entries()) assert.equal(gate.hold(method, id), null);
  assert.equal(calls.login, 0);
});

test('the first tool call without a sign-in opens it once and waits for the token', async () => {
  const { calls, gate } = gateWith();
  const first = gate.hold('tools/call', 1);
  const second = gate.hold('tools/call', 2);
  assert.ok(first && second);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(calls.login, 1);
  assert.deepEqual(calls.tokens, ['token-1']);
  assert.equal(gate.signedIn, true);
  assert.equal(gate.hold('tools/call', 3), null);
});

test('nothing waits when the variable is off or a sign-in is stored', () => {
  assert.equal(gateWith({ enabled: false }).gate.hold('tools/call', 1), null);
  assert.equal(gateWith({ signedIn: true }).gate.hold('tools/call', 1), null);
});

test('a sign-in that never finishes holds the call only until the wait ends', async () => {
  const { gate } = gateWith({ login: () => new Promise(() => {}), waitMs: 20 });
  const started = Date.now();
  assert.equal(await gate.hold('tools/call', 1), true);
  assert.ok(Date.now() - started < 1000);
  assert.equal(gate.signedIn, false);
});

test('once the wait from the sign-in start is over, calls go out at once while it stays open', async () => {
  const { calls, gate } = gateWith({ login: () => new Promise(() => { calls.login += 1; }), waitMs: 20 });
  await gate.hold('tools/call', 1);
  assert.equal(gate.hold('tools/call', 2), null);
  assert.equal(calls.login, 1);
});

test('a held call the host cancels never goes out', async () => {
  const { gate } = gateWith({ login: () => new Promise(() => {}), waitMs: 20 });
  const held = gate.hold('tools/call', 'apply-1');
  const kept = gate.hold('tools/call', 'apply-2');
  assert.equal(gate.cancel('apply-1'), true);
  assert.equal(gate.cancel('apply-1'), false);
  assert.equal(gate.cancel('never-held'), false);
  assert.deepEqual(await Promise.all([held, kept]), [false, true]);
  assert.equal(gate.cancel('apply-2'), false);
});

test('a failed sign-in lets the next tool call try again', async () => {
  let attempts = 0;
  const { gate } = gateWith({
    login: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('closed the tab');
      return 'token-2';
    },
  });
  await gate.hold('tools/call', 1);
  assert.equal(gate.signedIn, false);
  await gate.hold('tools/call', 2);
  assert.equal(attempts, 2);
  assert.equal(gate.signedIn, true);
});
