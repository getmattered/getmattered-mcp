import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { changedFiles, FORKS, listingFiles, pinnedCatalog, readPin } from '../scripts/listing-prs.mjs';

const OLD = 'a20371f54c014eda770ef17e6646c0c53d67a1ea';
const NEW = '649ab9415c3ab66e79e0aac464aab19272dff84a';
const entry = sha => ({ category: 'productivity', name: 'getmattered', source: { path: 'plugins/getmattered', sha, source: 'url', url: 'https://github.com/getmattered/getmattered-mcp.git' } });
// Upstream mixes inline and expanded arrays, so it must never be re-serialized.
const UPSTREAM = '{\n  "name": "xai-official",\n  "plugins": [\n    {\n      "name": "vercel",\n      "keywords": ["vercel", "deploy"]\n    }\n  ]\n}\n';
const BRANCH = `${JSON.stringify({ name: 'xai-official', plugins: [entry(OLD)] }, null, 2)}\n`;

test('the xAI entry is added to upstream with a full sha, leaving every other line as it was', () => {
  const next = pinnedCatalog(BRANCH, UPSTREAM, NEW);
  assert.equal(readPin(next), NEW);
  assert.ok(next.startsWith(UPSTREAM.slice(0, UPSTREAM.indexOf('\n  ]'))));
  assert.match(next, /"keywords": \["vercel", "deploy"\]/);
  assert.equal(JSON.parse(next).plugins.length, 2);
});

test('when upstream already lists us, only the sha moves', () => {
  const listed = pinnedCatalog(BRANCH, UPSTREAM, OLD);
  const next = pinnedCatalog(BRANCH, listed, NEW);
  assert.equal(readPin(next), NEW);
  assert.equal(next.replace(NEW, OLD), listed);
});

test('a tag, a branch or a short sha is refused, as their validator does', () => {
  for (const sha of ['v1.15.1', 'main', '649ab94']) assert.throws(() => pinnedCatalog(BRANCH, UPSTREAM, sha), /40-character/);
});

test('Docker gets metadata only and Cline text only, with no counts that go stale', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  assert.deepEqual(listingFiles(root, 'docker').map(([path]) => path), ['servers/getmattered/readme.md', 'servers/getmattered/server.yaml']);
  assert.deepEqual(listingFiles(root, 'cline').map(([path]) => path), ['registry/mcps/getmattered/entry.json', 'registry/skills/getmattered-job-search/entry.json']);
  for (const fork of ['docker', 'cline']) {
    for (const [path, text] of listingFiles(root, fork)) assert.doesNotMatch(text, /\b\d+ tools\b|\bfourteen\b|aiapplyd/i, `${fork} ${path}`);
  }
  for (const [, text] of listingFiles(root, 'cline')) JSON.parse(text);
});

test('only files that differ from the fork branch count as a change, so a matching branch is a no-op', () => {
  const checkout = mkdtempSync(join(tmpdir(), 'listing-'));
  const files = [['a/one.json', '{"x":1}\n'], ['b/two.md', 'two\n']];
  assert.deepEqual(changedFiles(files, checkout), ['a/one.json', 'b/two.md']);
  mkdirSync(join(checkout, 'a'));
  writeFileSync(join(checkout, 'a/one.json'), '{"x":1}\n');
  assert.deepEqual(changedFiles(files, checkout), ['b/two.md']);
});

test('each fork names the head branch of our open PR', () => {
  assert.deepEqual(Object.keys(FORKS).sort(), ['cline', 'docker', 'xai']);
  assert.equal(FORKS.xai.repo, 'getmattered/plugin-marketplace');
  assert.equal(FORKS.docker.branch, 'add-getmattered');
});
