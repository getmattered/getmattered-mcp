/**
 * The leak rules, in one module for two gates:
 *   - GetMattered's open-source readiness gate (scripts/oss/check.mjs in the private repo imports it);
 *   - this package's tarball scan (scripts/scan-package.mjs), run before every npm publish.
 * Generic shapes only: this file names no person, address or key. Exact names come from an untracked
 * denylist file, or as sha256 hashes in HASHED_LITERALS, so a public copy of the list never names them.
 *
 * Plain Node ESM with no dependencies: the release workflow runs it with node, the private repo with bun.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Leak rules. Generic shapes only: the scanner itself names no person, address or key. */
export const LEAK_RULES = [
  { kind: 'personal email', re: /[\w.%+-]+@(?:gmail|googlemail|outlook|hotmail|live|icloud|me|yahoo|gmx|web|proton(?:mail)?)\.(?:com|de|net|me)\b/gi },
  { kind: 'German mobile number', re: /\+49[\s-]?1[5-7]\d[\s\d-]{6,12}\d/g },
  { kind: 'old product name', re: /ai[\s_-]?applyd(?![a-z])/gi },
  // eslint-disable-next-line security/detect-unsafe-regex -- the open-source gate's rule, unchanged; every repeat is bounded by a literal
  { kind: 'secret-shaped string', re: /AKIA[0-9A-Z]{16}|[sr]k_(?:live|test)_[0-9A-Za-z]{10,}|whsec_[0-9A-Za-z+/=]{20,}|phx_[0-9A-Za-z]{20,}|sk-ant-[\w-]{20,}|sk-or-v1-[0-9a-f]{20,}|AIza[\w-]{35}|ghp_[0-9A-Za-z]{30,}|github_pat_\w{22,}|xox[abp]-[0-9A-Za-z-]{10,}|-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { kind: 'Stripe object id', re: /\b(?:sub|cus|pi|ch|in|evt|price|prod|si|pm|seti|txn|re|dp|po)_(?=[0-9A-Za-z]*\d)(?!example[0-9a-f]{10}\b)[0-9A-Za-z]{14,}\b/g },
  { kind: 'Cloudflare account id', re: /"account_id"\s*:\s*"(?!0{32})[0-9a-f]{32}"/g },
  // After the export rewrite the only relay address is user@relay.example.com; any other local part
  // is a real user's alias that slipped past it.
  { kind: 'relay address', re: /(?<![\w.+%-])(?!user@)[\w.+%-]+@relay\.example\.com(?![\w-])/gi },
  { kind: 'Cloudflare D1 id', re: /"(?:preview_)?database_id"\s*:\s*"(?!00000000-0000-0000-0000-)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g },
];

/**
 * Rules for a published package only. The open-source tree names its own folders and hosts, so these
 * stay out of LEAK_RULES; a tarball has no reason to carry any of them.
 */
export const PACKAGE_LEAK_RULES = [
  { kind: 'internal hostname', re: /\b[a-z0-9-]+\.(?:workers\.dev|pages\.dev|r2\.dev|r2\.cloudflarestorage\.com|internal|local|lan|corp)\b/gi },
  { kind: 'home folder path', re: /(?:\/Users\/|\/home\/|\b[A-Za-z]:\\Users\\)[\w.-]+/g },
  { kind: 'private repo path', re: /\b(?:apps\/(?:api|web|mobile|video)|packages\/(?:shared|mcp-server|i18n)|scripts\/oss)\/|\.dev\.vars\b|\.claude\/worktrees\b/g },
];

const sha256 = text => createHash('sha256').update(text).digest('hex');

/**
 * sha256 of each lowercased literal that must never ship and may not be written out in a public file:
 * the old personal handle, its address and its mail domain (2026-11-17). Add one with
 * `printf '%s' '<literal>' | shasum -a 256`.
 */
export const HASHED_LITERALS = new Set([
  '3f94da5f0c7d04c4eed84e452ca706b95c953819929684dbbbb4bcf4faad54b6',
  'd4e9dec62c6eff1dfd7f6cc807c2d16ee8d77ca21fa27b00a8270b54e3ea51de',
  '0346389d52267a0af78e56dee58a2d2a77a44a6728d318dc4375006af33d1d70',
]);

const TOKEN = /[\w.+@-]+/g;

/**
 * The hashed literals in `text`. Each word-like token is checked whole, by each part around @ . _ + -,
 * and by each domain suffix, so a handle inside a URL or an address still counts.
 */
export function hashedLiteralHits(text, hashes = HASHED_LITERALS) {
  const hits = new Set();
  for (const token of text.match(TOKEN) ?? []) {
    const lower = token.toLowerCase().replace(/\.+$/, '');
    const labels = (lower.split('@').pop() ?? '').split('.').filter(Boolean);
    const parts = new Set([lower, ...lower.split('@'), ...lower.split(/[._+@-]/), ...labels.map((_, index) => labels.slice(index).join('.'))]);
    for (const part of parts) {
      if (part && hashes.has(sha256(part))) hits.add(part);
    }
  }
  return [...hits];
}

export const SHARED_DENYLIST = join(homedir(), '.config', 'getmattered', 'oss-denylist.txt');

function readLiterals(file) {
  return readFileSync(file, 'utf8').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}

/**
 * The denylist: the shared untracked file, plus the file OSS_EXTRA_DENYLIST names (a lane's new
 * literals, kept out of the shared file until the ship that clears their hits). A missing or empty
 * shared file, or a named extra file that is missing, is UNOBSERVED: names and exact addresses were
 * not checked, so the gate cannot say READY.
 */
export function readDenylist({ file = SHARED_DENYLIST, extra = process.env.OSS_EXTRA_DENYLIST || null } = {}) {
  const files = [file, ...(extra ? [extra] : [])];
  const missing = files.filter(path => !existsSync(path));
  const literals = [...new Set(files.filter(path => existsSync(path)).flatMap(readLiterals))];
  const observed = missing.length === 0 && literals.length > 0;
  return { files, literals, missing, observed };
}

/** Every rule hit in `tree` (path to text, null for a binary), minus the reviewed `allow` entries. */
export function findLeaks(tree, literals = [], allow = [], rules = LEAK_RULES) {
  const leaks = [];
  const literalRules = literals.map(literal => ({ kind: 'denylisted literal', re: new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') }));
  const allowed = new Set(allow.map(entry => `${entry.path}\0${entry.text}`));
  for (const [path, text] of tree) {
    if (text === null) continue;
    for (const rule of [...rules, ...literalRules]) {
      const hits = (text.match(rule.re) ?? []).filter(hit => !allowed.has(`${path}\0${hit}`));
      if (hits.length > 0) leaks.push({ count: hits.length, hits: [...new Set(hits)], kind: rule.kind, path });
    }
  }
  return leaks;
}
