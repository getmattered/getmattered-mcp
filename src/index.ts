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
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

const DEFAULT_ENDPOINT = 'https://mcp.aiapplyd.com/mcp';

const endpoint = process.env.AIAPPLYD_MCP_URL?.trim() || DEFAULT_ENDPOINT;
const token = process.env.AIAPPLYD_TOKEN?.trim();

const headers: Record<string, string> = {
  'user-agent': 'aiapplyd-mcp-bridge',
};
if (token) headers.authorization = `Bearer ${token}`;

function log(message: string) {
  // stdout carries the protocol. Diagnostics go to stderr only.
  process.stderr.write(`[aiapplyd-mcp] ${message}\n`);
}

async function main() {
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

  log(`bridging stdio to ${endpoint}${token ? ' with a bearer token' : ' unauthenticated'}`);
}

main().catch((error: unknown) => {
  log(`failed to start: ${String(error)}`);
  process.exit(1);
});
