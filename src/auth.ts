/**
 * Sign-in for the CLI and the stdio bridge.
 *
 * `getmattered-mcp login` runs the same OAuth 2.1 flow a desktop MCP client runs:
 * dynamic client registration, PKCE (S256), the browser consent page, and a
 * loopback callback on 127.0.0.1. The token and its refresh token are stored in
 * ~/.config/getmattered/credentials.json (mode 600). Every later command reads that
 * file and refreshes the access token when it is close to expiry, so a bot or a
 * cron job keeps working without a person in the loop.
 *
 * GETMATTERED_TOKEN, when set, wins over the stored file.
 */
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_ENDPOINT = 'https://mcp.getmattered.com/mcp';
const CALLBACK_PORT = 33418;
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Credentials = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  client_id: string;
  // Missing in files written by older versions, all minted by DEFAULT_ENDPOINT.
  issuer?: string;
};

export function credentialsPath() {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config');
  return join(base, 'getmattered', 'credentials.json');
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

/**
 * The file is created at mode 600 in the same folder, then renamed over the old
 * one, so no reader ever sees the token in a wider file, and a symlink planted at
 * the path is replaced, not followed. Windows ignores the modes.
 */
function writeCredentials(credentials: Credentials) {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try {
    try {
      writeFileSync(fd, JSON.stringify(credentials, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

export function logout() {
  const path = credentialsPath();
  if (existsSync(path)) rmSync(path);
  return path;
}

/** The OAuth issuer is the MCP endpoint's origin (https://mcp.getmattered.com). */
export function issuerFor(endpoint: string) {
  return new URL(endpoint).origin;
}

/** The origin that minted the stored token, or null when the stored value is not a URL. */
function storedIssuer(stored: Credentials) {
  try {
    return issuerFor(stored.issuer || DEFAULT_ENDPOINT);
  } catch {
    return null;
  }
}

const b64url = (buffer: Buffer) =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Text from the network, made safe for a terminal: no control characters, at most 300 of them. */
const printable = (text: string) => text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').slice(0, 300);

/**
 * The program and arguments that open `url` in the default browser, or null when
 * `url` is not a web page. No shell reads the URL: `cmd /c start` would cut it at
 * the first & and run the rest as commands.
 */
export function browserCommand(url: string, platform: NodeJS.Platform = process.platform) {
  const { protocol } = new URL(url);
  if (protocol !== 'https:' && protocol !== 'http:') return null;
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
  return { command: 'xdg-open', args: [url] };
}

function openInBrowser(url: string) {
  const opener = browserCommand(url);
  if (!opener) return;
  try {
    spawn(opener.command, opener.args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // The URL is also printed, so a headless machine can open it elsewhere.
  }
}

/** Sign-in sends the code and its verifier, so only over https, or plain http on this computer. */
function assertSecureEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) return;
  throw new Error(`refusing to sign in at ${url.protocol}//${url.host}: the endpoint must use https`);
}

type CallbackOptions = { port: number; timeoutMs: number; onListening: (port: number) => void };

/**
 * The code from the browser's redirect to 127.0.0.1 that carries `state`. A request
 * with any other state is refused and the wait goes on, so no other page or local
 * process can end or steer the sign-in.
 */
export function awaitAuthorizationCode(state: string, { port, timeoutMs, onListening }: CallbackOptions) {
  return new Promise<string>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const server = createServer();
    const finish = (error: Error | null, code?: string) => {
      clearTimeout(timer);
      server.close();
      if (code) resolve(code);
      else reject(error ?? new Error('sign-in was not completed'));
    };
    server.on('request', (request: IncomingMessage, response: ServerResponse) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method !== 'GET' || url.pathname !== '/callback') {
        response.writeHead(404).end();
        return;
      }
      const plain = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };
      if (url.searchParams.get('state') !== state) {
        response.writeHead(400, plain).end('This sign-in link was not opened by this terminal.');
        return;
      }
      const code = url.searchParams.get('code');
      response.writeHead(code ? 200 : 400, plain);
      response.end(code ? 'GetMattered is connected. You can close this tab.' : 'Sign-in failed. Run getmattered-mcp login again.');
      const reason = url.searchParams.get('error_description') ?? url.searchParams.get('error');
      finish(new Error(reason ? `sign-in failed: ${printable(reason)}` : 'sign-in was not completed'), code ?? undefined);
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      onListening(typeof address === 'object' && address ? address.port : port);
    });
    timer = setTimeout(() => finish(new Error('timed out waiting for the browser sign-in')), timeoutMs);
    timer.unref();
  });
}

async function tokenRequest(issuer: string, params: Record<string, string>) {
  const response = await fetch(`${issuer}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(`token request failed (${response.status}): ${printable(String(body.error_description ?? body.error ?? 'no token'))}`);
  }
  return body as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function login(endpoint: string, log: (line: string) => void) {
  assertSecureEndpoint(endpoint);
  const issuer = issuerFor(endpoint);

  const registration = await fetch(`${issuer}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'GetMattered CLI',
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

  const code = await awaitAuthorizationCode(state, {
    port: CALLBACK_PORT,
    timeoutMs: LOGIN_TIMEOUT_MS,
    onListening: () => {
      log('Opening your browser to sign in. If it does not open, visit:');
      log(authorize.toString());
      openInBrowser(authorize.toString());
    },
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
  const fromEnv = process.env.GETMATTERED_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const stored = readCredentials();
  if (!stored) return undefined;
  // The token goes only to the server that minted it: same scheme, host and port.
  const issuer = storedIssuer(stored);
  const target = issuerFor(endpoint);
  if (issuer !== target) {
    log(
      `the stored sign-in belongs to ${issuer ?? 'an unknown server'}, not ${target}, so it was not sent. `
      + `To use ${target}, run: GETMATTERED_MCP_URL=${endpoint} getmattered-mcp login`,
    );
    return undefined;
  }
  const fresh = !stored.expires_at || stored.expires_at - Date.now() > REFRESH_MARGIN_MS;
  if (fresh || !stored.refresh_token) return stored.access_token;

  try {
    const token = await tokenRequest(issuer, {
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
    log(`could not refresh the stored sign-in (${String(error)}). Run: getmattered-mcp login`);
    return undefined;
  }
}
