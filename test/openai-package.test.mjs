import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

import { buildOpenAiPackage, crc32, imageProblems, manifestProblems, mcpProblems, packageFileName, packageProblems, PLUGIN_DIR, portalProblems, skillProblems } from '../scripts/openai-package.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Reads a ZIP's central directory back into [path, bytes]. */
function unzip(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4B, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = [];
  for (let i = 0; i < count; i += 1) {
    assert.equal(zip.readUInt32LE(at), 0x02014B50);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    const bytes = method === 8 ? inflateRawSync(raw) : raw;
    assert.equal(crc32(bytes), crc, `crc of ${name}`);
    files.push([name, bytes]);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

test('the package is the Codex layout of the plugin, byte for byte, and nothing else', () => {
  const out = mkdtempSync(join(tmpdir(), 'openai-package-'));
  try {
    const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
    const path = buildOpenAiPackage(ROOT, out);
    assert.equal(path, join(out, packageFileName(version)));
    const files = unzip(readFileSync(path)).filter(([name]) => !name.endsWith('/'));
    const names = files.map(([name]) => name);
    assert.deepEqual(names.filter(name => !name.startsWith('skills/')), ['.codex-plugin/plugin.json', '.mcp.json', 'assets/icon.png', 'assets/logo.png']);
    assert.equal(names.filter(name => /^skills\/[^/]+\/SKILL\.md$/.test(name)).length, 14);
    for (const [name, bytes] of files) assert.deepEqual(bytes, readFileSync(join(ROOT, PLUGIN_DIR, name)), name);
    assert.equal(names.includes('plugin.json') || names.includes('mcp.json'), false);
  } finally {
    rmSync(out, { force: true, recursive: true });
  }
});

test('the same tree always gives the same bytes', () => {
  const out = mkdtempSync(join(tmpdir(), 'openai-package-'));
  try {
    const first = readFileSync(buildOpenAiPackage(ROOT, join(out, 'a')));
    const second = readFileSync(buildOpenAiPackage(ROOT, join(out, 'b')));
    assert.deepEqual(first, second);
  } finally {
    rmSync(out, { force: true, recursive: true });
  }
});

test('a wrong version, draft or stale release notes, a missing icon or a root manifest stop the build', () => {
  const paths = ['.codex-plugin/plugin.json', '.mcp.json', 'assets/logo.png', 'skills/a/SKILL.md'];
  const manifest = (notes, version = '1.15.1') => ({
    extensions: { 'com.openai': { onboardingSkill: './skills/a/SKILL.md', publication: { release_notes: notes } } },
    interface: { composerIcon: './assets/logo.png', logo: './assets/logo.png' },
    version,
  });
  assert.deepEqual(packageProblems(paths, manifest('1.15.1: Notes.'), '1.15.1'), []);
  assert.match(packageProblems(paths, manifest('1.15.1: Notes.', '1.15.0'), '1.15.1').join(), /is 1.15.0/);
  assert.match(packageProblems(paths, manifest('1.15.0: Old.'), '1.15.1').join(), /must start with "1.15.1: "/);
  assert.match(packageProblems(paths, manifest('1.15.1: DRAFT: write this release line'), '1.15.1').join(), /still a draft/);
  assert.match(packageProblems(paths.filter(path => !path.startsWith('assets/')), manifest('1.15.1: Notes.'), '1.15.1').join(), /logo.png is named/);
  assert.match(packageProblems([...paths, 'plugin.json'], manifest('1.15.1: Notes.'), '1.15.1').join(), /server change/);
});

// developers.openai.com/plugins/deploy/submission-errors, read 14 Nov 2026.
test('the committed plugin passes every rule OpenAI\'s upload checks name', () => {
  assert.deepEqual(portalProblems(join(ROOT, PLUGIN_DIR)), []);
});

test('the listing limits OpenAI refuses stop the build', () => {
  const good = JSON.parse(readFileSync(join(ROOT, PLUGIN_DIR, '.codex-plugin/plugin.json'), 'utf8'));
  const withUi = ui => ({ ...good, interface: { ...good.interface, ...ui } });
  const review = test_cases => ({ ...good, extensions: { ...good.extensions, 'com.openai': { ...good.extensions['com.openai'], review: { ...good.extensions['com.openai'].review, test_cases } } } });
  assert.deepEqual(manifestProblems(good), []);
  assert.match(manifestProblems(withUi({ displayName: 'GetMattered, the job search assistant' })).join(), /displayName is 37 characters, the limit is 30/);
  assert.match(manifestProblems(withUi({ shortDescription: 'Find jobs and auto-apply\non two lines' })).join(), /shortDescription is missing or not one line/);
  assert.match(manifestProblems(withUi({ category: 'Jobs' })).join(), /not an OpenAI category/);
  assert.match(manifestProblems(withUi({ defaultPrompt: ['a', 'b', 'c', 'd'] })).join(), /more than 3 prompts/);
  assert.match(manifestProblems(withUi({ defaultPrompt: ['Show my jobs', 'show  my jobs'] })).join(), /repeats a prompt/);
  assert.match(manifestProblems(withUi({ defaultPrompt: ['Ask @getmattered for jobs'] })).join(), /@mention/);
  assert.match(manifestProblems(withUi({ supportURL: 'http://getmattered.com/support' })).join(), /supportURL must be an HTTPS URL/);
  assert.match(manifestProblems(withUi({ brandColor: '#FFE4B5' })).join(), /below 2:1 contrast against white/);
  assert.match(manifestProblems(withUi({ capabilities: Array.from({ length: 21 }, (_, i) => `Thing ${i}`) })).join(), /1 to 20 entries/);
  assert.match(manifestProblems({ ...good, description: 'x'.repeat(1025) }).join(), /description is 1025 characters, the limit is 1024/);
  assert.match(manifestProblems(review({ negative: good.extensions['com.openai'].review.test_cases.negative, positive: good.extensions['com.openai'].review.test_cases.positive.slice(1) })).join(), /exactly 5 positive test cases, has 4/);
  assert.match(manifestProblems({ ...good, extensions: { ...good.extensions, 'com.openai': { ...good.extensions['com.openai'], hooks: './hooks/hooks.json' } } }).join(), /hooks cannot be in a public package/);
  assert.match(manifestProblems({ ...good, mcpServers: './mcp.json' }).join(), /mcpServers must be/);
  assert.match(manifestProblems(withUi({ logo: undefined })).join(), /interface.logo is required/);
  assert.match(manifestProblems(withUi({ composerIcon: '' })).join(), /interface.composerIcon is required/);
});

test('one remote HTTPS server with no headers or secret is the only MCP configuration a public package takes', () => {
  const server = { type: 'http', url: 'https://mcp.getmattered.com/mcp' };
  assert.deepEqual(mcpProblems({ mcpServers: { getmattered: server } }), []);
  assert.match(mcpProblems({ mcpServers: {} }).join(), /exactly one server, has 0/);
  assert.match(mcpProblems({ mcpServers: { getmattered: { ...server, headers: { Authorization: 'Bearer x' } } } }).join(), /headers/);
  assert.match(mcpProblems({ mcpServers: { getmattered: { ...server, url: 'http://localhost:8787/mcp' } } }).join(), /public HTTPS URL/);
  assert.match(mcpProblems({ mcpServers: { getmattered: { ...server, extensions: { 'com.openai': { auth: { client: { client_secret: 'x' } } } } } } }).join(), /client secret/);
});

test('a skill OpenAI would refuse stops the build', () => {
  const skill = (name, description = 'Does one thing.', body = '\n# Steps\n\n1. Do it.\n') => `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
  assert.deepEqual(skillProblems([['a', skill('a')]]), []);
  assert.match(skillProblems([]).join(), /no skills/);
  assert.match(skillProblems([['a', '# no front matter']]).join(), /no front matter/);
  assert.match(skillProblems([['a', skill('a', 'x'.repeat(1025))]]).join(), /limit is 1024/);
  assert.match(skillProblems([['a', skill('a', 'Fine.', '\n')]]).join(), /no instructions/);
  assert.match(skillProblems([['a', skill('same')], ['b', skill('same')]]).join(), /used twice/);
  assert.match(skillProblems([['a', skill('x'.repeat(60))]]).join(), /over 64 characters/);
  assert.match(skillProblems([['.hidden', skill('h')]]).join(), /hidden/);
  assert.match(skillProblems([['a', skill('a')]], ['README.md']).join(), /not a skill folder/);
});

test('a branding image that is not a square PNG of 48 to 4096 pixels stops the build', () => {
  const png = (width, height) => {
    const bytes = Buffer.alloc(33);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return bytes;
  };
  assert.deepEqual(imageProblems('./assets/logo.png', png(400, 400)), []);
  assert.match(imageProblems('./assets/logo.png', png(400, 200)).join(), /not square/);
  assert.match(imageProblems('./assets/logo.png', png(32, 32)).join(), /48 to 4096/);
  assert.match(imageProblems('./assets/logo.png', Buffer.from('not a png')).join(), /not a PNG/);
  assert.deepEqual(imageProblems('./assets/logo.png', readFileSync(join(ROOT, PLUGIN_DIR, 'assets/logo.png'))), []);
});
