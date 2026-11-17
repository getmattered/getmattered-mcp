import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';

// Imports the source (node 24 strips the types), so this runs without a build.
const { DEFAULT_ENDPOINT, credentialsPath, getAccessToken } = await import(new URL('../src/auth.ts', import.meta.url).href);

const PRODUCTION_ISSUER = 'https://mcp.getmattered.com';
const POSIX = process.platform !== 'win32';

// Stands in for any server: a token endpoint that records every request it gets.
let server;
let origin;
let requests = [];

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url, body, authorization: req.headers.authorization });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'refreshed-token', refresh_token: 'refresh-2', expires_in: 3600 }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'getmattered-credentials-'));
  delete process.env.GETMATTERED_TOKEN;
  requests = [];
});

function store(credentials) {
  const path = credentialsPath();
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(credentials));
  return path;
}

const fresh = { access_token: 'stored-token', refresh_token: 'refresh-1', expires_at: Date.now() + 3_600_000, client_id: 'client-1' };
const expired = { ...fresh, expires_at: Date.now() - 1000 };

async function tokenFor(endpoint) {
  const lines = [];
  const token = await getAccessToken(endpoint, line => lines.push(line));
  return { token, said: lines.join('\n') };
}

test('a token minted by production is never sent to another server', async () => {
  store({ ...fresh, issuer: PRODUCTION_ISSUER });
  const { token, said } = await tokenFor(`${origin}/mcp`);
  assert.equal(token, undefined);
  assert.match(said, /not sent/);
  assert.match(said, /getmattered-mcp login/);
});

test('a stored file without an issuer counts as production, so another server gets nothing', async () => {
  store(fresh);
  assert.equal((await tokenFor(`${origin}/mcp`)).token, undefined);
  assert.equal((await tokenFor(DEFAULT_ENDPOINT)).token, 'stored-token');
});

test('a token near expiry is not refreshed against another server', async () => {
  store(expired);
  assert.equal((await tokenFor(`${origin}/mcp`)).token, undefined);
  store({ ...expired, issuer: PRODUCTION_ISSUER });
  assert.equal((await tokenFor(`${origin}/mcp`)).token, undefined);
  assert.deepEqual(requests, []);
});

test('scheme, host and port must all match the issuer', async () => {
  const { port } = server.address();
  store({ ...fresh, issuer: origin });
  assert.equal((await tokenFor(`${origin}/mcp`)).token, 'stored-token');
  assert.equal((await tokenFor(`http://127.0.0.1:${port + 1}/mcp`)).token, undefined);
  assert.equal((await tokenFor(`https://127.0.0.1:${port}/mcp`)).token, undefined);
  assert.equal((await tokenFor(`http://localhost:${port}/mcp`)).token, undefined);
});

test('a refresh goes to the issuer and saves the new token', async () => {
  store({ ...expired, issuer: origin });
  assert.equal((await tokenFor(`${origin}/mcp`)).token, 'refreshed-token');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/oauth/token');
  const saved = JSON.parse(readFileSync(credentialsPath(), 'utf8'));
  assert.equal(saved.access_token, 'refreshed-token');
  assert.equal(saved.issuer, origin);
});

test('the saved file is mode 600 from the start, and no temp file is left', { skip: !POSIX }, async () => {
  const previous = process.umask(0);
  try {
    const path = store({ ...expired, issuer: origin });
    assert.equal(statSync(path).mode & 0o777, 0o666);
    assert.equal((await tokenFor(`${origin}/mcp`)).token, 'refreshed-token');
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(join(path, '..')), ['credentials.json']);
  } finally {
    process.umask(previous);
  }
});

test('a symlink planted at the credentials path is replaced, never written through', { skip: !POSIX }, async () => {
  const path = credentialsPath();
  mkdirSync(join(path, '..'), { recursive: true });
  const elsewhere = join(process.env.XDG_CONFIG_HOME, 'elsewhere.json');
  const planted = JSON.stringify({ ...expired, issuer: origin });
  writeFileSync(elsewhere, planted);
  symlinkSync(elsewhere, path);

  assert.equal((await tokenFor(`${origin}/mcp`)).token, 'refreshed-token');
  assert.equal(lstatSync(path).isSymbolicLink(), false);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).access_token, 'refreshed-token');
  assert.equal(readFileSync(elsewhere, 'utf8'), planted);
});
