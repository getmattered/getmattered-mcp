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
 *   submission  we are not listed; it needs a submission. Prints only.
 *
 * Verdicts: current, lagging (behind, inside its threshold), drift (behind past
 * it), not listed, UNOBSERVED (blocked, unanswered or unparsed). A blocked read
 * is never a pass. Several sites block datacenter IPs, so from Actions their
 * rows read UNOBSERVED every day; those rows are not coverage.
 *
 * Thresholds: 6 h for gate rows, 48 h for the GitHub MCP gallery, 7 days for
 * everyone else. The clock starts when the first release newer than the
 * version a platform shows came out.
 *
 * Plain fetch only: no credentials, except GITHUB_TOKEN for api.github.com.
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
 * One row per platform. `parse({ text, json, reference })` answers
 * { version } or { listed: false } or { listed: true } (no version shown), plus
 * an optional `problem` that makes a gate row drift; null means unparsed.
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
    // The release pushes it with `lhm plugin update` once LOBEHUB_CREDENTIALS exists.
    cls: 'follower',
    key: 'lobehub',
    name: 'LobeHub (pushed by the release)',
    parse: ({ json }) => (json?.version ? { version: json.version } : null),
    url: 'https://market.lobehub.com/api/v1/plugins/getmattered-getmattered-mcp',
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
    // Not listed: the repo has gemini-extension.json and the topic, but the gallery never picked it up.
    cls: 'submission',
    key: 'gemini',
    name: 'Gemini CLI extensions gallery',
    parse: ({ json }) => {
      if (!Array.isArray(json)) return null;
      return json.some(entry => /getmattered/i.test(JSON.stringify(entry))) ? { listed: true } : { listed: false };
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
  const base = { cls: row.cls, key: row.key, name: row.name, shown: '', threshold: thresholdHours(row), url: row.url };
  if (reading.status !== 200) return { ...base, detail: reading.status ? `HTTP ${reading.status}` : 'no answer', verdict: 'UNOBSERVED' };
  let parsed;
  try {
    parsed = row.parse({ json: reading.json, reference, text: reading.text });
  } catch {
    parsed = null;
  }
  if (!parsed) return { ...base, detail: 'page read, version not found', verdict: 'UNOBSERVED' };
  if (parsed.listed === false) return { ...base, detail: row.cls === 'submission' ? 'needs a submission; why it is missing is UNOBSERVED' : 'not on the page', verdict: 'not listed' };
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

/** A gate row fails the run unless it is current or lagging. Other classes never fail it. */
export const gateFailures = rows => rows.filter(row => row.cls === 'gate' && row.verdict !== 'current' && row.verdict !== 'lagging');

const hoursText = hours => (hours % 24 === 0 ? `${hours / 24} d` : `${hours} h`);

/** The issue body: one table, newest release first. */
export function renderIssue(rows, { reference, now }) {
  const failed = gateFailures(rows);
  const lines = [
    `Read ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC by .github/workflows/drift.yml. Newest release: ${reference} (main).`,
    '',
    failed.length > 0 ? `**Core surfaces behind or unread:** ${failed.map(row => row.name).join(', ')}.` : 'Core surfaces: all current.',
    '',
    'Gate rows fail the run. Follower, manual and submission rows only print. UNOBSERVED means the read was blocked or unparsed; it is never a pass.',
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

async function readUrl(url) {
  const headers = { Accept: 'application/json, text/html;q=0.9', 'User-Agent': 'getmattered-mcp-drift' };
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (token && url.startsWith('https://api.github.com/')) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { json, status: response.status, text };
  } catch {
    return { json: null, status: 0, text: '' };
  }
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
  for (const row of PLATFORMS) rows.push(rowVerdict(row, await fetchReading(row.url), { now, reference, referenceAt, releases }));
  return { reference, rows };
}

async function main() {
  const now = new Date();
  const outIndex = argv.indexOf('--out');
  const { reference, rows } = await readDrift({ now });
  const body = renderIssue(rows, { now, reference });
  if (outIndex !== -1) writeFileSync(argv[outIndex + 1], body);
  stdout.write(body);
  const failed = gateFailures(rows);
  if (failed.length > 0) {
    console.error(`platform-drift: core surfaces behind or unread: ${failed.map(row => `${row.key} ${row.verdict}`).join(', ')}`);
    exit(1);
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main().catch((error) => {
    console.error(`platform-drift: ${error.message}`);
    exit(2);
  });
}
