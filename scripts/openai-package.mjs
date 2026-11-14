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
 * platform.openai.com/plugins ("Upload plugin to make changes") stays a human (or
 * agent Chrome) step: OpenAI has no upload API. The release asks for it only when
 * the package hash changes (release-steps.mjs reminderSteps). Tool changes need no
 * upload: OpenAI scans the hosted server daily and publishes the tool updates that
 * pass its checks. The bytes are deterministic, so the same tree always gives the
 * same ZIP.
 *
 * portalProblems() holds the rules OpenAI's upload checks name, so a skill or
 * metadata edit that the portal would refuse fails here, at the push, and never at
 * the upload: developers.openai.com/plugins/deploy/submission-errors and
 * developers.openai.com/plugins/deploy/submission, both read 14 Nov 2026.
 */
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/** The listing categories OpenAI accepts (submission-errors, "Listing and interface errors"). */
export const CATEGORIES = ['Productivity', 'Creativity', 'Developer Tools', 'Business & Operations', 'Data & Analytics', 'Communication', 'Education & Research', 'Security', 'Finance', 'Healthcare', 'Travel', 'Entertainment', 'Other'];

const oneLine = text => typeof text === 'string' && text.trim() !== '' && !/[\n\r\u2028\u2029]/.test(text);
/** A control character or a Unicode line or paragraph separator; tab, line feed and return pass. */
const hasControl = text => [...text].some((char) => {
  const code = char.codePointAt(0);
  return (code < 0x20 && ![0x09, 0x0A, 0x0D].includes(code)) || code === 0x7F || code === 0x2028 || code === 0x2029;
});

/** An HTTPS URL with a host, no credentials and at most `max` characters. */
function httpsUrl(text, max = 1024) {
  if (typeof text !== 'string' || text.length > max) return false;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Relative luminance of #RRGGBB, for the 2:1 contrast rule against white. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * What OpenAI's final submission checks refuse in `.codex-plugin/plugin.json`:
 * identity, the listing fields with their lengths, the four HTTPS URLs a remote
 * MCP needs, the review test cases (exactly 5 positive, 3 negative), and fields a
 * public package may not carry.
 */
export function manifestProblems(manifest) {
  const problems = [];
  const ui = manifest.interface ?? {};
  const openai = manifest.extensions?.['com.openai'] ?? {};
  const limit = (label, text, max, single = true) => {
    if (single ? !oneLine(text) : !(typeof text === 'string' && text.trim())) problems.push(`${label} is missing${single ? ' or not one line' : ''}`);
    else if (text.length > max) problems.push(`${label} is ${text.length} characters, the limit is ${max}`);
    else if (hasControl(text)) problems.push(`${label} has a control character`);
  };
  if (!/^[a-z\d][\w-]{0,63}$/i.test(manifest.name ?? '')) problems.push('name must be 1 to 64 ASCII letters, digits, _ or -');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? '')) problems.push('version is not MAJOR.MINOR.PATCH');
  limit('description', manifest.description, 1024, false);
  limit('author.name', manifest.author?.name, 120);
  limit('interface.displayName', ui.displayName, 30);
  limit('interface.shortDescription', ui.shortDescription, 30);
  limit('interface.longDescription', ui.longDescription, 4000, false);
  limit('interface.developerName', ui.developerName, 80);
  if (!CATEGORIES.includes(ui.category)) problems.push(`interface.category "${ui.category}" is not an OpenAI category`);
  const capabilities = ui.capabilities ?? [];
  if (!Array.isArray(capabilities) || capabilities.length === 0 || capabilities.length > 20) problems.push('interface.capabilities needs 1 to 20 entries');
  else capabilities.forEach((entry, index) => limit(`interface.capabilities[${index}]`, entry, 120));
  const prompts = ui.defaultPrompt ?? [];
  if (prompts.length > 3) problems.push('interface.defaultPrompt has more than 3 prompts');
  prompts.forEach((entry, index) => limit(`interface.defaultPrompt[${index}]`, entry, 128));
  if (new Set(prompts.map(entry => String(entry).trim().toLowerCase().replace(/\s+/g, ' '))).size !== prompts.length) problems.push('interface.defaultPrompt repeats a prompt');
  if (prompts.some(entry => /@\w/.test(entry))) problems.push('interface.defaultPrompt has an @mention');
  for (const key of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
    const url = ui[key];
    if (!httpsUrl(url)) problems.push(`interface.${key} must be an HTTPS URL of at most 1024 characters with no credentials`);
  }
  for (const key of ['brandColor', 'brandColorDark']) {
    if (ui[key] === undefined) continue;
    if (!/^#[\da-f]{6}$/i.test(ui[key])) problems.push(`interface.${key} is not #RRGGBB`);
    else if (key === 'brandColor' && 1.05 / (luminance(ui[key]) + 0.05) < 2) problems.push('interface.brandColor is below 2:1 contrast against white');
    else if (key === 'brandColorDark' && (luminance(ui[key]) + 0.05) / (luminance('#212121') + 0.05) < 2) problems.push('interface.brandColorDark is below 2:1 contrast against #212121');
  }
  for (const key of ['logo', 'composerIcon']) {
    if (!ui[key]) problems.push(`interface.${key} is required and must name a square image`);
  }
  if (manifest.skills !== './skills/') problems.push('skills must be "./skills/"');
  if (manifest.mcpServers !== './.mcp.json') problems.push('mcpServers must be "./.mcp.json"');
  for (const key of ['apps', 'hooks']) {
    if (manifest[key] !== undefined || openai[key] !== undefined) problems.push(`${key} cannot be in a public package`);
  }
  const review = openai.review ?? {};
  for (const key of ['test_credentials', 'reviewer_instructions']) {
    if (review[key] !== undefined || openai[key] !== undefined) problems.push(`${key} cannot be in the ZIP; enter it in the portal`);
  }
  const { negative = [], positive = [] } = review.test_cases ?? {};
  if (positive.length !== 5) problems.push(`review needs exactly 5 positive test cases, has ${positive.length}`);
  if (negative.length !== 3) problems.push(`review needs exactly 3 negative test cases, has ${negative.length}`);
  positive.forEach((test, index) => {
    for (const key of ['description', 'prompt', 'tools_triggered', 'expected_behavior']) {
      if (!String(test?.[key] ?? '').trim()) problems.push(`positive test case ${index + 1} has no ${key}`);
    }
  });
  negative.forEach((test, index) => {
    for (const key of ['description', 'prompt']) {
      if (!String(test?.[key] ?? '').trim()) problems.push(`negative test case ${index + 1} has no ${key}`);
    }
  });
  if (!httpsUrl(review.demo_recording_url, 2048)) problems.push('review.demo_recording_url must be an HTTPS link');
  return problems;
}

/** `.mcp.json`: one remote HTTPS server (the portal connects one), no headers. */
export function mcpProblems(config) {
  const servers = Object.entries(config?.mcpServers ?? {});
  if (servers.length !== 1) return [`.mcp.json must declare exactly one server, has ${servers.length}`];
  const [name, server] = servers[0];
  const problems = [];
  if (!name.trim()) problems.push('.mcp.json has a server with no name');
  if (!httpsUrl(server?.url, 2048)) problems.push(`.mcp.json ${name} url must be a public HTTPS URL`);
  if (server?.headers && Object.keys(server.headers).length > 0) problems.push(`.mcp.json ${name} has headers; a public submission refuses them`);
  for (const secret of ['client_secret', 'clientSecret']) {
    if (JSON.stringify(server).includes(`"${secret}"`)) problems.push(`.mcp.json ${name} holds a client secret`);
  }
  return problems;
}

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** One `key: value` line of a SKILL.md front matter, or null. */
const frontValue = (front, key) => front.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))?.[1].trim().replace(/^(['"])(.*)\1$/, '$2') ?? null;

/**
 * The skill rules: each skill is a real folder right under skills/ with a SKILL.md
 * whose front matter names it (unique, `getmattered:<name>` at most 64 characters)
 * and describes it in at most 1024 characters, with instructions below. `skills`
 * is [[folder, SKILL.md text]]; `strays` are files or links directly under skills/.
 */
export function skillProblems(skills, strays = [], pluginName = 'getmattered') {
  const problems = strays.map(stray => `skills/${stray} is not a skill folder`);
  const names = new Set();
  for (const [folder, text] of skills) {
    if (folder.startsWith('.')) problems.push(`skills/${folder} is hidden`);
    const match = String(text).match(FRONT);
    if (!match) {
      problems.push(`skills/${folder}/SKILL.md has no front matter`);
      continue;
    }
    const [, front, body] = match;
    const name = frontValue(front, 'name');
    const description = frontValue(front, 'description');
    if (!name) problems.push(`skills/${folder}/SKILL.md has no name`);
    else if (`${pluginName}:${name}`.length > 64) problems.push(`skills/${folder}: "${pluginName}:${name}" is over 64 characters`);
    else if (names.has(name)) problems.push(`skills/${folder}: the name ${name} is used twice`);
    if (name) names.add(name);
    if (!description) problems.push(`skills/${folder}/SKILL.md has no description`);
    else if (description.length > 1024) problems.push(`skills/${folder}/SKILL.md description is ${description.length} characters, the limit is 1024`);
    if (!body.trim()) problems.push(`skills/${folder}/SKILL.md has no instructions`);
    if (/^metadata:/m.test(front)) problems.push(`skills/${folder}/SKILL.md has metadata, which the portal ignores`);
  }
  if (skills.length === 0) problems.push('no skills');
  return problems;
}

/** A branding image: PNG, square, 48 to 4096 pixels a side, at most 5 MiB. */
export function imageProblems(path, bytes) {
  if (!path.endsWith('.png')) return [`${path}: only PNG is checked here; use a PNG`];
  if (bytes.length > 5 * 1024 * 1024) return [`${path} is over 5 MiB`];
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return [`${path} is not a PNG`];
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== height) return [`${path} is ${width}x${height}, not square`];
  if (width < 48 || width > 4096) return [`${path} is ${width} pixels a side, the range is 48 to 4096`];
  return [];
}

/** Every portal rule over the plugin folder on disk. Empty means OpenAI's upload checks have nothing to refuse. */
export function portalProblems(pluginDir) {
  const manifest = JSON.parse(readFileSync(join(pluginDir, '.codex-plugin/plugin.json'), 'utf8'));
  const entries = readdirSync(join(pluginDir, 'skills'), { withFileTypes: true });
  const strays = entries.filter(entry => !entry.isDirectory()).map(entry => entry.name);
  const skills = entries.filter(entry => entry.isDirectory()).map(entry => [entry.name, readFileSync(join(pluginDir, 'skills', entry.name, 'SKILL.md'), 'utf8')]);
  const links = packagePaths(pluginDir).filter(path => lstatSync(join(pluginDir, path)).isSymbolicLink()).map(path => `${path} is a symlink; the ZIP takes regular files only`);
  const ui = manifest.interface ?? {};
  const images = [...new Set([ui.logo, ui.composerIcon].filter(Boolean))].flatMap(ref => imageProblems(ref, readFileSync(join(pluginDir, ref))));
  return [
    ...manifestProblems(manifest),
    ...mcpProblems(JSON.parse(readFileSync(join(pluginDir, '.mcp.json'), 'utf8'))),
    ...skillProblems(skills, strays, manifest.name),
    ...images,
    ...links,
  ];
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
  const problems = [...packageProblems(paths, JSON.parse(readFileSync(join(pluginDir, '.codex-plugin/plugin.json'), 'utf8')), version), ...portalProblems(pluginDir)];
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
