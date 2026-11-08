import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { changelogSection, DRAFT_MARKER, readbackProblems, SURFACE_URLS, surfaceHas, tagMatches, waitFor } from '../scripts/release-steps.mjs';

const CHANGELOG = '# Changelog\n\n## 1.15.1\n\nREADME only.\n\n- One line.\n\n## 1.15.0\n\nOlder.\n';

test('release notes are the version section, without the next one', () => {
  assert.equal(changelogSection(CHANGELOG, '1.15.1'), 'README only.\n\n- One line.');
  assert.equal(changelogSection(CHANGELOG, '1.15.0'), 'Older.');
});

test('a missing, empty or draft section stops the release', () => {
  assert.throws(() => changelogSection(CHANGELOG, '1.16.0'), /no "## 1.16.0" section/);
  assert.throws(() => changelogSection('# Changelog\n\n## 1.15.1\n\n## 1.15.0\n\nx\n', '1.15.1'), /empty/);
  assert.throws(() => changelogSection(`# Changelog\n\n## 1.15.1\n\n${DRAFT_MARKER}\n`, '1.15.1'), /still a draft/);
});

test('the committed changelog has a section for the package version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(changelogSection(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), pkg.version).length > 0);
});

test('the tag must be the package version', () => {
  assert.equal(tagMatches('v1.15.1', { version: '1.15.1' }), true);
  assert.equal(tagMatches('v1.15.0', { version: '1.15.1' }), false);
  assert.equal(tagMatches('1.15.1', { version: '1.15.1' }), false);
});

test('each surface is read by its own field', () => {
  assert.equal(surfaceHas('card', '1.15.1', { body: { serverInfo: { version: '1.15.1' } }, status: 200 }), true);
  assert.equal(surfaceHas('card', '1.15.1', { body: { serverInfo: { version: '1.15.0' } }, status: 200 }), false);
  assert.equal(surfaceHas('npm', '1.15.1', { body: { version: '1.15.1' }, status: 200 }), true);
  assert.equal(surfaceHas('npm', '1.15.1', { body: null, status: 404 }), false);
  assert.equal(surfaceHas('registry', '1.15.1', { body: { server: { version: '1.15.1' } }, status: 200 }), true);
  assert.equal(SURFACE_URLS.registry('1.15.1'), 'https://registry.modelcontextprotocol.io/v0.1/servers/com.getmattered%2Fgetmattered/versions/1.15.1');
});

test('waiting polls until the server card reports the version, and gives up at the deadline', async () => {
  const answers = ['1.15.0', '1.15.0', '1.15.1'];
  let reads = 0;
  const fetchReading = async () => ({ body: { serverInfo: { version: answers[Math.min(reads++, 2)] } }, status: 200 });
  assert.equal(await waitFor('card', '1.15.1', { every: 0, fetchReading, seconds: 60, sleep: async () => {} }), true);
  assert.equal(reads, 3);
  assert.equal(await waitFor('card', '9.9.9', { every: 0, fetchReading, seconds: 0, sleep: async () => {} }), false);
});

test('the read-back fails unless npm and the registry both call V latest', () => {
  const official = isLatest => ({ 'io.modelcontextprotocol.registry/official': { isLatest } });
  assert.deepEqual(readbackProblems('1.15.1', { version: '1.15.1' }, { _meta: official(true), server: { version: '1.15.1' } }), []);
  assert.deepEqual(readbackProblems('1.15.1', { version: '1.15.0' }, { _meta: official(true), server: { version: '1.15.1' } }), ['npm latest is 1.15.0']);
  assert.deepEqual(readbackProblems('1.15.1', { version: '1.15.1' }, { _meta: official(false), server: { version: '1.15.1' } }), ['registry does not mark it latest']);
  assert.deepEqual(readbackProblems('1.15.1', null, null), ['npm latest is unreadable', 'registry latest is unreadable']);
});
