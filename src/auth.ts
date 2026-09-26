/**
 * Sign-in for the CLI and the stdio bridge.
 *
 * `aiapplyd-mcp login` runs the same OAuth 2.1 flow a desktop MCP client runs:
 * dynamic client registration, PKCE (S256), the browser consent page, and a
 * loopback callback on 127.0.0.1. The token and its refresh token are stored in
 * ~/.config/aiapplyd/credentials.json (mode 600). Every later command reads that
 * file and refreshes the access token when it is close to expiry, so a bot or a
 * cron job keeps working without a person in the loop.
 *
 * AIAPPLYD_TOKEN, when set, wins over the stored file.
 */
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const CALLBACK_PORT = 33418;
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Credentials = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  client_id: string;
  issuer: string;
};

export function credentialsPath() {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config');
  return join(base, 'aiapplyd', 'credentials.json');
}

function readCredentials(): Credentials | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Credentials;
  } catch {
    return null;
  }
}

function writeCredentials(credentials: Credentials) {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(credentials, null, 2));
  chmodSync(path, 0o600);
}

export function logout() {
  const path = credentialsPath();
  if (existsSync(path)) rmSync(path);
  return path;
}

/** The OAuth issuer is the MCP endpoint's origin (https://mcp.aiapplyd.com). */
export function issuerFor(endpoint: string) {
  return new URL(endpoint).origin;
}

const b64url = (buffer: Buffer) =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function openInBrowser(url: string) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // The URL is also printed, so a headless machine can open it elsewhere.
  }
}

async function tokenRequest(issuer: string, params: Record<string, string>) {
  const response = await fetch(`${issuer}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(`token request failed (${response.status}): ${String(body.error_description ?? body.error ?? 'no token')}`);
  }
  return body as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function login(endpoint: string, log: (line: string) => void) {
  const issuer = issuerFor(endpoint);

  const registration = await fetch(`${issuer}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'AI Applyd CLI',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  const client = (await registration.json().catch(() => ({}))) as { client_id?: string };
  if (!client.client_id) throw new Error(`client registration failed (${registration.status})`);

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(12));
  const authorize = new URL(`${issuer}/authorize`);
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    scope: 'openid email profile offline_access',
    resource: endpoint,
  }).toString();

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', REDIRECT_URI);
      if (url.pathname !== '/callback') {
        response.writeHead(404).end();
        return;
      }
      const returnedCode = url.searchParams.get('code');
      const ok = url.searchParams.get('state') === state && Boolean(returnedCode);
      response.writeHead(ok ? 200 : 400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(ok ? 'AI Applyd is connected. You can close this tab.' : 'Sign-in failed. Run aiapplyd-mcp login again.');
      server.close();
      if (ok && returnedCode) resolve(returnedCode);
      else reject(new Error(url.searchParams.get('error_description') ?? 'sign-in was not completed'));
    });
    server.on('error', reject);
    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      log('Opening your browser to sign in. If it does not open, visit:');
      log(authorize.toString());
      openInBrowser(authorize.toString());
    });
    setTimeout(() => {
      server.close();
      reject(new Error('timed out waiting for the browser sign-in'));
    }, LOGIN_TIMEOUT_MS).unref();
  });

  const token = await tokenRequest(issuer, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: client.client_id,
    code_verifier: verifier,
    resource: endpoint,
  });
  writeCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    client_id: client.client_id,
    issuer,
  });
  return credentialsPath();
}

/**
 * The bearer token to send, or undefined when the user has not signed in. A
 * stored token near expiry is refreshed first; a refresh that fails leaves the
 * caller unauthenticated, and the server then answers with its sign-in message.
 */
export async function getAccessToken(endpoint: string, log: (line: string) => void) {
  const fromEnv = process.env.AIAPPLYD_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const stored = readCredentials();
  if (!stored) return undefined;
  const fresh = !stored.expires_at || stored.expires_at - Date.now() > REFRESH_MARGIN_MS;
  if (fresh || !stored.refresh_token) return stored.access_token;

  try {
    const token = await tokenRequest(stored.issuer || issuerFor(endpoint), {
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
      client_id: stored.client_id,
      resource: endpoint,
    });
    writeCredentials({
      ...stored,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? stored.refresh_token,
      expires_at: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    });
    return token.access_token;
  } catch (error) {
    log(`could not refresh the stored sign-in (${String(error)}). Run: aiapplyd-mcp login`);
    return undefined;
  }
}
