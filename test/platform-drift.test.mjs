import assert from 'node:assert/strict';
import { test } from 'node:test';

import { behindSince, exitCode, gateFailures, LISTING_PAGES, LISTING_PRS, listingVerdict, newestShown, PLATFORMS, prVerdict, readDrift, readUrl, REFERENCE_URLS, renderIssue, rowVerdict, runFailures, thresholdHours, WAITING, withFixWaits } from '../scripts/platform-drift.mjs';

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

test('Gemini crawls the mirror: a gallery file not rebuilt for days reads HELD, never "needs a submission"', () => {
  assert.equal(row('gemini').cls, 'follower');
  // geminicli.com/extensions.json read 13 Nov 2026: last-modified 16 Oct, 2198 entries, none of them us.
  const frozen = { ...ok([{ id: '@obra/superpowers' }]), lastModified: 'Fri, 16 Oct 2026 02:36:07 GMT' };
  const held = rowVerdict(row('gemini'), frozen, { ...context, now: new Date('2026-11-13T14:30:00Z') });
  assert.equal(held.verdict, 'HELD');
  assert.equal(held.detail, 'gallery not rebuilt since 2026-10-16; its daily crawl is stalled, nothing to submit');
  assert.doesNotMatch(held.detail, /submission/);
  const fresh = { ...ok([{ id: '@obra/superpowers' }]), lastModified: 'Tue, 10 Nov 2026 02:00:00 GMT' };
  assert.equal(rowVerdict(row('gemini'), fresh, context).verdict, 'not listed');
  assert.equal(rowVerdict(row('gemini'), ok([{ fullName: 'getmattered/getmattered-mcp' }]), context).verdict, 'current');
});

test('LobeHub is read at ?version=<newest>, past its 4 h cache, and falls back to the bare object on 404', async () => {
  assert.equal(rowVerdict(row('lobehub'), ok({ version: '1.15.2' }), context).url, 'https://market.lobehub.com/api/v1/plugins/getmattered-getmattered-mcp?version=1.15.2');
  const urls = [];
  const fetchReading = async (url) => {
    urls.push(url);
    if (url === REFERENCE_URLS.mainPackage) return ok({ version: '1.15.2' });
    if (url === REFERENCE_URLS.releases) return ok({ time: { '1.15.1': '2026-11-09T12:00:00Z', '1.15.2': '2026-11-10T09:00:00Z' } });
    if (url.endsWith('?version=1.15.2')) return { json: { message: 'not found' }, status: 404, text: '' };
    if (url === row('lobehub').fallbackUrl) return ok({ version: '1.15.1' });
    return { json: null, status: 403, text: '' };
  };
  const { rows } = await readDrift({ fetchReading, now });
  const lobehub = rows.find(entry => entry.key === 'lobehub');
  assert.equal(lobehub.shown, '1.15.1');
  assert.equal(lobehub.verdict, 'lagging');
  assert.ok(urls.indexOf(row('lobehub').fallbackUrl) > urls.findIndex(url => url.endsWith('?version=1.15.2')));
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
  const pinned = rowVerdict(row('lobehub'), ok({ artifacts: { npm: { packageName: 'getmattered-mcp', version: '1.15.4' } }, version: '1.18.0' }), context);
  assert.equal(pinned.verdict, 'drift');
  assert.match(pinned.detail, /npm artifact is 1\.15\.4/);
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

test('only gate rows fail the run; follower and manual rows print', () => {
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
  assert.equal(rows.length, PLATFORMS.length + LISTING_PAGES.length + LISTING_PRS.length);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter(url => url === REFERENCE_URLS.mainCommit).length, 0);
  await assert.rejects(readDrift({ fetchReading: async () => ({ json: null, status: 503, text: '' }), now }), /UNOBSERVED/);
});

const listingPage = LISTING_PAGES.find(entry => entry.key === 'awesome-remote-punkpeye');
const pr = LISTING_PRS.find(entry => entry.name === 'punkpeye/awesome-remote-mcp-servers#2806');

test('a listing that still shows the old name fails the run, as punkpeye showed it on 13 Nov 2026', () => {
  const text = '- [Acme](https://acme.example) `https://mcp.acme.example`\n- [AI Applyd](https://aiapplyd.com/mcps) `https://mcp.aiapplyd.com/mcp`\n';
  const verdict = listingVerdict(listingPage, page(text), context);
  assert.equal(verdict.verdict, 'old name');
  assert.match(verdict.detail, /^old name: - \[AI Applyd\]/);
  assert.deepEqual(runFailures([verdict]).map(failed => failed.key), ['awesome-remote-punkpeye']);
  assert.equal(listingVerdict(listingPage, page('see aiapplyd.com'), context).verdict, 'old name');
});

test('a listing line that names GetMattered with an older version fails; other lines and a clean line pass', () => {
  assert.equal(listingVerdict(listingPage, page('- [GetMattered](https://getmattered.com/) 1.13.0\n- [Other](x) 0.9.1 2.4.0\n'), context).verdict, 'drift');
  const clean = listingVerdict(listingPage, page('- [GetMattered](https://github.com/getmattered/getmattered-mcp) 1.15.2\n- [Other](x) 1.0.3\n'), context);
  assert.equal(clean.verdict, 'current');
  assert.deepEqual(runFailures([clean]), []);
  assert.equal(listingVerdict(listingPage, page('- [Other](x)\n'), context).verdict, 'not listed');
  assert.equal(listingVerdict(listingPage, { json: null, status: 429, text: '' }, context).verdict, 'UNOBSERVED');
});

test('our pull requests print their state, and only the old name in our own text fails the run', () => {
  const issue = fields => ok({ body: 'Adds GetMattered.', created_at: '2026-10-24T14:00:00Z', html_url: 'https://github.com/punkpeye/awesome-remote-mcp-servers/pull/2806', state: 'open', title: 'Update listing to GetMattered', ...fields });
  const open = prVerdict(pr, issue({}), context);
  assert.equal(open.verdict, 'open');
  assert.match(open.detail, /open 16 days/);
  assert.equal(prVerdict(pr, issue({ pull_request: { merged_at: '2026-11-11T09:00:00Z' }, state: 'closed' }), context).verdict, 'merged');
  assert.equal(prVerdict(pr, issue({ pull_request: { merged_at: null }, state: 'closed' }), context).verdict, 'closed');
  const oldTitle = prVerdict(pr, issue({ title: 'Rename AI Applyd to GetMattered' }), context);
  assert.equal(oldTitle.verdict, 'old name');
  assert.deepEqual(runFailures([open, oldTitle]).map(failed => failed.verdict), ['old name']);
  assert.equal(prVerdict(pr, { json: { message: 'API rate limit exceeded' }, status: 403, text: '' }, context).verdict, 'UNOBSERVED');
});

test('every open listing PR the release board names has a PR-state row', () => {
  const names = LISTING_PRS.map(entry => entry.name);
  for (const ref of ['punkpeye/awesome-remote-mcp-servers#2806', 'arthurspk/guiadoconhecimento#2', 'docker/mcp-registry#6054', 'cline/marketplace#230', 'xai-org/plugin-marketplace#1238', 'Kamalnrf/claude-plugins#130', 'khalyomede/korru.app#1']) assert.ok(names.includes(ref), ref);
  for (const entry of LISTING_PRS) assert.match(entry.url, /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/issues\/\d+$/);
});

test('the old name on a listing whose fix PR is open prints as waiting, as drift read it on 13 Nov 2026', () => {
  const remote = listingVerdict(listingPage, page('- [AI Applyd](https://aiapplyd.com/mcps)\n'), context);
  const guia = listingVerdict(LISTING_PAGES.find(entry => entry.key === 'guiadoconhecimento'), page('| AI Applyd | x |\n'), context);
  const openPr = ref => ({ key: `pr:${ref}`, openDays: 20, shown: 'open', verdict: 'open' });
  const rows = withFixWaits([remote, guia, openPr('punkpeye/awesome-remote-mcp-servers#2806'), openPr('arthurspk/guiadoconhecimento#2')]);
  assert.deepEqual(rows.slice(0, 2).map(entry => entry.verdict), [WAITING, WAITING]);
  assert.match(rows[0].detail, /fix PR punkpeye\/awesome-remote-mcp-servers#2806 open 20 days, waits on the maintainer/);
  assert.deepEqual(runFailures(rows), []);
  assert.equal(exitCode(rows), 0);
  assert.match(renderIssue(rows, { now, reference: '1.15.2' }), /Old name, waiting on someone else: punkpeye/);
});

test('a fix PR that closed, merged or went unread leaves the old name failing, with the listing exit code', () => {
  const remote = listingVerdict(listingPage, page('- [AI Applyd](https://aiapplyd.com/mcps)\n'), context);
  for (const pr of [{ shown: 'closed', verdict: 'closed' }, { shown: 'merged', verdict: 'merged' }, { shown: '', verdict: 'UNOBSERVED' }, null]) {
    const rows = withFixWaits(pr ? [remote, { key: 'pr:punkpeye/awesome-remote-mcp-servers#2806', ...pr }] : [remote]);
    assert.equal(rows[0].verdict, 'old name');
    assert.equal(exitCode(rows), 3);
  }
  const card = rowVerdict(row('server-card'), { json: null, status: 503, text: '' }, context);
  assert.equal(exitCode([remote, card]), 1);
});

test('a page whose fix only the site can make prints as waiting, and HTML pages skip the version check', () => {
  const muse = LISTING_PAGES.find(entry => entry.key === 'musedirectory');
  assert.equal(muse.url, 'https://musedirectory.ai/connector/ai-applyd');
  const html = '<html><a href="https://aiapplyd.com/mcps">GetMattered</a> Found in the official MCP Registry (com.aiapplyd/aiapplyd)</html>';
  const [verdict] = withFixWaits([listingVerdict(muse, page(html), context)]);
  assert.equal(verdict.verdict, WAITING);
  assert.match(verdict.detail, /old name: .*aiapplyd\.com\/mcps/);
  assert.match(verdict.detail, /waits on the site/);
  const mcpSo = LISTING_PAGES.find(entry => entry.key === 'mcp-so');
  assert.equal(listingVerdict(mcpSo, page('<div>GetMattered 1.10.2 react 0.9.1 node 1.0.4</div>'), context).verdict, 'current');
  assert.ok(LISTING_PAGES.some(entry => entry.url === 'https://cursor.directory/plugins/getmattered-mcp'));
});

test('a 403 to the token is read again without it, and the row says which path answered', async () => {
  const calls = [];
  const fetcher = async (_url, headers) => {
    calls.push(Boolean(headers.Authorization));
    return headers.Authorization ? { json: { message: 'Resource not accessible by integration' }, status: 403, text: '' } : ok({ body: '', created_at: '2026-10-24T14:00:00Z', state: 'open', title: 'Add GetMattered' });
  };
  const xai = LISTING_PRS.find(entry => entry.name === 'xai-org/plugin-marketplace#1238');
  const reading = await readUrl(xai.url, { fetcher, token: 't' });
  assert.deepEqual(calls, [true, false]);
  const verdict = prVerdict(xai, reading, context);
  assert.equal(verdict.verdict, 'open');
  assert.match(verdict.detail, /\(read without the token, which got 403\)$/);
  calls.length = 0;
  await readUrl('https://mcp.so/servers/getmattered-mcp', { fetcher, token: 't' });
  assert.deepEqual(calls, [false]);
});
