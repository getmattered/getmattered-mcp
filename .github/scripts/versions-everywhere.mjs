/**
 * Prints the "Versions everywhere" section of the "vX: human steps" issue: every place a
 * GetMattered release shows up, who owns it and how to fix it when it lags.
 *
 * The list is ../release-surfaces.json, a copy of RELEASE_SURFACES in GetMattered's
 * monorepo (packages/shared/src/constants/release-surfaces.ts). A test there keeps the two
 * equal, so this issue, the hourly release watch and the verify:ship row name the same
 * surfaces. The section has no checkboxes on purpose: the hourly watch and the release
 * checklist read every `- [ ]` line as a step a person owes.
 *
 *   node .github/scripts/versions-everywhere.mjs <version>
 */
import { readFileSync } from 'node:fs';
import { argv, exit, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STAGE_TEXT = {
  'gone': 'closed by the vendor, report only',
  'hand': 'a person publishes it',
  'release': 'the pipeline publishes it',
  'review': 'vendor review, never alerts',
  'vendor-queue': 'vendor queue, never alerts',
};

const cell = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');

/** The markdown section for release `version`: one table row per surface. */
export function versionsEverywhereSection(surfaces, version) {
  const rows = surfaces.map((surface) => {
    const owed = surface.product === 'mcp' ? `v${version}` : 'the app version on main';
    return `| ${cell(surface.name)} | ${owed} | ${surface.owner} | ${STAGE_TEXT[surface.stage] ?? surface.stage} | ${cell(surface.fix.replaceAll('<V>', version))} |`;
  });
  return [
    '',
    '## Versions everywhere',
    '',
    `Every place this release must show. A surface behind for more than 24 h sends one Telegram card and turns the verify:ship row "versions everywhere" red, except reviews, vendor queues and closed listings.`,
    '',
    '| Surface | Must show | Owner | Stage | Fix |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

export function readSurfaces(file = fileURLToPath(new URL('../release-surfaces.json', import.meta.url))) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  const version = argv[2];
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    console.error('usage: node .github/scripts/versions-everywhere.mjs <x.y.z>');
    exit(1);
  }
  stdout.write(versionsEverywhereSection(readSurfaces(), version));
}
