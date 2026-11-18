import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

// Imports the source (node 24 strips the types), so this runs without a build.
const { configureClient, installSkills, resolveClients, runInit } = await import(new URL('../src/init.ts', import.meta.url).href);

const URL_ = 'https://mcp.getmattered.com/mcp';
const SKILLS = new URL('../plugins/getmattered/skills', import.meta.url).pathname;
const SKILL_COUNT = readdirSync(SKILLS, { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
const POSIX = process.platform !== 'win32';

function macHome() {
  const home = mkdtempSync(join(tmpdir(), 'getmattered-init-'));
  return { home, env: { platform: 'darwin', home } };
}

const client = (env, id) => resolveClients(env).find(entry => entry.id === id);
const read = path => readFileSync(path, 'utf8');
const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
};
const backupsOf = path => readdirSync(dirname(path)).filter(name => name.startsWith(`${path.split('/').pop()}.getmattered-backup-`));

async function init(env, args, ask) {
  const lines = [];
  const code = await runInit({ args, env, skillsSource: SKILLS, ask, log: line => lines.push(line) });
  return { code, said: lines.join('\n') };
}

test('detects the clients whose config or folder exists, and nothing else', () => {
  const { home, env } = macHome();
  write(join(home, '.claude.json'), '{}');
  mkdirSync(join(home, '.cursor'));
  const found = resolveClients(env).filter(entry => entry.detected).map(entry => entry.id);
  assert.deepEqual(found, ['claude-code', 'cursor']);
});

test('config paths on macOS and Linux follow each client', () => {
  const { home, env } = macHome();
  const paths = Object.fromEntries(resolveClients(env).map(entry => [entry.id, entry.configPath]));
  assert.deepEqual(paths, {
    'claude-code': join(home, '.claude.json'),
    codex: join(home, '.codex', 'config.toml'),
    'claude-desktop': join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    cursor: join(home, '.cursor', 'mcp.json'),
  });
  const linux = { platform: 'linux', home: '/home/ava', xdgConfigHome: '/home/ava/.xdg' };
  assert.equal(client(linux, 'claude-desktop').configPath, '/home/ava/.xdg/Claude/claude_desktop_config.json');
  assert.equal(client({ platform: 'linux', home: '/home/ava' }, 'claude-desktop').configPath, '/home/ava/.config/Claude/claude_desktop_config.json');
});

test('CLAUDE_CONFIG_DIR and CODEX_HOME move the config files and skills', () => {
  const env = { platform: 'linux', home: '/home/ava', claudeConfigDir: '/work/claude', codexHome: '/work/codex' };
  assert.equal(client(env, 'claude-code').configPath, '/work/claude/.claude.json');
  assert.equal(client(env, 'claude-code').skillsDir, '/work/claude/skills');
  assert.equal(client(env, 'codex').configPath, '/work/codex/config.toml');
});

test('Windows paths use the user profile and %APPDATA%', () => {
  const env = { platform: 'win32', home: 'C:\\Users\\ava', appData: 'C:\\Users\\ava\\AppData\\Roaming' };
  const byId = Object.fromEntries(resolveClients(env).map(entry => [entry.id, entry]));
  assert.equal(byId['claude-code'].configPath, 'C:\\Users\\ava\\.claude.json');
  assert.equal(byId['claude-code'].skillsDir, 'C:\\Users\\ava\\.claude\\skills');
  assert.equal(byId.codex.configPath, 'C:\\Users\\ava\\.codex\\config.toml');
  assert.equal(byId.codex.skillsDir, 'C:\\Users\\ava\\.agents\\skills');
  assert.equal(byId['claude-desktop'].configPath, 'C:\\Users\\ava\\AppData\\Roaming\\Claude\\claude_desktop_config.json');
  assert.equal(byId['claude-desktop'].skillsDir, null);
  assert.equal(byId.cursor.configPath, 'C:\\Users\\ava\\.cursor\\mcp.json');
  const noAppData = client({ platform: 'win32', home: 'C:\\Users\\ava' }, 'claude-desktop');
  assert.equal(noAppData.configPath, 'C:\\Users\\ava\\AppData\\Roaming\\Claude\\claude_desktop_config.json');
});

test('each client gets the transport it expects', () => {
  const { env } = macHome();
  for (const id of ['claude-code', 'claude-desktop', 'cursor']) configureClient(client(env, id));
  assert.deepEqual(JSON.parse(read(client(env, 'claude-code').configPath)).mcpServers.getmattered, { type: 'http', url: URL_ });
  assert.deepEqual(JSON.parse(read(client(env, 'cursor').configPath)).mcpServers.getmattered, { url: URL_ });
  assert.deepEqual(JSON.parse(read(client(env, 'claude-desktop').configPath)).mcpServers.getmattered, {
    command: 'npx',
    args: ['-y', 'getmattered-mcp@latest'],
    env: { GETMATTERED_LOGIN_ON_START: '1' },
  });
  configureClient(client(env, 'codex'));
  assert.equal(read(client(env, 'codex').configPath), `[mcp_servers.getmattered]\nurl = "${URL_}"\n`);
});

test('a JSON merge keeps every other server and key, and backs up the old file first', () => {
  const { home, env } = macHome();
  const original = JSON.stringify({
    numStartups: 41,
    projects: { '/code/app': { mcpServers: { local: { command: 'x' } } } },
    mcpServers: { github: { type: 'http', url: 'https://api.github.com/mcp' } },
  }, null, 2);
  const path = write(join(home, '.claude.json'), original);
  const result = configureClient(client(env, 'claude-code'));
  assert.equal(result.status, 'added');
  const merged = JSON.parse(read(path));
  assert.equal(merged.numStartups, 41);
  assert.deepEqual(merged.projects, { '/code/app': { mcpServers: { local: { command: 'x' } } } });
  assert.deepEqual(merged.mcpServers.github, { type: 'http', url: 'https://api.github.com/mcp' });
  assert.deepEqual(merged.mcpServers.getmattered, { type: 'http', url: URL_ });
  assert.equal(read(result.backup), original);
  assert.deepEqual(backupsOf(path).length, 1);
});

test('a second run changes nothing and writes no second backup', () => {
  const { home, env } = macHome();
  const path = write(join(home, '.cursor', 'mcp.json'), '{"mcpServers":{"other":{"url":"https://x.test/mcp"}}}\n');
  configureClient(client(env, 'cursor'));
  const after = read(path);
  assert.equal(configureClient(client(env, 'cursor')).status, 'unchanged');
  assert.equal(read(path), after);
  assert.equal(backupsOf(path).length, 1);
});

test('an old getmattered entry is replaced, after a backup', () => {
  const { home, env } = macHome();
  const path = write(join(home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { getmattered: { command: 'npx', args: ['getmattered-mcp'] } } }));
  const result = configureClient(client(env, 'cursor'));
  assert.equal(result.status, 'updated');
  assert.deepEqual(JSON.parse(read(path)).mcpServers, { getmattered: { url: URL_ } });
  assert.match(read(result.backup), /"command":"npx"/);
});

test('a config that is not valid JSON is left alone', () => {
  const { home, env } = macHome();
  const path = write(join(home, '.cursor', 'mcp.json'), '{ "mcpServers": { oops');
  assert.throws(() => configureClient(client(env, 'cursor')), /not valid JSON/);
  assert.equal(read(path), '{ "mcpServers": { oops');
  assert.equal(backupsOf(path).length, 0);
});

test('a Codex merge replaces only the getmattered tables and keeps the rest byte for byte', () => {
  const { home, env } = macHome();
  const before = [
    'model = "gpt-6"',
    'developer_instructions = """',
    '[mcp_servers.getmattered]',
    'this line is inside a string',
    '"""',
    '',
    '[mcp_servers.github]',
    'url = "https://api.github.com/mcp"',
    '',
    '[mcp_servers.getmattered]',
    'command = "npx"',
    'args = ["getmattered-mcp"]',
    '',
    '[mcp_servers.getmattered.env]',
    'GETMATTERED_LOGIN_ON_START = "1"',
    '',
    '[profiles.fast]',
    'model = "gpt-6-mini"',
    '',
  ].join('\n');
  const path = write(join(home, '.codex', 'config.toml'), before);
  const result = configureClient(client(env, 'codex'));
  assert.equal(result.status, 'updated');
  assert.equal(read(path), [
    'model = "gpt-6"',
    'developer_instructions = """',
    '[mcp_servers.getmattered]',
    'this line is inside a string',
    '"""',
    '',
    '[mcp_servers.github]',
    'url = "https://api.github.com/mcp"',
    '',
    '[mcp_servers.getmattered]',
    `url = "${URL_}"`,
    '',
    '[profiles.fast]',
    'model = "gpt-6-mini"',
    '',
  ].join('\n'));
  assert.equal(read(result.backup), before);
  assert.equal(configureClient(client(env, 'codex')).status, 'unchanged');
  assert.equal(backupsOf(path).length, 1);
});

test('a Codex config without the table gets it appended after one blank line', () => {
  const { home, env } = macHome();
  const path = write(join(home, '.codex', 'config.toml'), 'model = "gpt-6"\n');
  assert.equal(configureClient(client(env, 'codex')).status, 'added');
  assert.equal(read(path), `model = "gpt-6"\n\n[mcp_servers.getmattered]\nurl = "${URL_}"\n`);
});

test('a Codex table header with a trailing comment is still found, so no second table is added', () => {
  const { home, env } = macHome();
  const path = write(join(home, '.codex', 'config.toml'), '[mcp_servers.getmattered] # added by hand\ncommand = "npx"\n\n[profiles.fast]\nmodel = "gpt-6-mini"\n');
  assert.equal(configureClient(client(env, 'codex')).status, 'updated');
  assert.equal(read(path), `[mcp_servers.getmattered]\nurl = "${URL_}"\n\n[profiles.fast]\nmodel = "gpt-6-mini"\n`);
});

test('a getmattered server written as a dotted or inline key is left for a person to edit', () => {
  const { home, env } = macHome();
  for (const text of [`mcp_servers.getmattered.url = "${URL_}"\n`, `[mcp_servers]\ngetmattered = { url = "${URL_}" }\n`]) {
    const path = write(join(home, '.codex', 'config.toml'), text);
    assert.throws(() => configureClient(client(env, 'codex')), /by hand/);
    assert.equal(read(path), text);
  }
});

test('a missing config is created with its folder, and no backup', () => {
  const { home, env } = macHome();
  const result = configureClient(client(env, 'claude-desktop'));
  assert.equal(result.status, 'added');
  assert.equal(result.backup, undefined);
  assert.deepEqual(Object.keys(JSON.parse(read(join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'))).mcpServers), ['getmattered']);
});

test('a symlinked config is written through the link, and its mode is kept', { skip: !POSIX }, () => {
  const { home, env } = macHome();
  const real = join(home, 'dotfiles', 'claude.json');
  mkdirSync(dirname(real));
  writeFileSync(real, '{"theme":"dark"}', { mode: 0o600 });
  symlinkSync(real, join(home, '.claude.json'));
  configureClient(client(env, 'claude-code'));
  assert.equal(lstatSync(join(home, '.claude.json')).isSymbolicLink(), true);
  assert.equal(JSON.parse(read(real)).theme, 'dark');
  assert.ok(JSON.parse(read(real)).mcpServers.getmattered);
  assert.equal(statSync(real).mode & 0o777, 0o600);
});

test('skills install into the folder, keep a foreign skill of the same name, and converge on a re-run', () => {
  const { home } = macHome();
  const target = join(home, '.claude', 'skills');
  write(join(target, 'apply-to-a-job', 'SKILL.md'), '---\nname: apply-to-a-job\n---\nsomeone else\n');
  const first = installSkills(SKILLS, target);
  assert.deepEqual(first.skipped, ['apply-to-a-job']);
  assert.equal(first.installed.length, SKILL_COUNT - 1);
  assert.equal(read(join(target, 'apply-to-a-job', 'SKILL.md')), '---\nname: apply-to-a-job\n---\nsomeone else\n');
  assert.equal(read(join(target, 'track-applications', 'SKILL.md')), read(join(SKILLS, 'track-applications', 'SKILL.md')));
  assert.deepEqual(installSkills(SKILLS, target), first);
});

test('a folder that only mentions GetMattered is the user\'s, and init never deletes it', () => {
  const { home } = macHome();
  const target = join(home, '.claude', 'skills');
  const mine = write(join(target, 'track-applications', 'SKILL.md'), '---\nname: track-applications\n---\nMy own notes on GetMattered.\n');
  write(join(target, 'track-applications', 'notes.md'), 'keep me\n');
  const result = installSkills(SKILLS, target);
  assert.ok(result.skipped.includes('track-applications'));
  assert.equal(read(mine), '---\nname: track-applications\n---\nMy own notes on GetMattered.\n');
  assert.equal(read(join(target, 'track-applications', 'notes.md')), 'keep me\n');
});

test('a copy that init wrote, or an unchanged copy from 1.21.0, is updated in place', () => {
  const { home } = macHome();
  const target = join(home, '.agents', 'skills');
  installSkills(SKILLS, target);
  write(join(target, 'apply-to-a-job', 'SKILL.md'), 'an older GetMattered copy\n');
  const legacy = join(target, 'track-applications');
  for (const name of readdirSync(legacy).filter(entry => entry.startsWith('.'))) {
    rmSync(join(legacy, name));
  }
  const again = installSkills(SKILLS, target);
  assert.deepEqual(again.skipped, []);
  assert.equal(read(join(target, 'apply-to-a-job', 'SKILL.md')), read(join(SKILLS, 'apply-to-a-job', 'SKILL.md')));
});

test('a skill folder that is a symlink is left alone and nothing is written through it', { skip: !POSIX }, () => {
  const { home } = macHome();
  const target = join(home, '.claude', 'skills');
  const elsewhere = write(join(home, 'dotfiles', 'apply-to-a-job', 'SKILL.md'), 'GetMattered, my fork\n');
  mkdirSync(target, { recursive: true });
  symlinkSync(dirname(elsewhere), join(target, 'apply-to-a-job'));
  const result = installSkills(SKILLS, target);
  assert.ok(result.skipped.includes('apply-to-a-job'));
  assert.equal(lstatSync(join(target, 'apply-to-a-job')).isSymbolicLink(), true);
  assert.equal(read(elsewhere), 'GetMattered, my fork\n');
});

test('init --clients configures the named clients, adds skills once per folder, and prints one next step', async () => {
  const { home, env } = macHome();
  const { code, said } = await init(env, ['--clients', 'codex,cursor']);
  assert.equal(code, 0);
  assert.match(read(join(home, '.codex', 'config.toml')), /\[mcp_servers\.getmattered\]/);
  assert.ok(JSON.parse(read(join(home, '.cursor', 'mcp.json'))).mcpServers.getmattered);
  assert.equal(readdirSync(join(home, '.agents', 'skills')).length, SKILL_COUNT);
  assert.equal(said.match(/^Next: /gm)?.length, 1);
  assert.match(said, /^Next: .*codex mcp login getmattered/m);
  assert.equal((await init(env, ['--clients', 'codex,cursor'])).code, 0);
});

test('init --yes configures only the clients it found', async () => {
  const { home, env } = macHome();
  mkdirSync(join(home, '.cursor'));
  const { code } = await init(env, ['--yes', '--no-skills']);
  assert.equal(code, 0);
  assert.ok(JSON.parse(read(join(home, '.cursor', 'mcp.json'))).mcpServers.getmattered);
  assert.throws(() => statSync(join(home, '.claude.json')));
  assert.throws(() => statSync(join(home, '.agents')));
});

test('init refuses an unknown client, and a non-interactive run with no choice', async () => {
  const { env } = macHome();
  const unknown = await init(env, ['--clients', 'vscode']);
  assert.equal(unknown.code, 64);
  assert.match(unknown.said, /claude-code, codex, claude-desktop, cursor/);
  const silent = await init(env, []);
  assert.equal(silent.code, 64);
  assert.match(silent.said, /--yes|--clients/);
});

test('init asks which found clients to set up, and whether to add skills', async () => {
  const { home, env } = macHome();
  write(join(home, '.claude.json'), '{}');
  mkdirSync(join(home, '.codex'));
  const questions = [];
  const answers = ['2', 'n'];
  const { code } = await init(env, [], async question => {
    questions.push(question);
    return answers.shift();
  });
  assert.equal(code, 0);
  assert.equal(questions.length, 2);
  assert.match(read(join(home, '.codex', 'config.toml')), /getmattered/);
  assert.equal(JSON.parse(read(join(home, '.claude.json'))).mcpServers, undefined);
  assert.throws(() => statSync(join(home, '.agents')));
});
