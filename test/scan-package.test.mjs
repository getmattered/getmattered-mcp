import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { packedFiles, scanPackage } from '../scripts/scan-package.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/scan-package.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Built at run time, so this file itself carries no secret shape and no listed literal.
const FAKE_SECRET = ['sk', 'live', 'Z9y8X7w6V5u4T3s2R1q0'].join('_');
const OLD_HANDLE = ['ava', 'how', 'fm'].join('');
const OLD_ADDRESS = `${['a', 'v', 'a'].join('')}@${['how', 'fm'].join('.')}`;

/** A throwaway package with `files` written into it. */
function fakePackage(files) {
  const dir = mkdtempSync(join(tmpdir(), 'getmattered-scan-test-'));
  const all = { 'package.json': JSON.stringify({ name: 'scan-fixture', version: '1.0.0', files: ['dist', 'README.md'] }), 'README.md': '# fixture\n', ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const kinds = problems => problems.map(problem => `${problem.path}: ${problem.kind}`).sort();

test('a clean package passes', () => {
  const dir = fakePackage({ 'dist/index.js': 'export const url = "https://mcp.getmattered.com/mcp";\n' });
  assert.deepEqual(scanPackage({ dir, files: packedFiles(dir) }), []);
});

test('a planted secret in a packed file fails the scan, and its hit prints redacted', () => {
  const dir = fakePackage({ 'dist/index.js': `const key = "${FAKE_SECRET}";\n` });
  const problems = scanPackage({ dir, files: packedFiles(dir) });
  assert.deepEqual(kinds(problems), ['dist/index.js: secret-shaped string']);
  assert.ok(!JSON.stringify(problems).includes(FAKE_SECRET));
});

test('old handles, home paths, private repo paths, internal hosts and denylisted names all fail', () => {
  const dir = fakePackage({
    'README.md': `Follow @${OLD_HANDLE} or write to ${OLD_ADDRESS}.\n`,
    'dist/a.js': '// built in /Users/someone/project from apps/api/src/index.ts\n',
    'dist/b.js': 'fetch("https://getmattered-preview.someone.workers.dev/mcp");\n',
    'dist/c.js': 'const owner = "Jane Example";\n',
  });
  const problems = scanPackage({ dir, files: packedFiles(dir), literals: ['Jane Example'] });
  assert.deepEqual(kinds(problems), [
    'README.md: hashed literal',
    'dist/a.js: home folder path',
    'dist/a.js: private repo path',
    'dist/b.js: internal hostname',
    'dist/c.js: denylisted literal',
  ]);
  assert.ok(!JSON.stringify(problems).includes(OLD_HANDLE));
});

test('a packed file that package.json "files" does not list fails', () => {
  const dir = fakePackage({ 'dist/index.js': '\n', 'notes.txt': 'private\n' });
  assert.deepEqual(kinds(scanPackage({ dir, files: ['dist/index.js', 'notes.txt'] })), ['notes.txt: not in package.json "files"']);
});

test('the CLI fails on a planted secret inside a real tarball, and passes once it is gone', () => {
  const bad = fakePackage({ 'dist/index.js': `export default "${FAKE_SECRET}";\n` });
  spawnSync('npm', ['pack', '--ignore-scripts', '--pack-destination', bad], { cwd: bad, encoding: 'utf8' });
  const tarball = join(bad, readdirSync(bad).find(name => name.endsWith('.tgz')));
  const failed = spawnSync('node', [SCRIPT, '--tarball', tarball], { encoding: 'utf8' });
  assert.equal(failed.status, 1, failed.stdout + failed.stderr);
  assert.match(failed.stderr, /dist\/index\.js: secret-shaped string/);
  assert.ok(!(failed.stdout + failed.stderr).includes(FAKE_SECRET));

  const good = fakePackage({ 'dist/index.js': 'export default 1;\n' });
  const passed = spawnSync('node', [SCRIPT], { cwd: good, encoding: 'utf8' });
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);
});

test('this package, as it packs now, is clean', () => {
  assert.deepEqual(scanPackage({ dir: ROOT, files: packedFiles(ROOT) }), []);
});
