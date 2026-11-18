#!/usr/bin/env node
/**
 * The leak scan of the npm tarball. A hit fails the publish.
 *
 *   node scripts/scan-package.mjs                  the files `npm pack --dry-run` packs from this folder
 *   node scripts/scan-package.mjs --tarball <tgz>  the files inside a packed tarball (the publish job)
 *
 * It reads every packed file, text and binary alike (a PNG can carry text chunks), and runs the leak
 * rules from leak-rules.mjs on it: the open-source gate's rules (personal addresses, phone numbers, the
 * old product name, secret shapes, Cloudflare and Stripe ids), the package-only rules (internal
 * hostnames, home folder paths, private repo paths), the hashed literals, and the untracked denylist
 * when this computer has one (CI has none). It also fails on a packed file outside package.json "files".
 * Hits print redacted, so a log never repeats a secret.
 *
 * verify-package.mjs runs it (npm test in the release build, the mirror's tag gate, check:mcp-bridge),
 * and the release workflow runs it again on the built tarball just before `npm publish`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findLeaks, hashedLiteralHits, LEAK_RULES, PACKAGE_LEAK_RULES, readDenylist } from './leak-rules.mjs';

/** The paths `npm pack` would put in the tarball of the package in `dir`. npm 11 prints an array, npm 12 an object. */
export function packedFiles(dir) {
  const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: dir, encoding: 'utf8' }));
  const pack = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
  return pack.files.map(file => file.path);
}

function walk(dir, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path, root) : [relative(root, path).split(sep).join('/')];
  });
}

const redact = hit => `${hit.slice(0, 3)}...(${hit.length} chars)`;

/**
 * Every problem in the files `files` (paths relative to `dir`): a leak rule hit, or a file that
 * package.json "files" does not list. `literals` are the denylist's exact strings.
 */
export function scanPackage({ dir, files, literals = [] }) {
  const listed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).files ?? [];
  const problems = files
    .filter(path => path !== 'package.json' && !listed.some(entry => path === entry || path.startsWith(`${entry}/`)))
    .map(path => ({ path, kind: 'not in package.json "files"', hits: [] }));
  const tree = new Map(files.map(path => [path, readFileSync(join(dir, path)).toString('latin1')]));
  for (const leak of findLeaks(tree, literals, [], [...LEAK_RULES, ...PACKAGE_LEAK_RULES])) {
    problems.push({ path: leak.path, kind: leak.kind, hits: leak.hits.map(redact) });
  }
  for (const [path, text] of tree) {
    const hits = hashedLiteralHits(text);
    if (hits.length > 0) problems.push({ path, kind: 'hashed literal', hits: hits.map(redact) });
  }
  return problems;
}

export const formatProblems = problems => problems.map(problem => `  ${problem.path}: ${problem.kind}${problem.hits.length > 0 ? ` ${problem.hits.join(', ')}` : ''}`).join('\n');

function main(args) {
  const denylist = readDenylist();
  const tarball = args.includes('--tarball') ? args[args.indexOf('--tarball') + 1] : null;
  let scratch = null;
  let dir = process.cwd();
  let files;
  try {
    if (tarball) {
      scratch = mkdtempSync(join(tmpdir(), 'getmattered-scan-'));
      execFileSync('tar', ['-xzf', tarball, '-C', scratch]);
      dir = join(scratch, 'package');
      files = walk(dir);
    } else {
      files = packedFiles(dir);
    }
    const problems = scanPackage({ dir, files, literals: denylist.literals });
    const source = tarball ?? 'npm pack --dry-run';
    const deny = denylist.literals.length > 0 ? `${denylist.literals.length} denylist literal(s)` : 'no local denylist';
    if (problems.length > 0) {
      console.error(`[scan-package] ${problems.length} problem(s) in ${files.length} packed file(s) of ${source}; nothing may be published:\n${formatProblems(problems)}`);
      return 1;
    }
    console.log(`[scan-package] ${files.length} packed file(s) of ${source} clean (${deny}).`);
    return 0;
  } finally {
    if (scratch) rmSync(scratch, { force: true, recursive: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
