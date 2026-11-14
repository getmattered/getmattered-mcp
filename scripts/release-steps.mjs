/**
 * The steps of .github/workflows/release.yml that need logic, kept here so they
 * have tests (test/release-steps.test.mjs).
 *
 *   node scripts/release-steps.mjs check-tag <tag>         tag equals v<package.json version>
 *   node scripts/release-steps.mjs notes <version>         prints the CHANGELOG.md section
 *   node scripts/release-steps.mjs wait <surface> <version> [seconds]
 *   node scripts/release-steps.mjs has <surface> <version> exit 0 when already published
 *   node scripts/release-steps.mjs readback <version>      npm latest and registry latest (gate),
 *                                                          the GitHub MCP gallery (follower, never fails)
 *   node scripts/release-steps.mjs newer <tag>             prints superseded_by=<newest newer v* tag, or empty>
 *   node scripts/release-steps.mjs previous <tag>          prints the newest v* tag below <tag>, or nothing
 *   node scripts/release-steps.mjs assets <version> <names> exit 1 unless the release has exactly the expected files
 *   node scripts/release-steps.mjs tool-marker             prints the release-notes line that records the tool names
 *   node scripts/release-steps.mjs package-hash [ref]      prints the OpenAI package content hash at ref (default HEAD)
 *   node scripts/release-steps.mjs package-marker          prints the release-notes line that records that hash at HEAD
 *   node scripts/release-steps.mjs reminders <version> <previous tag> <previous notes file> [<previous issue body file>]
 *                                                          prints the "vX: human steps" issue body, or nothing
 *   node scripts/release-steps.mjs lobehub <generated> <out> writes lhm.plugin.json with the live tools, for `lhm plugin update`
 *
 * Surfaces: card (the hosted server card), npm, registry, lobehub.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { argv, exit, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

export const DRAFT_MARKER = 'DRAFT: write this release line';
const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers/com.getmattered%2Fgetmattered/versions';

export const SURFACE_URLS = {
  card: () => 'https://mcp.getmattered.com/.well-known/mcp/server-card.json',
  // ?version=<V> answers 404 (uncached) until LobeHub has V; the bare object is a
  // Cloudflare cache hit for up to 4 h and served 1.17.1 after 1.18.0 landed (13 Nov 2026).
  lobehub: version => `https://market.lobehub.com/api/v1/plugins/getmattered-getmattered-mcp?version=${version}`,
  npm: version => `https://registry.npmjs.org/getmattered-mcp/${version}`,
  registry: version => `${REGISTRY}/${version}`,
};

/** The body of `## <version>` in CHANGELOG.md, or an error when it is missing or still a draft. */
export function changelogSection(text, version) {
  const lines = text.split('\n');
  const start = lines.findIndex(line => line.trim() === `## ${version}`);
  if (start === -1) throw new Error(`CHANGELOG.md has no "## ${version}" section`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const body = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();
  if (!body) throw new Error(`the ${version} section of CHANGELOG.md is empty`);
  if (body.includes(DRAFT_MARKER)) throw new Error(`the ${version} section of CHANGELOG.md is still a draft`);
  return body;
}

const compareVersions = (a, b) => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
};

/**
 * The newest release tag above `tag` in `git ls-remote --tags --refs` output, or null.
 * A run for a replaced tag publishes nothing: npm and `gh release --latest` would
 * otherwise mark the older version latest. The newer release carries its changes.
 */
export function newerTag(tag, lsRemote) {
  const names = lsRemote.split('\n').map(line => line.split('\t')[1]?.replace('refs/tags/', '') ?? '');
  const newer = names
    .filter(name => /^v\d+\.\d+\.\d+$/.test(name) && compareVersions(name.slice(1), tag.slice(1)) > 0)
    .sort((a, b) => compareVersions(a.slice(1), b.slice(1)));
  return newer.at(-1) ?? null;
}

/** The tag that started the run must be the package version. */
export function tagMatches(tag, pkg) {
  return tag === `v${pkg.version}`;
}

/** True once the surface reports `version`. */
export function surfaceHas(surface, version, reading) {
  if (reading.status !== 200 || !reading.body) return false;
  if (surface === 'card') return reading.body.serverInfo?.version === version;
  if (surface === 'npm') return reading.body.version === version;
  if (surface === 'registry') return reading.body.server?.version === version;
  if (surface === 'lobehub') return reading.body.version === version;
  throw new Error(`unknown surface ${surface}`);
}

/** What a surface showed on its last read, for the error when a wait runs out. */
export function readingText(surface, reading) {
  const body = reading?.body;
  const shown = surface === 'registry' ? body?.server?.version : surface === 'card' ? body?.serverInfo?.version : body?.version;
  const npmPin = surface === 'lobehub' && body?.artifacts?.npm?.version ? `, npm artifact ${body.artifacts.npm.version}` : '';
  return `HTTP ${reading?.status ?? 0}${shown ? `, version ${shown}` : ''}${npmPin}`;
}

/** The final read-back: npm `latest` and the registry's latest entry both are V, and the registry marks it latest. */
export function readbackProblems(version, npmLatest, registryLatest) {
  const problems = [];
  if (npmLatest?.version !== version) problems.push(`npm latest is ${npmLatest?.version ?? 'unreadable'}`);
  if (registryLatest?.server?.version !== version) problems.push(`registry latest is ${registryLatest?.server?.version ?? 'unreadable'}`);
  else if (registryLatest._meta?.['io.modelcontextprotocol.registry/official']?.isLatest !== true) problems.push('registry does not mark it latest');
  return problems;
}

/** The files every GitHub release carries: the OpenAI package and the Claude Desktop bundle. */
export const releaseAssets = version => [`getmattered-${version}-openai.zip`, `getmattered-${version}.mcpb`];

/** Why the release's asset list is wrong, or null. Order does not matter. */
export function assetProblem(version, names) {
  const want = releaseAssets(version).sort();
  const have = [...names].filter(Boolean).sort();
  return want.join(',') === have.join(',') ? null : `release assets are [${have.join(', ')}], expected [${want.join(', ')}]`;
}

/** The newest release tag below `tag` in `git ls-remote --tags --refs` output, or null. */
export function previousTag(tag, lsRemote) {
  const names = lsRemote.split('\n').map(line => line.split('\t')[1]?.replace('refs/tags/', '') ?? '');
  const older = names
    .filter(name => /^v\d+\.\d+\.\d+$/.test(name) && compareVersions(name.slice(1), tag.slice(1)) < 0)
    .sort((a, b) => compareVersions(a.slice(1), b.slice(1)));
  return older.at(-1) ?? null;
}

export const GALLERY_URL = 'https://api.mcp.github.com/v0.1/servers/com.getmattered%2Fgetmattered/versions/latest';

/**
 * The GitHub MCP gallery (VS Code, Copilot in JetBrains, Eclipse and Xcode) re-syncs
 * from the registry on its own clock, so it is a follower: it prints, it never
 * fails the release. Only /v0.1 honours the server name; /v0 answers with other servers.
 */
export function galleryLine(version, reading) {
  const shown = reading?.status === 200 ? reading.body?.server?.version : null;
  if (!shown) return `GitHub MCP gallery unreadable (HTTP ${reading?.status ?? 0}): UNOBSERVED (follower)`;
  return shown === version ? `GitHub MCP gallery ${shown} (follower)` : `GitHub MCP gallery still ${shown}, syncs within 48 h (follower)`;
}

const TOOL_MARKER = /<!-- getmattered-tools: ([^>]*) -->/;

/** The hidden line the release notes carry, so the next release can compare tool names. */
export const toolMarker = names => `<!-- getmattered-tools: ${[...names].sort().join(' ')} -->`;

/** The tool names a release's notes recorded, or null when they recorded none. */
export function toolNamesFromNotes(notes) {
  const match = String(notes ?? '').match(TOOL_MARKER);
  return match ? match[1].split(' ').filter(Boolean).sort() : null;
}

const OPENAI_FILES = /^plugins\/getmattered\/(?:\.codex-plugin\/plugin\.json|\.mcp\.json|skills\/.+|assets\/.+)$/;

/**
 * A hash of what the OpenAI package shows (skills, metadata, assets), from
 * [path, bytes] pairs under plugins/getmattered. The version and release_notes
 * change every release, so they are left out: a release that changed neither
 * skills nor metadata nor assets keeps the hash and needs no upload.
 */
export function openaiContentHash(entries) {
  const hash = createHash('sha256');
  for (const [path, bytes] of [...entries].filter(([path]) => OPENAI_FILES.test(path)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    let data = bytes;
    if (path.endsWith('.codex-plugin/plugin.json')) {
      const manifest = JSON.parse(String(bytes));
      delete manifest.version;
      delete manifest.extensions?.['com.openai']?.publication?.release_notes;
      data = Buffer.from(JSON.stringify(manifest));
    }
    hash.update(`${path}\0${data.length}\0`).update(data);
  }
  return hash.digest('hex').slice(0, 16);
}

const PACKAGE_MARKER = /<!-- getmattered-openai-package: ([0-9a-f]{16}) -->/;

/**
 * The hidden line the release notes carry with the OpenAI package hash. GetMattered's
 * hourly release watch reads it to compare the live package with the one ChatGPT
 * publishes (packages/shared/src/lib/mcp-release-facts.ts packageMarker, same format).
 */
export const packageMarker = hash => `<!-- getmattered-openai-package: ${hash} -->`;

/** The OpenAI package hash a release's notes recorded, or null. */
export function packageHashFromNotes(notes) {
  return String(notes ?? '').match(PACKAGE_MARKER)?.[1] ?? null;
}

const UNUPLOADED_PACKAGE = /^- \[ \] ChatGPT package:.*\(([0-9a-f]+) to ([0-9a-f]+)\)/m;

/**
 * The package step a previous "vX: human steps" issue left unticked, or null: the
 * hash before that release's change and the hash it asked to upload. The newer
 * release carries the step on, so an upload that never happened is never lost
 * because the next release changed nothing.
 */
export function unuploadedPackage(issueBody) {
  const match = String(issueBody ?? '').match(UNUPLOADED_PACKAGE);
  return match ? { hashBefore: match[1], hashAsked: match[2] } : null;
}

/**
 * The OpenAI package files at a git ref, as [path, bytes] pairs. Paths are relative
 * to the current folder, so this runs at the mirror's root and in tools/mcp-bridge
 * of GetMattered's monorepo alike.
 */
function openaiEntriesAt(ref) {
  const listed = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', 'plugins/getmattered'], { encoding: 'utf8' });
  return listed.split('\n').filter(path => OPENAI_FILES.test(path)).map(path => [path, execFileSync('git', ['show', `${ref}:./${path}`], { maxBuffer: 64 * 1024 * 1024 })]);
}

/**
 * The human steps a release needs, each only when this release changed what it
 * shows. Glama has no write API: its Sync Server and Make Release stay a person
 * (or an on-demand `ab` job on Ava's Mac) every release. A value that could not
 * be read is null, and its step says UNOBSERVED instead of guessing.
 */
/**
 * Every Claude connector line ends with this. The mirror cannot read the review
 * state, and Sync or Save on a submission in review edits a listing that is in
 * review, which the owner forbids. GetMattered's hourly watch holds the line while
 * MCP_REVIEW_SURFACES records the review.
 */
export const CLAUDE_REVIEW_WAIT = 'WAIT while claude.ai/directory/manage shows the submission in review: leave this unticked and do it once the review has ended.';

/** The ChatGPT package line names the open draft it replaces, so an older draft is never submitted. */
const replaceDraft = version => `If an older package sits there as a draft, replace that draft with getmattered-${version}-openai.zip; never submit the older draft.`;

/**
 * The portal steps for a new package (developers.openai.com/plugins/deploy/submission,
 * "Updating the plugin package", read 14 Nov 2026). A tool change never asks for
 * this: OpenAI scans the hosted server daily and publishes the tool updates that
 * pass its checks, so no ChatGPT line is written for tools.
 */
const uploadSteps = 'Press "Upload plugin to make changes", wait for the Metadata & Skills checks (a skill scan can take up to 2 h), fix any finding in the repo and ship a new release, then Submit for review and Publish.';

export function reminderSteps({ version, toolsBefore, toolsNow, hashBefore, hashNow, carried = null }) {
  const steps = [];
  if (!toolsNow) {
    steps.push(`Claude connector listing: the server card was unreadable, so the tool names are UNOBSERVED. Compare them by hand; if they changed, press "Sync from server", then "Save and update submission" in claude.ai/directory/manage. ${CLAUDE_REVIEW_WAIT}`);
  } else if (!toolsBefore) {
    steps.push(`Claude connector listing: the previous release recorded no tool names (UNOBSERVED). Compare them by hand once; if they changed, press "Sync from server", then "Save and update submission" in claude.ai/directory/manage. ${CLAUDE_REVIEW_WAIT}`);
  } else {
    const added = toolsNow.filter(name => !toolsBefore.includes(name));
    const removed = toolsBefore.filter(name => !toolsNow.includes(name));
    if (added.length > 0 || removed.length > 0) {
      const what = [added.length > 0 ? `added ${added.join(', ')}` : null, removed.length > 0 ? `removed ${removed.join(', ')}` : null].filter(Boolean).join('; ');
      steps.push(`Claude connector listing: tool names changed (${what}). In claude.ai/directory/manage press "Sync from server", then "Save and update submission". ${CLAUDE_REVIEW_WAIT}`);
    }
  }
  // An upload the previous release asked for and nobody ticked: compare with what was there before it.
  const before = carried?.hashBefore ?? hashBefore;
  if (!hashNow || !before) {
    steps.push(`ChatGPT package: the content hash is UNOBSERVED. Compare skills, metadata and assets by hand; if they changed, upload getmattered-${version}-openai.zip at platform.openai.com/plugins. ${uploadSteps} ${replaceDraft(version)} Never while a review is open.`);
  } else if (hashNow !== before) {
    const why = carried ? `skills, metadata or assets changed, and the upload ${carried.from} asked for is still unticked` : 'skills, metadata or assets changed';
    steps.push(`ChatGPT package: ${why} (${before} to ${hashNow}). Upload getmattered-${version}-openai.zip from this release at platform.openai.com/plugins. ${uploadSteps} ${replaceDraft(version)} Never while a review is open.`);
  }
  steps.push(`Glama: in the server admin for getmattered/getmattered-mcp press "Sync Server", then "Make Release" ${version}. It has no API; an on-demand ab job on Ava's Mac can do it.`);
  return steps;
}

/** The body of the one "vX: human steps" issue, or an empty string when there is nothing to do. */
export function remindersBody(version, steps) {
  if (steps.length === 0) return '';
  return [`Release ${version} needs these steps. Tick each one when it is done.`, '', ...steps.map(step => `- [ ] ${step}`), ''].join('\n');
}

export const LOBEHUB_PLUGIN_URL = 'https://market.lobehub.com/api/v1/plugins/getmattered-getmattered-mcp';

/**
 * lhm.plugin.json for `lhm plugin update`: the committed fields (identifier,
 * name, version, description, links) over what `lhm plugin init --url` read
 * from the live server (tools, prompts, resources).
 *
 * `artifacts.npm` always names this release. Without it LobeHub kept the npm
 * artifact of its first listing: every version up to 1.18.0 advertised
 * getmattered-mcp@1.15.4 (read 13 Nov 2026). Other artifacts the listing already
 * has (the docker runtime) are kept from `live`, the current LobeHub reading.
 */
export function lobehubManifest(committed, generated, { live = null, packageName } = {}) {
  if (!packageName) throw new Error('lobehubManifest needs the npm package name');
  const artifacts = { ...live?.artifacts, ...generated.artifacts, ...committed.artifacts, npm: { packageName, version: committed.version } };
  return { ...committed, artifacts, prompts: generated.prompts ?? [], resources: generated.resources ?? [], tools: generated.tools ?? [] };
}

async function read(url) {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'getmattered-mcp-release' }, signal: AbortSignal.timeout(20_000) });
    return { body: response.ok ? await response.json() : null, status: response.status };
  } catch {
    return { body: null, status: 0 };
  }
}

/** Polls until the surface has the version; returns false at the deadline. */
export async function waitFor(surface, version, { seconds = 900, every = 15, fetchReading = read, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    if (surfaceHas(surface, version, await fetchReading(SURFACE_URLS[surface](version)))) return true;
    if (Date.now() >= deadline) return false;
    await sleep(every * 1000);
  }
}

async function main() {
  const [command, first, second] = argv.slice(2);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (command === 'check-tag') {
    if (!tagMatches(first, pkg)) throw new Error(`tag ${first} does not match package.json ${pkg.version}`);
    return;
  }
  if (command === 'notes') {
    stdout.write(`${changelogSection(readFileSync('CHANGELOG.md', 'utf8'), first)}\n`);
    return;
  }
  if (command === 'has') {
    exit(surfaceHas(first, second, await read(SURFACE_URLS[first](second))) ? 0 : 1);
  }
  if (command === 'wait') {
    if (!(await waitFor(first, second, { seconds: Number(argv[5] ?? 900) }))) {
      throw new Error(`${first} did not report ${second} in time; last read ${SURFACE_URLS[first](second)}: ${readingText(first, await read(SURFACE_URLS[first](second)))}`);
    }
    return;
  }
  if (command === 'newer') {
    // Throws when the remote does not answer: an unread tag list is never "no newer tag".
    const listed = execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin', 'v*'], { encoding: 'utf8', timeout: 60_000 });
    stdout.write(`superseded_by=${newerTag(first, listed) ?? ''}\n`);
    return;
  }
  if (command === 'readback') {
    const npm = await read('https://registry.npmjs.org/getmattered-mcp/latest');
    const registry = await read(`${REGISTRY}/latest`);
    const problems = readbackProblems(first, npm.body, registry.body);
    if (problems.length > 0) throw new Error(problems.join('; '));
    stdout.write(`npm latest ${first}; registry latest ${first}, isLatest; ${galleryLine(first, await read(GALLERY_URL))}\n`);
    return;
  }
  if (command === 'previous') {
    const listed = execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin', 'v*'], { encoding: 'utf8', timeout: 60_000 });
    stdout.write(`${previousTag(first, listed) ?? ''}\n`);
    return;
  }
  if (command === 'assets') {
    const problem = assetProblem(first, (second ?? '').split(','));
    if (problem) throw new Error(problem);
    stdout.write(`assets ${releaseAssets(first).join(', ')}\n`);
    return;
  }
  if (command === 'tool-marker') {
    const card = await read(SURFACE_URLS.card());
    const names = (card.body?.tools ?? []).map(tool => tool?.name).filter(Boolean);
    if (names.length === 0) throw new Error(`the server card listed no tools (HTTP ${card.status})`);
    stdout.write(`${toolMarker(names)}\n`);
    return;
  }
  if (command === 'package-hash') {
    stdout.write(`${openaiContentHash(openaiEntriesAt(first ?? 'HEAD'))}\n`);
    return;
  }
  if (command === 'package-marker') {
    stdout.write(`${packageMarker(openaiContentHash(openaiEntriesAt('HEAD')))}\n`);
    return;
  }
  if (command === 'reminders') {
    const previous = second;
    const readOptional = (file) => {
      try {
        return file ? readFileSync(file, 'utf8') : null;
      } catch {
        return null;
      }
    };
    const notes = readOptional(argv[5]);
    const left = unuploadedPackage(readOptional(argv[6]));
    const card = await read(SURFACE_URLS.card());
    const live = (card.body?.tools ?? []).map(tool => tool?.name).filter(Boolean).sort();
    let hashBefore = null;
    try {
      hashBefore = previous ? openaiContentHash(openaiEntriesAt(previous)) : null;
    } catch {
      hashBefore = null;
    }
    const steps = reminderSteps({
      carried: left && previous ? { from: previous, hashBefore: left.hashBefore } : null,
      hashBefore,
      hashNow: openaiContentHash(openaiEntriesAt('HEAD')),
      toolsBefore: toolNamesFromNotes(notes),
      toolsNow: live.length > 0 ? live : null,
      version: first,
    });
    stdout.write(remindersBody(first, steps));
    return;
  }
  if (command === 'lobehub') {
    const out = second;
    const committed = JSON.parse(readFileSync('lhm.plugin.json', 'utf8'));
    if (committed.version !== pkg.version) throw new Error(`lhm.plugin.json is ${committed.version}, package.json is ${pkg.version}`);
    const live = await read(LOBEHUB_PLUGIN_URL);
    const merged = lobehubManifest(committed, JSON.parse(readFileSync(first, 'utf8')), { live: live.body, packageName: pkg.name });
    if (merged.tools.length === 0) throw new Error('lhm plugin init read no tools from the live server');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`);
    stdout.write(`lhm.plugin.json ${merged.identifier}@${merged.version}: ${merged.tools.length} tools, npm artifact ${merged.artifacts.npm.packageName}@${merged.artifacts.npm.version}\n`);
    return;
  }
  throw new Error(`unknown command ${command}`);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main().catch((error) => {
    console.error(`release-steps: ${error.message}`);
    exit(1);
  });
}
