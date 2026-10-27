import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;
const EXIT_BUDGET_MS = 2000;
const SLOW_REPLY_MS = 300;

// A stand-in for the hosted server: answers over JSON, and holds the standalone
// SSE stream open the way the real one does, which is what kept the bridge alive.
let upstream;
let endpoint;
const openStreams = new Set();

before(async () => {
  upstream = createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': 'test-session' });
      res.write(': open\n\n');
      openStreams.add(res);
      res.on('close', () => openStreams.delete(res));
      return;
    }
    if (req.method === 'DELETE') {
      res.writeHead(200).end();
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const message = JSON.parse(body);
      if (!('id' in message)) {
        res.writeHead(202).end();
        return;
      }
      const result = message.method === 'initialize'
        ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '0' } }
        : { tools: [] };
      const reply = () => {
        res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'test-session' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
      };
      if (message.method === 'tools/list') setTimeout(reply, SLOW_REPLY_MS);
      else reply();
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${upstream.address().port}/mcp`;
});

after(() => {
  for (const res of openStreams) res.destroy();
  upstream.close();
});

function startBridge() {
  const child = spawn(process.execPath, [BIN], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GETMATTERED_MCP_URL: endpoint, GETMATTERED_TOKEN: 'test-token', XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'gm-cfg-')) },
  });
  let stdout = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
  const waitFor = async (text, ms = 5000) => {
    const deadline = Date.now() + ms;
    while (!stdout.includes(text)) {
      assert.ok(Date.now() < deadline, `bridge never wrote ${text}; stdout: ${stdout}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  return { child, exited, send, waitFor, stdout: () => stdout };
}

async function startInitialized() {
  const bridge = startBridge();
  bridge.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
  await bridge.waitFor('"id":1');
  bridge.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const deadline = Date.now() + 5000;
  while (openStreams.size === 0) {
    assert.ok(Date.now() < deadline, 'bridge never opened the SSE stream');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return bridge;
}

async function exitsWithin(bridge, ms) {
  const timedOut = Symbol('timed out');
  const outcome = await Promise.race([bridge.exited, new Promise(resolve => setTimeout(() => resolve(timedOut), ms))]);
  if (outcome === timedOut) bridge.child.kill('SIGKILL');
  assert.notEqual(outcome, timedOut, `bridge still running ${ms} ms after its host let go`);
  return outcome;
}

test('exits when the host closes stdin', async () => {
  const bridge = await startInitialized();
  bridge.child.stdin.end();
  const { code } = await exitsWithin(bridge, EXIT_BUDGET_MS);
  assert.equal(code, 0);
});

test('answers a request in flight before exiting on stdin close', async () => {
  const bridge = await startInitialized();
  bridge.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  bridge.child.stdin.end();
  const { code } = await exitsWithin(bridge, EXIT_BUDGET_MS);
  assert.equal(code, 0);
  assert.match(bridge.stdout(), /"id":2,"result":\{"tools":\[\]\}/);
});

for (const signal of ['SIGHUP', 'SIGTERM']) {
  test(`exits on ${signal}`, async () => {
    const bridge = await startInitialized();
    bridge.child.kill(signal);
    const { code } = await exitsWithin(bridge, EXIT_BUDGET_MS);
    assert.equal(code, 0);
  });
}
