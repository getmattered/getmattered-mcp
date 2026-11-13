import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  assetProblem,
  changelogSection,
  DRAFT_MARKER,
  GALLERY_URL,
  galleryLine,
  lobehubManifest,
  newerTag,
  openaiContentHash,
  packageHashFromNotes,
  packageMarker,
  previousTag,
  readbackProblems,
  releaseAssets,
  reminderSteps,
  remindersBody,
  SURFACE_URLS,
  surfaceHas,
  tagMatches,
  toolMarker,
  toolNamesFromNotes,
  unuploadedPackage,
  waitFor,
} from '../scripts/release-steps.mjs';

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

test('a tag that a newer release tag replaced is found, so its run publishes nothing', () => {
  const listed = ['a\trefs/tags/v1.14.1', 'b\trefs/tags/v1.15.0', 'c\trefs/tags/v1.15.10', 'd\trefs/tags/v1.15.2', 'e\trefs/tags/v2.0.0-rc.1', ''].join('\n');
  assert.equal(newerTag('v1.15.0', listed), 'v1.15.10');
  assert.equal(newerTag('v1.15.2', listed), 'v1.15.10');
  assert.equal(newerTag('v1.15.10', listed), null);
  assert.equal(newerTag('v1.16.0', listed), null);
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

test('every release carries two files: the OpenAI package and the Claude Desktop bundle', () => {
  assert.deepEqual(releaseAssets('1.15.3'), ['getmattered-1.15.3-openai.zip', 'getmattered-1.15.3.mcpb']);
  assert.equal(assetProblem('1.15.3', ['getmattered-1.15.3.mcpb', 'getmattered-1.15.3-openai.zip']), null);
  assert.match(assetProblem('1.15.3', ['getmattered-1.15.3-openai.zip']), /expected/);
  assert.match(assetProblem('1.15.3', ['getmattered-1.15.3-openai.zip', 'getmattered-1.15.3.mcpb', 'extra.txt']), /expected/);
});

test('the previous tag is the newest release tag below this one', () => {
  const listed = ['a\trefs/tags/v1.14.1', 'b\trefs/tags/v1.15.0', 'c\trefs/tags/v1.15.10', 'd\trefs/tags/v1.15.2', 'e\trefs/tags/v2.0.0-rc.1', ''].join('\n');
  assert.equal(previousTag('v1.15.10', listed), 'v1.15.2');
  assert.equal(previousTag('v1.15.2', listed), 'v1.15.0');
  assert.equal(previousTag('v1.14.1', listed), null);
});

test('the GitHub gallery is read through /v0.1 and is a follower: behind or blocked prints, never fails', () => {
  assert.match(GALLERY_URL, /^https:\/\/api\.mcp\.github\.com\/v0\.1\/servers\/com\.getmattered%2Fgetmattered\//);
  assert.equal(galleryLine('1.15.3', { body: { server: { version: '1.15.3' } }, status: 200 }), 'GitHub MCP gallery 1.15.3 (follower)');
  assert.match(galleryLine('1.15.3', { body: { server: { version: '1.15.1' } }, status: 200 }), /still 1\.15\.1/);
  assert.match(galleryLine('1.15.3', { body: null, status: 403 }), /UNOBSERVED/);
});

test('the release notes record the tool names, and the next release reads them back', () => {
  const marker = toolMarker(['getmattered_b', 'getmattered_a']);
  assert.equal(marker, '<!-- getmattered-tools: getmattered_a getmattered_b -->');
  assert.deepEqual(toolNamesFromNotes(`Notes.\n\n${marker}\n`), ['getmattered_a', 'getmattered_b']);
  assert.equal(toolNamesFromNotes('Notes without a marker.'), null);
});

const codexManifest = (version, notes, extra = {}) => Buffer.from(JSON.stringify({ extensions: { 'com.openai': { publication: { release_notes: notes } } }, name: 'getmattered', version, ...extra }));

test('the OpenAI content hash ignores the version and release notes, and sees skills, metadata and assets', () => {
  const skill = ['plugins/getmattered/skills/a/SKILL.md', Buffer.from('# A')];
  const base = openaiContentHash([['plugins/getmattered/.codex-plugin/plugin.json', codexManifest('1.15.2', '1.15.2: x')], skill]);
  assert.equal(openaiContentHash([['plugins/getmattered/.codex-plugin/plugin.json', codexManifest('1.15.3', '1.15.3: y')], skill]), base);
  assert.equal(openaiContentHash([['plugins/getmattered/.codex-plugin/plugin.json', codexManifest('1.15.2', '1.15.2: x')], skill, ['src/index.ts', Buffer.from('x')]]), base);
  assert.notEqual(openaiContentHash([['plugins/getmattered/.codex-plugin/plugin.json', codexManifest('1.15.2', '1.15.2: x', { description: 'new' })], skill]), base);
  assert.notEqual(openaiContentHash([['plugins/getmattered/.codex-plugin/plugin.json', codexManifest('1.15.2', '1.15.2: x')], ['plugins/getmattered/skills/a/SKILL.md', Buffer.from('# B')]]), base);
});

test('reminders list a step only when the release changed what it shows; Glama is always a person', () => {
  const same = reminderSteps({ hashBefore: 'h1', hashNow: 'h1', toolsBefore: ['a', 'b'], toolsNow: ['a', 'b'], version: '1.15.3' });
  assert.equal(same.length, 1);
  assert.match(same[0], /^Glama: .*Make Release" 1\.15\.3/);
  const changed = reminderSteps({ hashBefore: 'h1', hashNow: 'h2', toolsBefore: ['a', 'b'], toolsNow: ['a', 'c'], version: '1.15.3' });
  assert.equal(changed.length, 3);
  assert.match(changed[0], /added c; removed b/);
  assert.match(changed[1], /getmattered-1\.15\.3-openai\.zip/);
  const unread = reminderSteps({ hashBefore: null, hashNow: 'h2', toolsBefore: null, toolsNow: ['a'], version: '1.15.3' });
  assert.equal(unread.filter(step => step.includes('UNOBSERVED')).length, 2);
  assert.match(reminderSteps({ hashBefore: 'h', hashNow: 'h', toolsBefore: ['a'], toolsNow: null, version: '1.15.3' })[0], /UNOBSERVED/);
});

test('an upload the previous release asked for and nobody ticked is carried into the next issue', () => {
  const previous = remindersBody('1.15.4', reminderSteps({ hashBefore: 'aaaa', hashNow: 'bbbb', toolsBefore: ['a'], toolsNow: ['a'], version: '1.15.4' }));
  const left = unuploadedPackage(previous);
  assert.deepEqual(left, { hashAsked: 'bbbb', hashBefore: 'aaaa' });
  const carried = reminderSteps({ carried: { from: 'v1.15.4', hashBefore: left.hashBefore }, hashBefore: 'bbbb', hashNow: 'bbbb', toolsBefore: ['a'], toolsNow: ['a'], version: '1.16.0' });
  assert.match(carried[0], /^ChatGPT package: .*v1\.15\.4 asked for is still unticked \(aaaa to bbbb\)\. Upload getmattered-1\.16\.0-openai\.zip/);
  const back = reminderSteps({ carried: { from: 'v1.15.4', hashBefore: 'aaaa' }, hashBefore: 'bbbb', hashNow: 'aaaa', toolsBefore: ['a'], toolsNow: ['a'], version: '1.16.0' });
  assert.equal(back.some(step => step.startsWith('ChatGPT package')), false);
  assert.equal(unuploadedPackage(previous.replace('- [ ] ChatGPT', '- [x] ChatGPT')), null);
});

test('the release notes record the OpenAI package hash in a hidden line', () => {
  const notes = `Fixes.\n\n${toolMarker(['a'])}\n${packageMarker('ccc249b8a6fa2b47')}\n`;
  assert.equal(packageHashFromNotes(notes), 'ccc249b8a6fa2b47');
  assert.equal(packageHashFromNotes('Fixes.'), null);
});

test('the reminder issue body is a checklist, and empty when there is nothing to do', () => {
  assert.equal(remindersBody('1.15.3', []), '');
  const body = remindersBody('1.15.3', ['One.', 'Two.']);
  assert.match(body, /^Release 1\.15\.3 needs these steps\./);
  assert.equal(body.split('\n').filter(line => line.startsWith('- [ ] ')).length, 2);
});

test('the LobeHub manifest keeps the committed fields and takes the live tools', () => {
  const committed = JSON.parse(readFileSync(new URL('../lhm.plugin.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(committed.identifier, 'getmattered-getmattered-mcp');
  assert.equal(committed.version, pkg.version);
  const merged = lobehubManifest(committed, { identifier: 'other', name: 'other', tools: [{ name: 't' }], version: '0.0.1' });
  assert.equal(merged.identifier, 'getmattered-getmattered-mcp');
  assert.equal(merged.version, pkg.version);
  assert.deepEqual(merged.tools, [{ name: 't' }]);
  assert.deepEqual(merged.prompts, []);
});

test('the Claude Desktop manifest is mcpb 0.3, runs the bridge and signs in on first use', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, '0.3');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.server.type, 'node');
  assert.equal(manifest.server.entry_point, pkg.bin['getmattered-mcp']);
  assert.equal(manifest.server.mcp_config.env.GETMATTERED_LOGIN_ON_START, '1');
  assert.equal(manifest.icon, 'assets/logo-400.png');
  assert.deepEqual(manifest.privacy_policies, ['https://getmattered.com/legal/privacy']);
});
