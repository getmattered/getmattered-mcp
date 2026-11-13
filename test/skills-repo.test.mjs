import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { firstSentence, pluginSkills, skillFrontmatter, syncSkillsRepo } from '../scripts/skills-repo.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function staleCheckout() {
  const checkout = mkdtempSync(join(tmpdir(), 'skills-repo-'));
  mkdirSync(join(checkout, '.git'));
  writeFileSync(join(checkout, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  mkdirSync(join(checkout, 'skills', 'apply-to-jobs'), { recursive: true });
  writeFileSync(join(checkout, 'skills', 'apply-to-jobs', 'SKILL.md'), '---\nname: apply-to-jobs\ndescription: An old hand-written skill.\n---\n');
  writeFileSync(join(checkout, 'README.md'), '# Old\n');
  return checkout;
}

test('a sync makes the repo exactly the plugin skills of the release, and drops what the plugin no longer has', () => {
  const checkout = staleCheckout();
  const folders = syncSkillsRepo(root, checkout, '1.17.2');
  assert.deepEqual(readdirSync(join(checkout, 'skills')).sort(), folders);
  assert.equal(existsSync(join(checkout, 'skills', 'apply-to-jobs')), false);
  assert.equal(existsSync(join(checkout, '.git', 'HEAD')), true);
  for (const folder of folders) {
    assert.equal(readFileSync(join(checkout, 'skills', folder, 'SKILL.md'), 'utf8'), readFileSync(join(root, 'plugins/getmattered/skills', folder, 'SKILL.md'), 'utf8'));
  }
  const manifest = JSON.parse(readFileSync(join(checkout, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.version, '1.17.2');
  assert.deepEqual(manifest.skills, folders.map(folder => `./skills/${folder}`));
  assert.equal(readFileSync(join(checkout, 'LICENSE'), 'utf8'), readFileSync(join(root, 'LICENSE'), 'utf8'));
});

test('the README lists every skill and sends issues to the server repo, in plain words', () => {
  const checkout = staleCheckout();
  syncSkillsRepo(root, checkout, '1.17.2');
  const readme = readFileSync(join(checkout, 'README.md'), 'utf8');
  for (const skill of pluginSkills(root)) assert.ok(readme.includes(`[\`${skill.name}\`](skills/${skill.folder}/SKILL.md)`), skill.name);
  assert.match(readme, /version 1\.17\.2/);
  assert.match(readme, /open issues and pull requests on \[getmattered\/getmattered-mcp\]/);
  assert.doesNotMatch(readme, /—|aiapplyd|openai|anthropic/i);
});

test('a second sync of the same release changes nothing', () => {
  const checkout = staleCheckout();
  syncSkillsRepo(root, checkout, '1.17.2');
  const before = readFileSync(join(checkout, 'README.md'), 'utf8');
  syncSkillsRepo(root, checkout, '1.17.2');
  assert.equal(readFileSync(join(checkout, 'README.md'), 'utf8'), before);
});

test('it refuses a folder that is not a checkout, a bad version and a skill without frontmatter', () => {
  assert.throws(() => syncSkillsRepo(root, mkdtempSync(join(tmpdir(), 'skills-repo-')), '1.17.2'), /not a git checkout/);
  assert.throws(() => syncSkillsRepo(root, staleCheckout(), 'main'), /not a version/);
  assert.equal(skillFrontmatter('# no frontmatter'), null);
  assert.deepEqual(skillFrontmatter('---\nname: a\ndescription: "Does a. Then b."\n---\n'), { description: 'Does a. Then b.', name: 'a' });
  assert.equal(firstSentence('Send a real job application. It tailors the resume.'), 'Send a real job application.');
});
