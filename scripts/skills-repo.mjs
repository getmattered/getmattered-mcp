/**
 * Keeps github.com/getmattered/getmattered-skills an exact copy of this release's
 * plugin skills. The `skills-repo` job of .github/workflows/release.yml clones that
 * repo over HTTPS, runs this, and pushes with its deploy key only when a file changed.
 * Nothing in that repo is edited by hand: every release rewrites it.
 *
 *   node scripts/skills-repo.mjs sync <checkout> <version>
 *       makes <checkout> (minus .git and .github) the skills of plugins/getmattered,
 *       a plugin manifest at <version>, a README listing each skill, and LICENSE
 *
 * The skills drive the GetMattered MCP server's tools, so the README sends readers
 * to getmattered/getmattered-mcp for the server.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

export const SKILLS_REPO = 'getmattered/getmattered-skills';
const SKILLS_DIR = 'plugins/getmattered/skills';
const KEEP = new Set(['.git', '.github']);
const VERSION = /^\d+\.\d+\.\d+$/;

/** `name` and `description` from a SKILL.md frontmatter, or null when either is missing. */
export function skillFrontmatter(text) {
  const block = String(text).match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!block) return null;
  const field = key => block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2') ?? null;
  const name = field('name');
  const description = field('description');
  return name && description ? { description, name } : null;
}

/** The first sentence of a skill description, for the README table. */
export const firstSentence = description => description.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? description;

/** The skills of the plugin, sorted by folder name. Throws on a skill without frontmatter. */
export function pluginSkills(bridgeRoot) {
  const base = join(bridgeRoot, SKILLS_DIR);
  return readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .map((folder) => {
      const meta = skillFrontmatter(readFileSync(join(base, folder, 'SKILL.md'), 'utf8'));
      if (!meta) throw new Error(`${SKILLS_DIR}/${folder}/SKILL.md has no name and description frontmatter`);
      return { folder, ...meta };
    });
}

export function skillsManifest(skills, version) {
  return {
    name: 'getmattered-skills',
    displayName: 'GetMattered skills',
    version,
    description: 'The workflow skills of the GetMattered MCP server: find matching jobs, apply on the employer\'s own hiring system, review and send, track applications, answer recruiters, follow up and prepare for interviews.',
    author: { name: 'GetMattered', url: 'https://getmattered.com' },
    homepage: `https://github.com/${SKILLS_REPO}`,
    repository: `https://github.com/${SKILLS_REPO}`,
    license: 'MIT',
    skills: skills.map(skill => `./skills/${skill.folder}`),
  };
}

export function skillsReadme(skills, version) {
  return [
    '# GetMattered skills',
    '',
    `The workflow skills of the [GetMattered MCP server](https://github.com/getmattered/getmattered-mcp), version ${version}. Each folder holds one \`SKILL.md\`: the steps an assistant follows with the GetMattered tools for one part of a job search.`,
    '',
    'This repository is rewritten by every release of getmattered-mcp, so it always matches the live server. Please open issues and pull requests on [getmattered/getmattered-mcp](https://github.com/getmattered/getmattered-mcp) instead.',
    '',
    '## Skills',
    '',
    '| skill | what it does |',
    '|---|---|',
    ...skills.map(skill => `| [\`${skill.name}\`](skills/${skill.folder}/SKILL.md) | ${firstSentence(skill.description).replaceAll('|', '\\|')} |`),
    '',
    '## Using them',
    '',
    'The skills call the GetMattered tools, so connect the server first: see [getmattered-mcp](https://github.com/getmattered/getmattered-mcp#readme). Its plugin already carries these skills. To add only the skills to an assistant that reads `SKILL.md` folders:',
    '',
    '```bash',
    `npx skills add ${SKILLS_REPO}`,
    '```',
    '',
    '## Licence',
    '',
    'MIT, see [LICENSE](LICENSE).',
    '',
  ].join('\n');
}

/** Makes `checkout` (minus .git and .github) the skills repo for `version`. */
export function syncSkillsRepo(bridgeRoot, checkout, version) {
  if (!VERSION.test(version)) throw new Error(`"${version}" is not a version like 1.2.3`);
  if (!existsSync(join(checkout, '.git'))) throw new Error(`${checkout} is not a git checkout`);
  const skills = pluginSkills(bridgeRoot);
  const stale = readdirSync(checkout).filter(entry => !KEEP.has(entry));
  for (const entry of stale) rmSync(join(checkout, entry), { force: true, recursive: true });
  for (const skill of skills) cpSync(join(bridgeRoot, SKILLS_DIR, skill.folder), join(checkout, 'skills', skill.folder), { recursive: true });
  mkdirSync(join(checkout, '.claude-plugin'), { recursive: true });
  writeFileSync(join(checkout, '.claude-plugin', 'plugin.json'), `${JSON.stringify(skillsManifest(skills, version), null, 2)}\n`);
  writeFileSync(join(checkout, 'README.md'), skillsReadme(skills, version));
  cpSync(join(bridgeRoot, 'LICENSE'), join(checkout, 'LICENSE'));
  return skills.map(skill => skill.folder);
}

function main() {
  const [command, checkout, version] = argv.slice(2);
  if (command !== 'sync') throw new Error(`unknown command ${command}`);
  const folders = syncSkillsRepo('.', checkout, version);
  stdout.write(`${SKILLS_REPO} at ${version}: ${folders.length} skills (${folders.join(', ')})\n`);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`skills-repo: ${error.message}`);
    exit(1);
  }
}
