import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

import { buildOpenAiPackage, crc32, packageFileName, packageProblems, PLUGIN_DIR } from '../scripts/openai-package.mjs';

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
