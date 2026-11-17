import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

// Imports the source (node 24 strips the types), so this runs without a build.
const { credentialsPath, getAccessToken } = await import(new URL('../src/auth.ts', import.meta.url).href);
const { link } = await import(new URL('../src/link.ts', import.meta.url).href);

const OTHER = 'http://127.0.0.1:9/mcp';
const fresh = { access_token: 'stored-token', expires_at: Date.now() + 3_600_000, client_id: 'client-1' };

beforeEach(() => {
  process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'getmattered-link-'));
  delete process.env.GETMATTERED_TOKEN;
});

function store(credentials) {
  mkdirSync(join(credentialsPath(), '..'), { recursive: true });
  writeFileSync(credentialsPath(), JSON.stringify(credentials));
}

function deps(overrides = {}) {
  const calls = { logins: [], reads: [] };
  return {
    calls,
    deps: {
      getAccessToken,
      login: async (endpoint) => {
        calls.logins.push(endpoint);
        store({ ...fresh, access_token: 'new-token', issuer: new URL(endpoint).origin });
        return credentialsPath();
      },
      readAccount: async (endpoint, token) => {
        calls.reads.push({ endpoint, token });
        return { id: 'user-1', email: 'sarah@example.com' };
      },
      log: () => {},
      ...overrides,
    },
  };
}

test('a stored token from this issuer is reused: no sign-in, and the account is shown', async () => {
  store({ ...fresh, issuer: new URL(OTHER).origin });
  const { calls, deps: d } = deps();
  const result = await link(OTHER, d);
  assert.deepEqual(result, { alreadyLinked: true, account: { id: 'user-1', email: 'sarah@example.com' } });
  assert.deepEqual(calls.logins, []);
  assert.deepEqual(calls.reads, [{ endpoint: OTHER, token: 'stored-token' }]);
});

test('a token from another issuer is never sent: link signs in to this one', async () => {
  store({ ...fresh, issuer: 'https://mcp.getmattered.com' });
  const { calls, deps: d } = deps();
  const result = await link(OTHER, d);
  assert.equal(result.alreadyLinked, false);
  assert.deepEqual(calls.logins, [OTHER]);
  assert.deepEqual(calls.reads, [{ endpoint: OTHER, token: 'new-token' }]);
});

test('no stored sign-in: link signs in once, and a second run reuses it', async () => {
  const { calls, deps: d } = deps();
  assert.equal((await link(OTHER, d)).alreadyLinked, false);
  assert.equal((await link(OTHER, d)).alreadyLinked, true);
  assert.equal(calls.logins.length, 1);
});

test('a stored token the server refuses is replaced by a fresh sign-in', async () => {
  store({ ...fresh, issuer: new URL(OTHER).origin });
  let refused = false;
  const { calls, deps: d } = deps({
    readAccount: async (_endpoint, token) => {
      if (token === 'stored-token') {
        refused = true;
        return null;
      }
      return { id: 'user-1', email: 'sarah@example.com' };
    },
  });
  const result = await link(OTHER, d);
  assert.ok(refused);
  assert.equal(calls.logins.length, 1);
  assert.deepEqual(result, { alreadyLinked: false, account: { id: 'user-1', email: 'sarah@example.com' } });
});

test('a sign-in that yields no token is an error, not a silent success', async () => {
  const { deps: d } = deps({ login: async () => credentialsPath() });
  await assert.rejects(link(OTHER, d), /no sign-in/);
});
