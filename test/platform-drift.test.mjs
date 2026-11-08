import assert from 'node:assert/strict';
import { test } from 'node:test';

import { behindSince, gateFailures, newestShown, PLATFORMS, readDrift, REFERENCE_URLS, renderIssue, rowVerdict, thresholdHours } from '../scripts/platform-drift.mjs';

const now = new Date('2026-11-10T12:00:00Z');
const releases = [
  { at: '2026-11-01T12:00:00Z', version: '1.13.0' },
  { at: '2026-11-07T12:00:00Z', version: '1.15.0' },
  { at: '2026-11-09T12:00:00Z', version: '1.15.1' },
  { at: '2026-11-10T09:00:00Z', version: '1.15.2' },
];
const context = { now, reference: '1.15.2', referenceAt: '2026-11-10T09:00:00Z', releases };
const row = key => PLATFORMS.find(platform => platform.key === key);
const ok = json => ({ json, status: 200, text: JSON.stringify(json) });
const page = text => ({ json: null, status: 200, text });

test('thresholds: 6 h for core gates, 48 h for the GitHub gallery, 7 days for everyone else', () => {
  assert.equal(thresholdHours(row('npm')), 6);
  assert.equal(thresholdHours(row('github-gallery')), 48);
  assert.equal(thresholdHours(row('lobehub')), 168);
  assert.equal(thresholdHours(row('glama')), 168);
});

test('the GitHub gallery is read through /v0.1, which honours the server name', () => {
  assert.match(row('github-gallery').url, /^https:\/\/api\.mcp\.github\.com\/v0\.1\/servers\/com\.getmattered%2Fgetmattered\//);
});

test('Gemini is a submission, not a follower, and reads not listed when absent', () => {
  assert.equal(row('gemini').cls, 'submission');
  const verdict = rowVerdict(row('gemini'), ok([{ id: '@obra/superpowers' }]), context);
  assert.equal(verdict.verdict, 'not listed');
  assert.equal(rowVerdict(row('gemini'), ok([{ fullName: 'getmattered/getmattered-mcp' }]), context).verdict, 'current');
});

test('a blocked, unanswered or unparsed read is UNOBSERVED, never a pass', () => {
  assert.equal(rowVerdict(row('mcprush'), { json: null, status: 403, text: 'Just a moment...' }, context).verdict, 'UNOBSERVED');
  assert.equal(rowVerdict(row('verifymcp'), { json: null, status: 0, text: '' }, context).detail, 'no answer');
  assert.equal(rowVerdict(row('npm'), page('<html>maintenance</html>'), context).verdict, 'UNOBSERVED');
});

test('behind inside the threshold is lagging, past it is drift, from when the first newer release came out', () => {
  assert.equal(rowVerdict(row('github-gallery'), ok({ server: { version: '1.15.2' } }), context).verdict, 'current');
  assert.equal(rowVerdict(row('github-gallery'), ok({ server: { version: '1.15.1' } }), context).verdict, 'lagging');
  assert.equal(rowVerdict(row('github-gallery'), ok({ server: { version: '1.15.0' } }), context).verdict, 'lagging');
  assert.equal(rowVerdict(row('github-gallery'), ok({ server: { version: '1.13.0' } }), context).verdict, 'drift');
  const lobehub = rowVerdict(row('lobehub'), ok({ version: '1.13.0' }), context);
  assert.equal(lobehub.verdict, 'lagging');
  assert.match(lobehub.detail, /for 3 days/);
  assert.equal(rowVerdict(row('lobehub'), ok({ version: '1.12.0' }), { ...context, now: new Date('2026-11-20T12:00:00Z') }).verdict, 'drift');
});

test('the clock starts at the first newer release, or at main when the newest has no release yet', () => {
  assert.equal(behindSince('1.15.0', releases, '1.15.2', null), '2026-11-09T12:00:00Z');
  assert.equal(behindSince('1.15.2', releases.slice(0, 3), '1.15.3', '2026-11-10T11:00:00Z'), '2026-11-10T11:00:00Z');
});

test('the registry must mark the version latest, and the GitHub release must carry the OpenAI package', () => {
  const official = isLatest => ({ 'io.modelcontextprotocol.registry/official': { isLatest } });
  assert.equal(rowVerdict(row('registry'), ok({ _meta: official(true), server: { version: '1.15.2' } }), context).verdict, 'current');
  assert.equal(rowVerdict(row('registry'), ok({ _meta: official(false), server: { version: '1.15.2' } }), context).verdict, 'drift');
  assert.equal(rowVerdict(row('github-release'), ok({ assets: [{ name: 'getmattered-1.15.2-openai.zip' }], tag_name: 'v1.15.2' }), context).verdict, 'current');
  assert.equal(rowVerdict(row('github-release'), ok({ assets: [], tag_name: 'v1.15.2' }), context).verdict, 'drift');
});

test('pages are parsed by what each one shows', () => {
  assert.equal(rowVerdict(row('mcp-marketplace'), page('x scanned_package_version\\":\\"1.15.1\\" y scanned_package_version\\":\\"6.8.0\\"'), context).shown, '1.15.1');
  assert.equal(rowVerdict(row('glama'), page('latestRelease\\",{\\"_6473\\":6474},632,\\"version\\",\\"1.13.1\\"'), context).shown, '1.13.1');
  assert.equal(newestShown('history 1.10.4 1.15.0 sdk 1.29.0 node 22.1.0', '1.15.2'), '1.15.0');
  assert.equal(newestShown('nothing here', '1.15.2'), null);
});

test('only gate rows fail the run; followers, manual and submission rows print', () => {
  const rows = [
    rowVerdict(row('npm'), ok({ version: '1.15.2' }), context),
    rowVerdict(row('mcprush'), { json: null, status: 403, text: '' }, context),
    rowVerdict(row('gemini'), ok([]), context),
    rowVerdict(row('glama'), page('1.10.0'), { ...context, now: new Date('2026-12-30T00:00:00Z') }),
  ];
  assert.deepEqual(gateFailures(rows), []);
  const blockedGate = rowVerdict(row('server-card'), { json: null, status: 503, text: '' }, context);
  assert.deepEqual(gateFailures([...rows, blockedGate]).map(failed => failed.key), ['server-card']);
});

test('the issue body is one table with every row and says it never gets comments', () => {
  const rows = PLATFORMS.map(platform => rowVerdict(platform, { json: null, status: 403, text: '' }, context));
  const body = renderIssue(rows, { now, reference: '1.15.2' });
  assert.equal(body.split('\n').filter(line => line.startsWith('| [')).length, PLATFORMS.length);
  assert.match(body, /Core surfaces behind or unread/);
  assert.match(body, /never gets comments/);
});

test('readDrift reads main for the newest version, dates releases from npm, then reads every row once', async () => {
  const urls = [];
  const fetchReading = async (url) => {
    urls.push(url);
    if (url === REFERENCE_URLS.mainPackage) return ok({ version: '1.15.2' });
    if (url === REFERENCE_URLS.releases) return ok({ time: { '1.15.2': '2026-11-10T09:00:00Z', created: 'x', modified: 'y' } });
    return { json: null, status: 403, text: '' };
  };
  const { reference, rows } = await readDrift({ fetchReading, now });
  assert.equal(reference, '1.15.2');
  assert.equal(rows.length, PLATFORMS.length);
  assert.equal(urls.filter(url => url === REFERENCE_URLS.mainCommit).length, 0);
  await assert.rejects(readDrift({ fetchReading: async () => ({ json: null, status: 503, text: '' }), now }), /UNOBSERVED/);
});
