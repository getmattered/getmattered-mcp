/**
 * Keeps OUR open listing pull requests current. The release workflow clones each
 * fork branch over HTTPS, runs this, and pushes with that fork's deploy key only
 * when a file changed. The `listings` job also runs `xai` again to check the
 * commit that `listings-xai` built with xAI's scripts. Pushing the head branch
 * updates the open PR. It never opens a PR and never comments.
 *
 *   xai     xai-org/plugin-marketplace #1238, head getmattered/plugin-marketplace:add-aiapplyd.
 *           Their CONTRIBUTING: pin a full 40-character commit sha, regenerate
 *           .grok-plugin/plugin-index.json with their script, never hand-edit it.
 *           Runs only when plugins/getmattered changed between the pinned commit
 *           and the release commit. After #1238 merges, xAI's own bump bot repins.
 *   docker  docker/mcp-registry #6054, head whateverneveranywhere/mcp-registry:add-getmattered.
 *           Metadata only: server.yaml and readme.md from listings/docker. The icon
 *           URL points at the mirror's main branch, so a release that changed no
 *           listing text pushes nothing to a PR that waits for review (pinning it
 *           to each tag pushed an icon-only commit on every release, 13 Nov 2026).
 *   cline   cline/marketplace #230, head whateverneveranywhere/marketplace:add-aiapplyd.
 *           Text only: the two entry.json files from listings/cline.
 *
 *   node scripts/listing-prs.mjs pin <marketplace.json>
 *       prints the sha our xAI entry pins
 *   node scripts/listing-prs.mjs xai <branch marketplace.json> <upstream marketplace.json> <sha> <out>
 *       writes upstream's catalog with our entry, pinned to <sha>
 *   node scripts/listing-prs.mjs copy <docker|cline> <fork checkout> [--dry-run]
 *       copies listings/<fork> over the checkout; prints each file that differs
 *
 * The branch names still read add-aiapplyd. Renaming a PR head closes the PR,
 * so they stay: known old-name identifiers.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { argv, exit, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

export const ENTRY_NAME = 'getmattered';
const SHA = /^[0-9a-f]{40}$/;

export const FORKS = {
  cline: { branch: 'add-aiapplyd', pr: 'cline/marketplace#230', repo: 'whateverneveranywhere/marketplace' },
  docker: { branch: 'add-getmattered', pr: 'docker/mcp-registry#6054', repo: 'whateverneveranywhere/mcp-registry' },
  xai: { branch: 'add-aiapplyd', pr: 'xai-org/plugin-marketplace#1238', repo: 'getmattered/plugin-marketplace', upstream: 'xai-org/plugin-marketplace' },
};

/** Our entry in an xAI catalog, or null. */
export function ourEntry(catalogText) {
  return JSON.parse(catalogText).plugins?.find(plugin => plugin.name === ENTRY_NAME) ?? null;
}

/** The commit our xAI entry pins, or null. */
export const readPin = catalogText => ourEntry(catalogText)?.source?.sha ?? null;

const indent = (text, spaces) => text.split('\n').map(line => (line ? `${' '.repeat(spaces)}${line}` : line)).join('\n');

/**
 * Upstream's catalog text with our entry pinned to `sha`, changed only where our
 * entry is: their file mixes inline and expanded arrays, so it is never
 * re-serialized. When upstream already lists us (after the merge), only the sha
 * moves; otherwise our entry from the branch is added at the end of `plugins`.
 */
export function pinnedCatalog(branchText, upstreamText, sha) {
  if (!SHA.test(sha)) throw new Error(`"${sha}" is not a full 40-character commit sha`);
  const listed = ourEntry(upstreamText);
  let next;
  if (listed) {
    const at = upstreamText.search(new RegExp(`"name":\\s*"${ENTRY_NAME}"`));
    const pin = /("sha":\s*")[0-9a-f]{40}(")/g;
    pin.lastIndex = at;
    const found = pin.exec(upstreamText);
    if (!found) throw new Error('upstream lists getmattered without a sha');
    next = `${upstreamText.slice(0, found.index)}${found[1]}${sha}${found[2]}${upstreamText.slice(found.index + found[0].length)}`;
  } else {
    const entry = ourEntry(branchText);
    if (!entry) throw new Error('the fork branch has no getmattered entry');
    const pinned = { ...entry, source: { ...entry.source, sha } };
    const close = upstreamText.search(/\n {2}\]\n\}\s*$/);
    if (close === -1) throw new Error('cannot find the end of "plugins" in the upstream catalog');
    next = `${upstreamText.slice(0, close)},\n${indent(JSON.stringify(pinned, null, 2), 4)}${upstreamText.slice(close)}`;
  }
  if (readPin(next) !== sha) throw new Error('the pinned catalog does not pin the new sha');
  return next;
}

const walk = (root, dir = '') => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const path = dir ? `${dir}/${entry.name}` : entry.name;
  return entry.isDirectory() ? walk(root, path) : [path];
});

/** The listing files for a fork, as [path in the fork, text], exactly as committed. */
export function listingFiles(bridgeRoot, fork) {
  const base = join(bridgeRoot, 'listings', fork);
  return walk(base).sort().map(path => [path, readFileSync(join(base, path), 'utf8')]);
}

/** The listing files whose text differs from the fork checkout. */
export function changedFiles(files, checkout) {
  return files.filter(([path, text]) => {
    const target = join(checkout, path);
    return !existsSync(target) || readFileSync(target, 'utf8') !== text;
  }).map(([path]) => path);
}

function main() {
  const [command, first, second, third, fourth] = argv.slice(2);
  if (command === 'pin') {
    const sha = readPin(readFileSync(first, 'utf8'));
    if (!sha) throw new Error(`${first} pins no getmattered sha`);
    stdout.write(`${sha}\n`);
    return;
  }
  if (command === 'xai') {
    writeFileSync(fourth, pinnedCatalog(readFileSync(first, 'utf8'), readFileSync(second, 'utf8'), third));
    stdout.write(`pinned ${ENTRY_NAME} to ${third}\n`);
    return;
  }
  if (command === 'copy') {
    if (!['cline', 'docker'].includes(first)) throw new Error(`copy takes docker or cline, not ${first}`);
    const files = listingFiles('.', first);
    const changed = changedFiles(files, second);
    if (!argv.includes('--dry-run')) {
      for (const [path, text] of files.filter(([path]) => changed.includes(path))) {
        mkdirSync(dirname(join(second, path)), { recursive: true });
        writeFileSync(join(second, path), text);
      }
    }
    for (const path of changed) stdout.write(`${path}\n`);
    return;
  }
  throw new Error(`unknown command ${command}`);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`listing-prs: ${error.message}`);
    exit(1);
  }
}
