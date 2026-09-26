#!/usr/bin/env node
/**
 * AI Applyd MCP bridge.
 *
 * AI Applyd runs as a hosted remote MCP server over Streamable HTTP at
 * https://mcp.aiapplyd.com/mcp. Modern clients should connect to that URL
 * directly. This bridge exists for clients that can only speak stdio, and for
 * sandboxes that introspect a server by starting it as a local process.
 *
 * It is a message relay, not a reimplementation: every JSON-RPC message is
 * forwarded verbatim in both directions, so the bridge stays correct across
 * protocol revisions and never has to know what a tool does.
 *
 * It is also a small CLI, so a script or a chat bot can drive the whole job
 * search without an MCP client:
 *
 *   aiapplyd-mcp login                          sign in once in the browser
 *   aiapplyd-mcp tools                          list the tools
 *   aiapplyd-mcp call <tool> '<json args>'      run one tool, print its result
 *   aiapplyd-mcp logout                         forget the stored sign-in
 *   aiapplyd-mcp                                run as a stdio MCP server
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import { getAccessToken, login, logout } from './auth.js';

const DEFAULT_ENDPOINT = 'https://mcp.aiapplyd.com/mcp';

const endpoint = process.env.AIAPPLYD_MCP_URL?.trim() || DEFAULT_ENDPOINT;

function log(message: string) {
  // stdout carries the protocol. Diagnostics go to stderr only.
  process.stderr.write(`[aiapplyd-mcp] ${message}\n`);
}

async function authHeaders(userAgent: string) {
  const headers: Record<string, string> = { 'user-agent': userAgent };
  const token = await getAccessToken(endpoint, log);
  if (token) headers.authorization = `Bearer ${token}`;
  return { headers, signedIn: Boolean(token) };
}

async function connectClient() {
  const { headers, signedIn } = await authHeaders('aiapplyd-mcp-cli');
  if (!signedIn) {
    log('not signed in. Run: aiapplyd-mcp login');
    process.exit(2);
  }
  const client = new Client({ name: 'aiapplyd-mcp-cli', version: '1.8.1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers } }));
  return client;
}

async function listTools() {
  const client = await connectClient();
  const { tools } = await client.listTools();
  for (const tool of tools) {
    const firstSentence = (tool.description ?? '').split(/(?<=\.)\s/)[0];
    process.stdout.write(`${tool.name}\t${firstSentence}\n`);
  }
  await client.close();
}

async function callTool(name: string | undefined, rawArgs: string | undefined) {
  if (!name) {
    log("usage: aiapplyd-mcp call <tool> '<json args>'");
    process.exit(64);
  }
  let args: Record<string, unknown> = {};
  if (rawArgs) {
    try {
      args = JSON.parse(rawArgs) as Record<string, unknown>;
    } catch {
      log('the arguments must be one JSON object, for example {"limit": 5}');
      process.exit(64);
    }
  }
  const client = await connectClient();
  const result = await client.callTool({ name, arguments: args });
  // Structured output when the tool has it (machine-readable for bots),
  // otherwise the tool's text.
  if (result.structuredContent) {
    process.stdout.write(`${JSON.stringify(result.structuredContent, null, 2)}\n`);
  } else {
    const content = Array.isArray(result.content) ? result.content : [];
    for (const part of content) {
      if (part && typeof part === 'object' && 'text' in part) process.stdout.write(`${String(part.text)}\n`);
    }
  }
  await client.close();
  if (result.isError) process.exit(1);
}

async function bridge() {
  const { headers, signedIn } = await authHeaders('aiapplyd-mcp-bridge');
  const remote = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers },
  });
  const local = new StdioServerTransport();

  // Streamable HTTP hands out an `Mcp-Session-Id` on the initialize response, and
  // every later request must carry it. A client that pipelines initialize and
  // tools/list in the same tick would otherwise send both before the id exists,
  // and the server rejects the second one. So messages queue in order until a
  // session is established, then flow concurrently.
  let handshake: Promise<unknown> = Promise.resolve();
  const sendUpstream = (message: JSONRPCMessage): Promise<void> => {
    if (remote.sessionId) return remote.send(message);
    const next = handshake.then(
      () => remote.send(message),
      () => remote.send(message),
    );
    handshake = next.catch(() => undefined);
    return next;
  };

  remote.onmessage = (message: JSONRPCMessage) => {
    void local.send(message).catch((error: unknown) => log(`stdout write failed: ${String(error)}`));
  };
  local.onmessage = (message: JSONRPCMessage) => {
    void sendUpstream(message).catch((error: unknown) => log(`upstream send failed: ${String(error)}`));
  };

  remote.onerror = (error) => log(`upstream error: ${String(error)}`);
  local.onerror = (error) => log(`stdio error: ${String(error)}`);

  remote.onclose = () => {
    void local.close().finally(() => process.exit(0));
  };
  local.onclose = () => {
    void remote.close().finally(() => process.exit(0));
  };

  await remote.start();
  await local.start();

  log(`bridging stdio to ${endpoint}${signedIn ? ' signed in' : ' unauthenticated (run: aiapplyd-mcp login)'}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'login': {
      const path = await login(endpoint, log);
      log(`signed in. Credentials saved to ${path}`);
      return;
    }
    case 'logout':
      log(`signed out. Removed ${logout()}`);
      return;
    case 'tools':
      return listTools();
    case 'call':
      return callTool(rest[0], rest[1]);
    case '--version':
    case '-v':
      process.stdout.write('1.8.1\n');
      return;
    case '--help':
    case '-h':
    case 'help':
      process.stdout.write([
        'aiapplyd-mcp: AI Applyd from your terminal or any MCP client.',
        '',
        '  aiapplyd-mcp login                       sign in once in the browser',
        '  aiapplyd-mcp tools                       list the tools',
        "  aiapplyd-mcp call <tool> '<json args>'   run one tool, print its result",
        '  aiapplyd-mcp logout                      forget the stored sign-in',
        '  aiapplyd-mcp                             run as a stdio MCP server',
        '',
        "Example: aiapplyd-mcp call aiapplyd_get_matches '{\"limit\": 5}'",
        '',
      ].join('\n'));
      return;
    case undefined:
    case 'serve':
      return bridge();
    default:
      log(`unknown command "${command}". Run: aiapplyd-mcp --help`);
      process.exit(64);
  }
}

main().catch((error: unknown) => {
  log(`failed to start: ${String(error)}`);
  process.exit(1);
});
