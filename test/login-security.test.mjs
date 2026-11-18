import assert from 'node:assert/strict';
import { test } from 'node:test';

// Imports the source (node 24 strips the types), so this runs without a build.
const { awaitAuthorizationCode, browserCommand, login } = await import(new URL('../src/auth.ts', import.meta.url).href);

const AUTHORIZE = 'https://mcp.getmattered.com/authorize?response_type=code&client_id=abc&state=xyz';

test('Windows opens the sign-in URL whole, with no shell to split it at &', () => {
  const { command, args } = browserCommand(AUTHORIZE, 'win32');
  assert.notEqual(command.toLowerCase(), 'cmd');
  assert.equal(args.at(-1), AUTHORIZE);
  assert.deepEqual(browserCommand(AUTHORIZE, 'darwin'), { command: 'open', args: [AUTHORIZE] });
  assert.deepEqual(browserCommand(AUTHORIZE, 'linux'), { command: 'xdg-open', args: [AUTHORIZE] });
});

test('only a web page is opened, never a file or an app link', () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'smb://host/share']) {
    assert.equal(browserCommand(url, 'darwin'), null, url);
    assert.equal(browserCommand(url, 'win32'), null, url);
  }
});

/** The code promise once the listener is up, and a URL on its port. */
function listening(state, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const code = awaitAuthorizationCode(state, {
      port: 0,
      timeoutMs,
      onListening: port => resolve({ code, url: path => `http://127.0.0.1:${port}${path}` }),
    });
    code.catch(() => undefined);
  });
}

test('a callback with another state is refused and the sign-in keeps waiting for the real one', async () => {
  const { code, url } = await listening('real-state');
  const forged = await fetch(url('/callback?code=evil&state=guess&error_description=x'));
  assert.equal(forged.status, 400);
  const settled = await Promise.race([code.then(() => 'settled', () => 'settled'), new Promise(resolve => setTimeout(() => resolve('waiting'), 100))]);
  assert.equal(settled, 'waiting');
  const real = await fetch(url('/callback?code=good&state=real-state'));
  assert.equal(real.status, 200);
  assert.equal(await code, 'good');
});

test('an error from the sign-in page reaches the terminal without control characters', async () => {
  const { code, url } = await listening('s1');
  await fetch(url(`/callback?state=s1&error_description=${encodeURIComponent('denied\u001B]0;pwned\u0007\nnext')}`));
  const error = await code.then(() => null, failure => failure);
  assert.ok(error instanceof Error);
  assert.doesNotMatch(error.message, /[\u0000-\u001F\u007F]/);
  assert.match(error.message, /denied/);
});

test('the sign-in times out and frees the port', async () => {
  const { code } = await listening('s2', 50);
  await assert.rejects(code, /timed out/);
});

test('sign-in refuses an endpoint that is not https, unless it is this computer', async () => {
  await assert.rejects(login('http://mcp.example.com/mcp', () => {}), /must use https/);
  await assert.rejects(login('ftp://mcp.example.com/mcp', () => {}), /must use https/);
  // Port 9 on this computer: the guard lets it through, and the registration request then fails.
  const local = await login('http://127.0.0.1:9/mcp', () => {}).then(() => null, error => error);
  assert.ok(local instanceof Error);
  assert.doesNotMatch(local.message, /must use https/);
});
