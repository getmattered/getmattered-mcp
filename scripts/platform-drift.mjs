/**
 * Reads every platform that shows GetMattered and says how far each is behind
 * the newest release. .github/workflows/drift.yml runs it daily and writes the
 * table into the body of the one pinned "Platform drift" issue.
 *
 *   node scripts/platform-drift.mjs [--out <file>]
 *
 * Each row has a class:
 *   gate        a core release surface (hosted server, npm, MCP Registry, GitHub
 *               release). A gate row that is behind past its threshold, or
 *               unreadable, fails the run (exit 1).
 *   follower    follows npm, the registry or the repo on its own clock. Prints only.
 *   manual      moves only when a person acts (Glama Make Release). Prints only.
 *   listing     a merged list entry or directory page (LISTING_PAGES), read as
 *               text. The old name (/ai ?applyd/i) anywhere on the page, or a
 *               version older than the newest release on a line that names
 *               GetMattered, fails the run. The old name on a page whose fix
 *               waits on someone else (our fix PR is open, or `waitsOn` names
 *               the site's own step) reads "old name, waiting" and only prints.
 *   pr          one of OUR open listing pull requests or issues (LISTING_PRS),
 *               read through api.github.com. The old name in its title or body
 *               (our own text) fails the run; open, merged and closed only print.
 *
 * Verdicts: current, lagging (behind, inside its threshold), drift (behind past
 * it), HELD (the platform itself is stalled, nothing for us to do), not listed,
 * UNOBSERVED (blocked, unanswered or unparsed). A blocked read is never a pass.
 * Several sites block datacenter IPs, so from Actions their rows read
 * UNOBSERVED every day; those rows are not coverage.
 *
 * Exit codes: 1 when a gate row fails (a core surface is behind or unread), 3
 * when only listing or PR rows fail (our own text or a listing we can fix), 2
 * when the reader itself stopped.
 *
 * Thresholds: 6 h for gate rows, 48 h for the GitHub MCP gallery, 7 days for
 * everyone else. The clock starts when the first release newer than the
 * version a platform shows came out.
 *
 * Plain fetch only: no credentials, except GITHUB_TOKEN for api.github.com (the
 * pull request rows, about fifteen reads, well inside the token's hourly limit).
 * A 403 to the token is read again without it: xai-org refused the Actions token
 * on every run since 13 Nov 2026 while the same URL answered 200 to no token.
 */
import { writeFileSync } from 'node:fs';
import { argv, env, exit, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

const REPO_API = 'https://api.github.com/repos/getmattered/getmattered-mcp';
export const REFERENCE_URLS = {
  mainCommit: `${REPO_API}/commits/main`,
  mainPackage: 'https://raw.githubusercontent.com/getmattered/getmattered-mcp/main/package.json',
  // npm dates every version; GitHub releases exist only from 1.15.1.
  releases: 'https://registry.npmjs.org/getmattered-mcp',
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LOBEHUB = 'https://market.lobehub.com/api/v1/plugins/getmattered-getmattered-mcp';
const SEMVER = /^\d+\.\d+\.\d+$/;

export function compareVersions(a, b) {
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The highest x.y.z in a page that is not above the newest release. A page that
 * shows history or dependency versions still yields the version it shows for us,
 * because nothing of ours can be newer than the newest release.
 */
export function newestShown(text, reference) {
  const found = [...String(text).matchAll(/(?<![\d.])(\d{1,2}\.\d{1,3}\.\d{1,3})(?![\d.])/g)]
    .map(match => match[1])
    .filter(version => compareVersions(version, reference) <= 0 && compareVersions(version, '1.0.0') >= 0);
  return found.sort(compareVersions).at(-1) ?? null;
}

const field = (pattern, text) => String(text).match(pattern)?.[1] ?? null;

/**
 * One row per platform. `parse({ text, json, reference, lastModified, now })`
 * answers { version } or { listed: false } or { listed: true } (no version
 * shown), plus an optional `problem` that makes a gate row drift, or `held`
 * (why the platform itself is stalled); null means unparsed. `url` may be a
 * function of the newest release; `fallbackUrl` is read when `url` answers 404.
 */
export const PLATFORMS = [
  {
    cls: 'gate',
    key: 'server-card',
    name: 'Hosted server card',
    parse: ({ json }) => (json?.serverInfo?.version ? { version: json.serverInfo.version } : null),
    url: 'https://mcp.getmattered.com/.well-known/mcp/server-card.json',
  },
  {
    cls: 'gate',
    key: 'npm',
    name: 'npm getmattered-mcp latest',
    parse: ({ json }) => (json?.version ? { version: json.version } : null),
    url: 'https://registry.npmjs.org/getmattered-mcp/latest',
  },
  {
    cls: 'gate',
    key: 'registry',
    name: 'Official MCP Registry',
    parse: ({ json }) => {
      const version = json?.server?.version;
      if (!version) return null;
      const official = json._meta?.['io.modelcontextprotocol.registry/official'];
      return official?.isLatest === true ? { version } : { problem: 'not marked isLatest', version };
    },
    url: 'https://registry.modelcontextprotocol.io/v0.1/servers/com.getmattered%2Fgetmattered/versions/latest',
  },
  {
    cls: 'gate',
    key: 'github-release',
    name: 'GitHub release (latest)',
    parse: ({ json }) => {
      const version = json?.tag_name?.replace(/^v/, '');
      if (!version || !SEMVER.test(version)) return null;
      const names = (json.assets ?? []).map(asset => asset?.name);
      return names.includes(`getmattered-${version}-openai.zip`) ? { version } : { problem: 'no OpenAI package attached', version };
    },
    url: `${REPO_API}/releases/latest`,
  },
  {
    // Only /v0.1 honours the server name; /v0/servers?search= answers with other servers.
    cls: 'follower',
    key: 'github-gallery',
    name: 'GitHub MCP gallery (VS Code, Copilot in JetBrains, Eclipse, Xcode)',
    parse: ({ json }) => (json?.server?.version ? { version: json.server.version } : null),
    thresholdHours: 48,
    url: 'https://api.mcp.github.com/v0.1/servers/com.getmattered%2Fgetmattered/versions/latest',
  },
  {
    cls: 'follower',
    key: 'mcp-marketplace',
    name: 'mcp-marketplace.io',
    parse: ({ text }) => {
      const version = field(/scanned_package_version\\?"\s*:\s*\\?"(\d+\.\d+\.\d+)/, text);
      return version ? { version } : null;
    },
    url: 'https://mcp-marketplace.io/server/com-getmattered-getmattered',
  },
  {
    cls: 'follower',
    key: 'wellknown',
    name: 'Wellknown',
    parse: ({ reference, text }) => {
      const version = newestShown(text, reference);
      return version ? { version } : null;
    },
    url: 'https://wellknown.network/agents/getmattered',
  },
  {
    cls: 'follower',
    key: 'verifymcp',
    name: 'VerifyMCP',
    parse: ({ reference, text }) => {
      const version = newestShown(text, reference);
      return version ? { version } : null;
    },
    url: 'https://verifymcp.io/servers/com-getmattered-getmattered/mcp',
  },
  {
    // Its sync stalled on 29 Oct; only its own sync can move it.
    cls: 'follower',
    key: 'mcpfind',
    name: 'mcpfind.org',
    parse: ({ json }) => (json?.version ? { version: json.version } : null),
    url: 'https://mcpfind.org/api/servers/com-getmattered-getmattered',
  },
  {
    cls: 'follower',
    key: 'mcprush',
    name: 'MCPRush (npm crawl)',
    parse: ({ reference, text }) => {
      const version = newestShown(text, reference);
      return version ? { version } : null;
    },
    url: 'https://mcprush.com/getmatteredhq/getmattered-mcp-2',
  },
  {
    cls: 'follower',
    key: 'mcpservers',
    name: 'mcpservers.org (GitHub crawl, no version shown)',
    parse: ({ text }) => (/getmattered/i.test(text) ? { listed: true } : { listed: false }),
    url: 'https://mcpservers.org/servers/getmattered/getmattered-mcp',
  },
  {
    // The release pushes it with `lhm plugin update`. The bare URL is a Cloudflare
    // cache hit for up to 4 h (max-age=14400): on 13 Nov 2026 it served 1.17.1 for
    // 38 minutes after LobeHub took 1.18.0. ?version=<V> is its own cache key and a
    // missing version answers 404 uncached, so it reads exactly whether V is there.
    cls: 'follower',
    fallbackUrl: LOBEHUB,
    key: 'lobehub',
    name: 'LobeHub (pushed by the release)',
    // The npm install artifact must name the listed version too: on 13 Nov 2026 the
    // 1.18.0 listing still advertised getmattered-mcp@1.15.4.
    parse: ({ json }) => {
      if (!json?.version) return null;
      const artifact = json.artifacts?.npm?.version;
      return artifact && artifact !== json.version ? { problem: `npm artifact is ${artifact}, the listing is ${json.version}`, version: json.version } : { version: json.version };
    },
    url: reference => `${LOBEHUB}?version=${reference}`,
  },
  {
    cls: 'manual',
    key: 'glama',
    name: 'Glama server page (Sync Server, Make Release)',
    parse: ({ reference, text }) => {
      const version = field(/latestRelease[\s\S]{0,600}?version\\?"\s*[,:]\s*\\?"(\d+\.\d+\.\d+)/, text) ?? newestShown(text, reference);
      return version ? { version } : null;
    },
    url: 'https://glama.ai/mcp/servers/getmattered/getmattered-mcp',
  },
  {
    // No submission exists: geminicli.com/docs/extensions/releasing says the gallery
    // crawls public repos with the gemini-cli-extension topic and a root
    // gemini-extension.json daily, and the mirror has both. The file itself stopped
    // being rebuilt on 16 Oct 2026 (google-gemini/gemini-cli#29957), so a stale file
    // without us reads HELD, never "needs a submission".
    cls: 'follower',
    key: 'gemini',
    name: 'Gemini CLI extensions gallery (crawls the mirror)',
    parse: ({ json, lastModified, now }) => {
      if (!Array.isArray(json)) return null;
      if (json.some(entry => /getmattered/i.test(JSON.stringify(entry)))) return { listed: true };
      const built = Date.parse(lastModified ?? '');
      if (!Number.isNaN(built) && now.getTime() - built > 2 * DAY) return { held: `gallery not rebuilt since ${new Date(built).toISOString().slice(0, 10)}; its daily crawl is stalled, nothing to submit` };
      return { listed: false };
    },
    url: 'https://geminicli.com/extensions.json',
  },
  {
    cls: 'follower',
    key: 'pulsemcp',
    name: 'PulseMCP (paused)',
    parse: ({ text }) => (/getmattered/i.test(text) ? { listed: true } : { listed: false }),
    url: 'https://www.pulsemcp.com/servers?q=getmattered',
  },
];

/** The name GetMattered had before 24 Oct 2026; its domain changes owner on 19 Nov 2026. */
export const OLD_NAME = /ai ?applyd/i;

const raw = (repo, path) => `https://raw.githubusercontent.com/${repo}/main/${path}`;

/**
 * Merged list entries and directory pages, read as text: where each keeps our
 * line. `fixPr` is our open pull request that removes the old name; `waitsOn`
 * names a fix only the site can make (no PR, no edit path). Either makes the old
 * name print instead of fail, while it waits. `versions: false` skips the
 * version check on an HTML page, whose lines carry unrelated version numbers.
 */
export const LISTING_PAGES = [
  { fixPr: 'punkpeye/awesome-remote-mcp-servers#2806', key: 'awesome-remote-punkpeye', name: 'punkpeye/awesome-remote-mcp-servers (fix PR #2806)', page: 'https://github.com/punkpeye/awesome-remote-mcp-servers', url: raw('punkpeye/awesome-remote-mcp-servers', 'README.md') },
  { fixPr: 'arthurspk/guiadoconhecimento#2', key: 'guiadoconhecimento', name: 'arthurspk/guiadoconhecimento (fix PR #2)', page: 'https://github.com/arthurspk/guiadoconhecimento/blob/main/areas/carreira/carreira-vagas.md', url: raw('arthurspk/guiadoconhecimento', 'areas/carreira/carreira-vagas.md') },
  { key: 'awesome-job-boards', name: 'emredurukn/awesome-job-boards', page: 'https://github.com/emredurukn/awesome-job-boards', url: raw('emredurukn/awesome-job-boards', 'README.md') },
  { key: 'aianytime', name: 'AIAnytime/Awesome-MCP-Servers', page: 'https://github.com/AIAnytime/Awesome-MCP-Servers', url: raw('AIAnytime/Awesome-MCP-Servers', 'README.md') },
  { key: 'collabnix', name: 'collabnix/awesome-mcp-lists', page: 'https://github.com/collabnix/awesome-mcp-lists', url: raw('collabnix/awesome-mcp-lists', 'README.md') },
  { key: 'tensorblock', name: 'TensorBlock/awesome-mcp-servers', page: 'https://github.com/TensorBlock/awesome-mcp-servers/blob/main/docs/utilities--helpers.md', url: raw('TensorBlock/awesome-mcp-servers', 'docs/utilities--helpers.md') },
  { key: 'toolsdk', name: 'toolsdk-ai/toolsdk-mcp-registry', page: 'https://github.com/toolsdk-ai/toolsdk-mcp-registry/blob/main/packages/other-tools-and-integrations/getmattered-mcp.json', url: raw('toolsdk-ai/toolsdk-mcp-registry', 'packages/other-tools-and-integrations/getmattered-mcp.json') },
  { key: 'raycast', name: 'raycast/extensions (MCP Registry extension)', page: 'https://github.com/raycast/extensions/tree/main/extensions/model-context-protocol-registry', url: raw('raycast/extensions', 'extensions/model-context-protocol-registry/src/registries/builtin/entries.ts') },
  { key: 'mcp-so', name: 'mcp.so (listed 9 Nov 2026)', page: 'https://mcp.so/servers/getmattered-mcp', url: 'https://mcp.so/servers/getmattered-mcp', versions: false },
  { key: 'cursor-directory', name: 'cursor.directory (edits by hand, no API)', page: 'https://cursor.directory/plugins/getmattered-mcp', url: 'https://cursor.directory/plugins/getmattered-mcp', versions: false },
  // Claimed 28 Oct 2026 and verified, but the site has no owner login, slug edit or delete (10 Nov), and
  // our one email went on 31 Oct (docs/rename/contact-ledger-2026-11-02.md). It still links aiapplyd.com/mcps.
  { key: 'musedirectory', name: 'musedirectory.ai', page: 'https://musedirectory.ai/connector/ai-applyd', url: 'https://musedirectory.ai/connector/ai-applyd', versions: false, waitsOn: 'the site: claimed and verified, no edit path; asked hello@musedirectory.ai 31 Oct' },
];

/**
 * Our open listing pull requests and issues, as owner/repo#number. A merged one
 * moves to LISTING_PAGES with the file that holds our line.
 */
export const LISTING_PRS = [
  'punkpeye/awesome-remote-mcp-servers#2806',
  'arthurspk/guiadoconhecimento#2',
  'punkpeye/awesome-mcp-servers#14789',
  'apappascs/mcp-servers-hub#36',
  'sylviangth/awesome-remote-mcp-servers#92',
  'hireblackout/awesome-mcp-servers#33',
  'e2b-dev/awesome-ai-agents#1632',
  'steven2358/awesome-generative-ai#1143',
  'lukasz-madon/awesome-remote-job#1124',
  'khalyomede/korru.app#1',
  'Kamalnrf/claude-plugins#130',
  'Kilo-Org/kilo-marketplace#374',
  'xai-org/plugin-marketplace#1238',
  'docker/mcp-registry#6054',
  'cline/marketplace#230',
].map((ref) => {
  const [repo, number] = ref.split('#');
  return { key: `pr:${ref}`, name: ref, page: `https://github.com/${repo}/issues/${number}`, url: `https://api.github.com/repos/${repo}/issues/${number}` };
});

const clip = text => (text.length > 100 ? `${text.slice(0, 97)}...` : text);

/** The text around the first old-name match, so a one-line HTML page still shows where it is. */
function oldNameContext(line) {
  const at = line.search(OLD_NAME);
  return clip(line.slice(Math.max(0, at - 30), at + 60).trim());
}

/** A merged list entry from its text: old name, old version, listed or not. */
export function listingVerdict(page, reading, { reference }) {
  const base = { cls: 'listing', key: page.key, name: page.name, shown: '', threshold: null, url: page.page };
  if (reading.status !== 200) return { ...base, detail: reading.status ? `HTTP ${reading.status}` : 'no answer', verdict: 'UNOBSERVED' };
  const lines = String(reading.text).split('\n');
  const old = lines.find(line => OLD_NAME.test(line));
  if (old) return { ...base, detail: `old name: ${oldNameContext(old)}`, shown: 'old name', verdict: 'old name' };
  const ours = lines.filter(line => /getmattered/i.test(line));
  if (ours.length === 0) return { ...base, detail: 'GetMattered is not on the page', verdict: 'not listed' };
  if (page.versions === false) return { ...base, detail: '', shown: 'listed', verdict: 'current' };
  const versions = ours.flatMap(line => [...line.matchAll(/(?<![\d.])v?(\d{1,2}\.\d{1,3}\.\d{1,3})(?![\d.])/g)].map(match => match[1]));
  const older = versions.filter(version => compareVersions(version, '1.0.0') >= 0 && compareVersions(version, reference) < 0).sort(compareVersions);
  if (older.length > 0) return { ...base, detail: `shows ${older[0]}, the newest release is ${reference}`, shown: older[0], verdict: 'drift' };
  return { ...base, detail: '', shown: 'listed', verdict: 'current' };
}

/** One of our pull requests or issues from api.github.com: its state, and the old name in our own text. */
export function prVerdict(pr, reading, { now }) {
  const base = { cls: 'pr', key: pr.key, name: pr.name, shown: '', threshold: null, url: reading.json?.html_url ?? pr.page };
  if (reading.status !== 200 || !reading.json?.state) return { ...base, detail: reading.status ? `HTTP ${reading.status}` : 'no answer', verdict: 'UNOBSERVED' };
  const { body, created_at: createdAt, pull_request: pull, state, title } = reading.json;
  const via = reading.via ? ` (read ${reading.via})` : '';
  if (OLD_NAME.test(`${title ?? ''}\n${body ?? ''}`)) return { ...base, detail: `the old name is in our own title or body: edit it (gh pr edit, no comment)${via}`, shown: state, verdict: 'old name' };
  if (state === 'open') {
    const days = createdAt ? Math.floor((now.getTime() - new Date(createdAt).getTime()) / DAY) : null;
    return { ...base, detail: `${days === null ? 'waits on the maintainer' : `open ${days} days, waits on the maintainer`}${via}`, openDays: days, shown: 'open', verdict: 'open' };
  }
  if (pull?.merged_at) return { ...base, detail: `merged ${pull.merged_at.slice(0, 10)}: move it to LISTING_PAGES${via}`, shown: 'merged', verdict: 'merged' };
  return { ...base, detail: `closed without a merge: we are not listed there${via}`, shown: 'closed', verdict: 'closed' };
}

/** The verdict of a listing that shows the old name while its fix waits on someone else. */
export const WAITING = 'old name, waiting';

/**
 * A listing that shows the old name only prints while its fix waits on someone
 * else: our fix PR is open (its own text may still need our edit, which its PR
 * row fails on), or the page names `waitsOn`. A fix PR that merged or closed, or
 * an unread one, leaves the listing failing.
 */
export function withFixWaits(rows, pages = LISTING_PAGES) {
  return rows.map((row) => {
    const page = row.cls === 'listing' && row.verdict === 'old name' ? pages.find(entry => entry.key === row.key) : null;
    if (!page) return row;
    if (page.waitsOn) return { ...row, detail: `${row.detail}; waits on ${page.waitsOn}`, verdict: WAITING };
    const pr = page.fixPr ? rows.find(entry => entry.key === `pr:${page.fixPr}`) : null;
    if (pr?.shown !== 'open') return row;
    const days = pr.openDays === null || pr.openDays === undefined ? '' : ` ${pr.openDays} days`;
    return { ...row, detail: `${row.detail}; fix PR ${page.fixPr} open${days}, waits on the maintainer`, verdict: WAITING };
  });
}

export const thresholdHours = row => row.thresholdHours ?? (row.cls === 'gate' ? 6 : 7 * 24);

/**
 * When the first release newer than `shown` came out, from npm publish times
 * ([{ version, at }]); the newest version is dated by `referenceAt` when it has
 * no release yet. Null when no date is known.
 */
export function behindSince(shown, releases, reference, referenceAt) {
  const newer = releases
    .filter(release => compareVersions(release.version, shown) > 0 && compareVersions(release.version, reference) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version));
  return newer[0]?.at ?? referenceAt ?? null;
}

/** One row's verdict from its reading ({ status, text, json }). */
export function rowVerdict(row, reading, { reference, releases, referenceAt, now }) {
  const base = { cls: row.cls, key: row.key, name: row.name, shown: '', threshold: thresholdHours(row), url: typeof row.url === 'function' ? row.url(reference) : row.url };
  if (reading.status !== 200) return { ...base, detail: reading.status ? `HTTP ${reading.status}` : 'no answer', verdict: 'UNOBSERVED' };
  let parsed;
  try {
    parsed = row.parse({ json: reading.json, lastModified: reading.lastModified ?? null, now, reference, text: reading.text });
  } catch {
    parsed = null;
  }
  if (!parsed) return { ...base, detail: 'page read, version not found', verdict: 'UNOBSERVED' };
  if (parsed.held) return { ...base, detail: parsed.held, verdict: 'HELD' };
  if (parsed.listed === false) return { ...base, detail: 'not on the page', verdict: 'not listed' };
  if (!parsed.version) return { ...base, detail: 'listed, no version shown', shown: 'listed', verdict: 'current' };
  const shown = parsed.version;
  if (parsed.problem) return { ...base, detail: parsed.problem, shown, verdict: 'drift' };
  if (compareVersions(shown, reference) >= 0) return { ...base, detail: '', shown, verdict: 'current' };
  const since = behindSince(shown, releases, reference, referenceAt);
  if (!since) return { ...base, detail: `behind ${reference}, release date unknown`, shown, verdict: 'drift' };
  const hours = Math.max(0, (now.getTime() - new Date(since).getTime()) / HOUR);
  const behind = `behind ${reference} for ${hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} days`}`;
  return { ...base, detail: behind, shown, verdict: hours <= base.threshold ? 'lagging' : 'drift' };
}

/** A gate row fails the run unless it is current or lagging. */
export const gateFailures = rows => rows.filter(row => row.cls === 'gate' && row.verdict !== 'current' && row.verdict !== 'lagging');

/** The old name on a listing or in our own PR text, or an old version on a listing line, also fails it. */
export const listingFailures = rows => rows.filter(row => row.verdict === 'old name' || (row.cls === 'listing' && row.verdict === 'drift'));

/** Every row that fails the run. Follower, manual, waiting-listing and PR-state rows only print. */
export const runFailures = rows => [...gateFailures(rows), ...listingFailures(rows)];

const waiting = (rows) => {
  const names = rows.filter(row => row.verdict === WAITING).map(row => row.name);
  return names.length > 0 ? ['', `Old name, waiting on someone else: ${names.join(', ')}.`] : [];
};

const hoursText = hours => (hours === null ? '-' : hours % 24 === 0 ? `${hours / 24} d` : `${hours} h`);

/** The issue body: one table, newest release first. */
export function renderIssue(rows, { reference, now }) {
  const failed = gateFailures(rows);
  const listed = listingFailures(rows);
  const lines = [
    `Read ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC by .github/workflows/drift.yml. Newest release: ${reference} (main).`,
    '',
    failed.length > 0 ? `**Core surfaces behind or unread:** ${failed.map(row => row.name).join(', ')}.` : 'Core surfaces: all current.',
    '',
    listed.length > 0 ? `**Old name or old version on a listing:** ${listed.map(row => row.name).join(', ')}.` : 'Listings and our pull requests: no old name or old version that we can fix.',
    ...waiting(rows),
    '',
    'Gate rows fail the run (exit 1). The old name or an old version on a listing, or the old name in our own pull request text, fails it too (exit 3), unless the listing\'s fix waits on its maintainer or site ("old name, waiting"). Other rows only print. UNOBSERVED means the read was blocked or unparsed; it is never a pass.',
    '',
    '| Platform | Class | Shows | Verdict | Threshold | Detail |',
    '|---|---|---|---|---|---|',
    ...rows.map(row => `| [${row.name}](${row.url}) | ${row.cls} | ${row.shown || '-'} | ${row.verdict} | ${hoursText(row.threshold)} | ${row.detail || '-'} |`),
    '',
    'This issue body is rewritten on every run. It never gets comments.',
    '',
  ];
  return lines.join('\n');
}

async function fetchOnce(url, headers) {
  try {
    const response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { json, lastModified: response.headers.get('last-modified'), status: response.status, text };
  } catch {
    return { json: null, lastModified: null, status: 0, text: '' };
  }
}

/**
 * One GET. api.github.com gets the run's token; a 403 to the token is read once
 * more without it, and the reading says so (`via`), so a row shows which path
 * answered.
 */
export async function readUrl(url, { fetcher = fetchOnce, token = env.GITHUB_TOKEN ?? env.GH_TOKEN } = {}) {
  const headers = { Accept: 'application/json, text/html;q=0.9', 'User-Agent': 'getmattered-mcp-drift' };
  if (!token || !url.startsWith('https://api.github.com/')) return fetcher(url, headers);
  const first = await fetcher(url, { ...headers, Authorization: `Bearer ${token}` });
  if (first.status !== 403) return first;
  const second = await fetcher(url, headers);
  return second.status === 200 ? { ...second, via: 'without the token, which got 403' } : first;
}

export async function readDrift({ fetchReading = readUrl, now = new Date() } = {}) {
  const main = await fetchReading(REFERENCE_URLS.mainPackage);
  const reference = main.json?.version;
  if (main.status !== 200 || !SEMVER.test(reference ?? '')) throw new Error(`the mirror's main package.json is unreadable (HTTP ${main.status}): UNOBSERVED`);
  const releasesReading = await fetchReading(REFERENCE_URLS.releases);
  const releases = Object.entries(releasesReading.json?.time ?? {})
    .filter(([version]) => SEMVER.test(version))
    .map(([version, at]) => ({ at, version }));
  let referenceAt = releases.find(release => release.version === reference)?.at ?? null;
  if (!referenceAt) referenceAt = (await fetchReading(REFERENCE_URLS.mainCommit)).json?.commit?.committer?.date ?? null;
  const rows = [];
  for (const row of PLATFORMS) {
    const url = typeof row.url === 'function' ? row.url(reference) : row.url;
    let reading = await fetchReading(url);
    if (reading.status === 404 && row.fallbackUrl) reading = await fetchReading(row.fallbackUrl);
    rows.push(rowVerdict(row, reading, { now, reference, referenceAt, releases }));
  }
  for (const page of LISTING_PAGES) rows.push(listingVerdict(page, await fetchReading(page.url), { reference }));
  for (const pr of LISTING_PRS) rows.push(prVerdict(pr, await fetchReading(pr.url), { now }));
  return { reference, rows: withFixWaits(rows) };
}

/** 1 when a core surface fails, 3 when only listing or PR rows fail, 0 otherwise. */
export const exitCode = rows => (gateFailures(rows).length > 0 ? 1 : listingFailures(rows).length > 0 ? 3 : 0);

async function main() {
  const now = new Date();
  const outIndex = argv.indexOf('--out');
  const { reference, rows } = await readDrift({ now });
  const body = renderIssue(rows, { now, reference });
  if (outIndex !== -1) writeFileSync(argv[outIndex + 1], body);
  stdout.write(body);
  const gate = gateFailures(rows);
  const listed = listingFailures(rows);
  if (gate.length > 0) console.error(`platform-drift: core surface behind or unread: ${gate.map(row => `${row.key} ${row.verdict}`).join(', ')}`);
  if (listed.length > 0) console.error(`platform-drift: old name or old version we can fix: ${listed.map(row => `${row.key} ${row.verdict}`).join(', ')}`);
  exit(exitCode(rows));
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main().catch((error) => {
    console.error(`platform-drift: ${error.message}`);
    exit(2);
  });
}
