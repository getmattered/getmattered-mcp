import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const pkg = read('package.json');
const root = 'plugins/aiapplyd';
const portable = read(`${root}/plugin.json`);
const codex = read(`${root}/.codex-plugin/plugin.json`);
const manifestPaths = ['server.json', 'gemini-extension.json', `${root}/plugin.json`, `${root}/.claude-plugin/plugin.json`, `${root}/.codex-plugin/plugin.json`, `${root}/.cursor-plugin/plugin.json`];
for (const path of manifestPaths) assert.equal(read(path).version, pkg.version, `${path} version drift`);
const ui = portable.extensions['com.openai'].interface;
assert.deepEqual(ui, codex.interface, 'OpenAI and Codex presentation must match');
for (const [key, limit] of [['displayName', 30], ['shortDescription', 30], ['longDescription', 4000]]) {
  assert.ok(ui[key]?.length > 0 && ui[key].length <= limit, `${key} exceeds the OpenAI limit`);
}
for (const key of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
  assert.equal(new URL(ui[key]).protocol, 'https:', `${key} must be HTTPS`);
}
assert.ok(ui.capabilities.length <= 20 && ui.capabilities.every(value => value.length <= 120));
assert.ok(ui.defaultPrompt.length <= 3 && ui.defaultPrompt.every(value => value.length <= 128));
assert.equal(new Set(ui.defaultPrompt).size, ui.defaultPrompt.length);
const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { encoding: 'utf8' }));
const files = new Set(pack.files.map(file => file.path));
const skills = readdirSync(`${root}/skills`, { withFileTypes: true }).filter(entry => entry.isDirectory());
assert.equal(skills.length, 10, 'Expected the ten job-search workflows');
for (const skill of skills) assert.ok(files.has(`${root}/skills/${skill.name}/SKILL.md`), `Missing packaged skill: ${skill.name}`);
for (const path of ['plugin.json', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', 'mcp.json', '.mcp.json', ui.logo, ui.composerIcon]) {
  assert.ok(files.has(`${root}/${path.replace(/^\.\//, '')}`), `Missing packaged plugin file: ${path}`);
}
console.log(`Package ${pkg.version}: ${skills.length} skills, manifests, icons and OpenAI metadata verified.`);
