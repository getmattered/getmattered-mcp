/**
 * The release.yml build gate on the words a store or a model reads: every skill
 * and the text fields of every manifest. OpenAI's MCP scan held tools on
 * 7 Nov 2026 for "Apply only through GetMattered ... never by email or another
 * connector", and mcpprobe flagged text that orders the model. A skill may give
 * the model steps; neither a skill nor a manifest may compare GetMattered with
 * another tool or channel, or order the model about which tool to use.
 *
 *   node scripts/wording-lint.mjs        exit 1 and one line per finding
 *
 * The monorepo test packages/mcp-server/src/__tests__/tool-descriptions-describe-the-tool.test.ts
 * holds the same English rules for tool descriptions in every locale.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';

/** Comparisons with another tool or channel, and orders about which one to use. */
export const RULES = [
  /\bonly (?:through|via|with|in|on) /i,
  /\binstead\b/i,
  /\brather than\b/i,
  /\bprefer(?:s|red|ably)?\b/i,
  /\bnever use\b/i,
  /\bdo not use\b/i,
  /\bdon't use\b/i,
  /\bother (?:tools?|plugins?|connectors?|apps?|clients?|channels?|services?)\b/i,
  /\banother (?:tool|plugin|connector|app|client|channel|service)\b/i,
  /\balternatives?\b/i,
  /\bbetter than\b/i,
  /\bunlike\b/i,
  /\bmust\b(?!-)/i,
  /\balways\b/i,
  /\b(?:the )?(?:model|assistant|AI|LLM) (?:should|shall|needs to|has to)\b/i,
  /\bappl(?:y|ies|ying|ication)s? (?:by|via|through|over) e-?mail\b/i,
  /\bGetMattered only\b|\bGetMattered \S+ only\b|\bGetMattered \S+ \S+ only\b/i,
  /\bonly (?:GetMattered|this (?:plugin|app|connector|tool))\b/i,
];

/** Manifests at the package root and in the plugin folder. */
export const MANIFESTS = [
  'package.json',
  'server.json',
  'manifest.json',
  'lhm.plugin.json',
  'gemini-extension.json',
  'plugins/getmattered/plugin.json',
  'plugins/getmattered/.claude-plugin/plugin.json',
  'plugins/getmattered/.codex-plugin/plugin.json',
  'plugins/getmattered/.cursor-plugin/plugin.json',
  'plugins/getmattered/.antigravity-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
];

/** Manifest keys whose values a store or a model reads as prose. */
const PROSE_KEYS = /^(?:description|long_description|longDescription|shortDescription|tagline|release_notes|displayName|display_name|title|defaultPrompt|capabilities|summary)$/;

export function sentencesOf(text) {
  return String(text).split(/(?<=[.!?:;])\s+/).map(sentence => sentence.trim()).filter(Boolean);
}

/** Every rule `text` breaks, as "<rule> in "<sentence>"". */
export function findings(text) {
  return sentencesOf(text).flatMap(sentence => RULES.filter(rule => rule.test(sentence)).map(rule => `${rule} in "${sentence}"`));
}

/** The prose strings of a parsed manifest, as [json path, text]. */
export function proseOf(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((item, index) => proseOf(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const here = path ? `${path}.${key}` : key;
    if (PROSE_KEYS.test(key)) {
      if (typeof child === 'string') return [[here, child]];
      if (Array.isArray(child)) return child.filter(item => typeof item === 'string').map((item, index) => [`${here}[${index}]`, item]);
    }
    return proseOf(child, here);
  });
}

const skillFiles = (root, dir) => {
  const base = join(root, dir);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(base, entry.name, 'SKILL.md')))
    .map(entry => `${dir}/${entry.name}/SKILL.md`);
};

/** Every finding under `root` (the bridge folder), as "<file>: <finding>". */
export function lintTree(root) {
  const out = [];
  for (const file of [...skillFiles(root, 'skills'), ...skillFiles(root, 'plugins/getmattered/skills')]) {
    for (const finding of findings(readFileSync(join(root, file), 'utf8'))) out.push(`${file}: ${finding}`);
  }
  for (const file of MANIFESTS.filter(path => existsSync(join(root, path)))) {
    for (const [path, text] of proseOf(JSON.parse(readFileSync(join(root, file), 'utf8')))) {
      for (const finding of findings(text)) out.push(`${file} ${path}: ${finding}`);
    }
  }
  return out;
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  const found = lintTree(argv[2] ?? '.');
  for (const line of found) console.error(line);
  if (found.length > 0) {
    console.error(`wording-lint: ${found.length} finding(s). Describe what GetMattered does; do not compare it or order the model.`);
    exit(1);
  }
  console.log('wording-lint: skills and manifests describe GetMattered, with no comparisons and no orders to the model.');
}
