/**
 * The steps of .github/workflows/release.yml that need logic, kept here so they
 * have tests (test/release-steps.test.mjs).
 *
 *   node scripts/release-steps.mjs check-tag <tag>         tag equals v<package.json version>
 *   node scripts/release-steps.mjs notes <version>         prints the CHANGELOG.md section
 *   node scripts/release-steps.mjs wait <surface> <version> [seconds]
 *   node scripts/release-steps.mjs has <surface> <version> exit 0 when already published
 *   node scripts/release-steps.mjs readback <version>      npm latest and registry latest
 *
 * Surfaces: card (the hosted server card), npm, registry.
 */
import { readFileSync } from 'node:fs';
import { argv, exit, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

export const DRAFT_MARKER = 'DRAFT: write this release line';
const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers/com.getmattered%2Fgetmattered/versions';

export const SURFACE_URLS = {
  card: () => 'https://mcp.getmattered.com/.well-known/mcp/server-card.json',
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
  throw new Error(`unknown surface ${surface}`);
}

/** The final read-back: npm `latest` and the registry's latest entry both are V, and the registry marks it latest. */
export function readbackProblems(version, npmLatest, registryLatest) {
  const problems = [];
  if (npmLatest?.version !== version) problems.push(`npm latest is ${npmLatest?.version ?? 'unreadable'}`);
  if (registryLatest?.server?.version !== version) problems.push(`registry latest is ${registryLatest?.server?.version ?? 'unreadable'}`);
  else if (registryLatest._meta?.['io.modelcontextprotocol.registry/official']?.isLatest !== true) problems.push('registry does not mark it latest');
  return problems;
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
    if (!(await waitFor(first, second, { seconds: Number(argv[5] ?? 900) }))) throw new Error(`${first} did not report ${second} in time`);
    return;
  }
  if (command === 'readback') {
    const npm = await read('https://registry.npmjs.org/getmattered-mcp/latest');
    const registry = await read(`${REGISTRY}/latest`);
    const problems = readbackProblems(first, npm.body, registry.body);
    if (problems.length > 0) throw new Error(problems.join('; '));
    stdout.write(`npm latest ${first}; registry latest ${first}, isLatest\n`);
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
