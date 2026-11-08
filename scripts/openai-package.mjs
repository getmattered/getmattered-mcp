/**
 * Builds the ZIP that the OpenAI plugin portal accepts for the ChatGPT app.
 *
 *   node scripts/openai-package.mjs [out-dir]      (default: release-artifacts)
 *   -> <out-dir>/getmattered-<version>-openai.zip
 *
 * OpenAI takes only the Codex layout at the ZIP root: .codex-plugin/plugin.json,
 * .mcp.json, skills/ and assets/, all from plugins/getmattered. A ZIP of the whole
 * plugin folder fails: a root plugin.json plus mcp.json reads as a server change,
 * which an existing plugin cannot make.
 *
 * The release workflow attaches the ZIP to the GitHub release. Uploading it to
 * platform.openai.com/plugins stays a human (or agent Chrome) step: OpenAI has no
 * upload API. The bytes are deterministic, so the same tree always gives the same ZIP.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';

export const PLUGIN_DIR = 'plugins/getmattered';
const DRAFT_MARKER = 'DRAFT: write this release line';

export const packageFileName = version => `getmattered-${version}-openai.zip`;

/** Every file the package holds, relative to the plugin folder, sorted. */
export function packagePaths(pluginDir) {
  const walk = dir => readdirSync(join(pluginDir, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  });
  return ['.codex-plugin/plugin.json', '.mcp.json', ...walk('skills'), ...walk('assets')].sort();
}

/** What would make OpenAI refuse the package, or ship the wrong text. Empty means it is ready. */
export function packageProblems(paths, codexManifest, version) {
  const problems = [];
  if (codexManifest.version !== version) problems.push(`.codex-plugin/plugin.json is ${codexManifest.version}, the package is ${version}`);
  const notes = codexManifest.extensions?.['com.openai']?.publication?.release_notes ?? '';
  if (!notes.startsWith(`${version}: `)) problems.push(`release_notes must start with "${version}: "`);
  if (notes.includes(DRAFT_MARKER)) problems.push('release_notes are still a draft');
  const ui = codexManifest.interface ?? {};
  const referenced = [ui.logo, ui.composerIcon, codexManifest.extensions?.['com.openai']?.onboardingSkill].filter(Boolean);
  for (const ref of referenced) {
    if (!paths.includes(ref.replace(/^\.\//, ''))) problems.push(`${ref} is named in the manifest but not in the package`);
  }
  for (const forbidden of ['plugin.json', 'mcp.json']) {
    if (paths.includes(forbidden)) problems.push(`${forbidden} at the root reads as a server change`);
  }
  if (!paths.some(path => path.startsWith('skills/') && path.endsWith('/SKILL.md'))) problems.push('no skills');
  return problems;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 1980-01-01 00:00, the zero of the DOS clock: no build time leaks into the bytes.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** A deflated ZIP of `files` ([path, bytes]), with a directory entry before each folder's files. */
export function zipFiles(files) {
  const dirs = new Set();
  for (const [path] of files) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(`${parts.slice(0, i).join('/')}/`);
  }
  const entries = [...[...dirs].map(path => [path, Buffer.alloc(0)]), ...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [path, bytes] of entries) {
    const name = Buffer.from(path, 'utf8');
    const isDir = path.endsWith('/');
    const data = isDir ? Buffer.alloc(0) : deflateRawSync(bytes, { level: 9 });
    const crc = isDir ? 0 : crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(isDir ? 0 : 8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014B50, 0);
    central.writeUInt16LE(0x031E, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(isDir ? 0 : 8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((isDir ? 0o40755 : 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** Builds the package from `root` (the bridge folder) into `outDir`; returns its path. */
export function buildOpenAiPackage(root, outDir) {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const pluginDir = join(root, PLUGIN_DIR);
  const paths = packagePaths(pluginDir);
  const problems = packageProblems(paths, JSON.parse(readFileSync(join(pluginDir, '.codex-plugin/plugin.json'), 'utf8')), version);
  if (problems.length > 0) throw new Error(`the OpenAI package is not ready: ${problems.join('; ')}`);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, packageFileName(version));
  writeFileSync(out, zipFiles(paths.map(path => [path, readFileSync(join(pluginDir, path))])));
  return out;
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    console.log(buildOpenAiPackage('.', argv[2] ?? 'release-artifacts'));
  } catch (error) {
    console.error(`openai-package: ${error.message}`);
    exit(1);
  }
}
