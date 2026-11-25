// Antigravity reads mcp_config.json and ignores .mcp.json and mcp.json, and its Marketplace asks for
// a README.md, so without both the plugin holds skills and no connector.
// https://antigravity.google/docs/build-plugins (read 25 Nov 2026)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const plugin = path => fileURLToPath(new URL(`../plugins/getmattered/${path}`, import.meta.url));
const read = path => {
  assert.ok(existsSync(plugin(path)), `plugins/getmattered/${path} is missing`);
  return readFileSync(plugin(path), 'utf8');
};

test('the Antigravity connector is the one every other plugin surface names', () => {
  const servers = path => Object.fromEntries(
    Object.entries(JSON.parse(read(path)).mcpServers).map(([name, server]) => [name, server.url]),
  );
  assert.deepEqual(servers('mcp_config.json'), servers('.mcp.json'));
});

test('a remote Antigravity server has only a url', () => {
  const config = JSON.parse(read('mcp_config.json'));
  assert.deepEqual(Object.keys(config), ['mcpServers']);
  for (const [name, server] of Object.entries(config.mcpServers)) assert.deepEqual(Object.keys(server), ['url'], name);
});

test('the plugin has what the Antigravity Marketplace asks for', () => {
  const manifest = JSON.parse(read('.antigravity-plugin/plugin.json'));
  for (const field of ['name', 'displayName', 'description', 'version', 'logo', 'suggestedPrompts', 'author']) {
    assert.ok(manifest[field]?.length > 0 || Object.keys(manifest[field] ?? {}).length > 0, `${field} is empty`);
  }
  assert.ok(existsSync(plugin(manifest.logo)), 'the logo is not bundled');
  assert.match(read('.antigravity-plugin/README.md'), /^# GetMattered\n/);
});
