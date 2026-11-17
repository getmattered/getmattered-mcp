/**
 * `getmattered-mcp init`: add GetMattered (cloud mode) to the AI apps on this computer.
 *
 * CLIENTS is the one table of what each app needs: where its config lives on
 * macOS, Linux and Windows, how to tell it is installed, the server entry in the
 * transport it expects, and where its personal skills live. Sources, read
 * 17 Nov 2026: code.claude.com/docs/en/mcp (user scope in ~/.claude.json,
 * CLAUDE_CONFIG_DIR), openai/codex codex-rs (CODEX_HOME/config.toml
 * [mcp_servers.<name>] url, skills in ~/.agents/skills), cursor.com/docs/mcp and
 * /skills (~/.cursor/mcp.json, ~/.agents/skills), modelcontextprotocol.io
 * connect-local-servers (claude_desktop_config.json takes local servers only, so
 * Claude Desktop runs this package's stdio bridge).
 *
 * Every write reads the file as it is now and changes only the getmattered entry,
 * so a second run finds nothing to do. A changed file is first copied to a
 * timestamped backup next to it, then replaced in one rename. A file that does not
 * parse is never touched.
 *
 * No relative imports, so the test can load it from src without a build.
 */
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  copyFileSync,
  cpSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, posix, win32 } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const CLOUD_URL = 'https://mcp.getmattered.com/mcp';
const SERVER = 'getmattered';

export type ClientEnv = {
  platform: NodeJS.Platform;
  home: string;
  appData?: string;
  xdgConfigHome?: string;
  claudeConfigDir?: string;
  codexHome?: string;
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };
type ServerEntry = { format: 'json'; entry: JsonObject } | { format: 'toml'; table: string[] };

type ClientPaths = { config: string; markers: string[]; skills: string | null };

export type ClientId = 'claude-code' | 'codex' | 'claude-desktop' | 'cursor';

type ClientSpec = {
  id: ClientId;
  name: string;
  paths: (env: ClientEnv, path: typeof posix) => ClientPaths;
  server: ServerEntry;
  nextStep: string;
};

const CLIENTS: ClientSpec[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    paths: (env, path) => {
      const base = env.claudeConfigDir ?? path.join(env.home, '.claude');
      const config = env.claudeConfigDir ? path.join(env.claudeConfigDir, '.claude.json') : path.join(env.home, '.claude.json');
      return { config, markers: [config, base], skills: path.join(base, 'skills') };
    },
    server: { format: 'json', entry: { type: 'http', url: CLOUD_URL } },
    nextStep: 'start Claude Code, type /mcp, choose getmattered and sign in. Then say "Set up GetMattered".',
  },
  {
    id: 'codex',
    name: 'Codex',
    paths: (env, path) => {
      const base = env.codexHome ?? path.join(env.home, '.codex');
      return { config: path.join(base, 'config.toml'), markers: [base], skills: path.join(env.home, '.agents', 'skills') };
    },
    server: { format: 'toml', table: [`[mcp_servers.${SERVER}]`, `url = "${CLOUD_URL}"`] },
    nextStep: 'run codex mcp login getmattered, then ask Codex to "Set up GetMattered".',
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    paths: (env, path) => {
      const appData = env.platform === 'win32'
        ? env.appData ?? path.join(env.home, 'AppData', 'Roaming')
        : env.platform === 'darwin'
          ? path.join(env.home, 'Library', 'Application Support')
          : env.xdgConfigHome ?? path.join(env.home, '.config');
      const base = path.join(appData, 'Claude');
      return { config: path.join(base, 'claude_desktop_config.json'), markers: [base], skills: null };
    },
    server: { format: 'json', entry: { command: 'npx', args: ['-y', 'getmattered-mcp@latest'], env: { GETMATTERED_LOGIN_ON_START: '1' } } },
    nextStep: 'quit and reopen Claude Desktop, then say "Set up GetMattered". The first answer opens the sign-in in your browser.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    paths: (env, path) => {
      const base = path.join(env.home, '.cursor');
      return { config: path.join(base, 'mcp.json'), markers: [base], skills: path.join(env.home, '.agents', 'skills') };
    },
    server: { format: 'json', entry: { url: CLOUD_URL } },
    nextStep: 'restart Cursor and sign in to getmattered under Cursor Settings, MCP. Then say "Set up GetMattered" in the chat.',
  },
];

export const CLIENT_IDS: readonly ClientId[] = CLIENTS.map(client => client.id);

export type Client = {
  id: ClientId;
  name: string;
  configPath: string;
  skillsDir: string | null;
  detected: boolean;
  server: ServerEntry;
  nextStep: string;
};

/** A config file this run will not change. Its message says what to do. */
export class ConfigError extends Error {}

export function processEnv(): ClientEnv {
  const value = (name: string) => process.env[name]?.trim() || undefined;
  return {
    platform: process.platform,
    home: homedir(),
    appData: value('APPDATA'),
    xdgConfigHome: value('XDG_CONFIG_HOME'),
    claudeConfigDir: value('CLAUDE_CONFIG_DIR'),
    codexHome: value('CODEX_HOME'),
  };
}

export function resolveClients(env: ClientEnv): Client[] {
  const path = env.platform === 'win32' ? win32 : posix;
  return CLIENTS.map((spec) => {
    const paths = spec.paths(env, path);
    return {
      id: spec.id,
      name: spec.name,
      configPath: paths.config,
      skillsDir: paths.skills,
      detected: paths.markers.some(marker => existsSync(marker)),
      server: spec.server,
      nextStep: spec.nextStep,
    };
  });
}

type Merged = { text: string; replaced: boolean } | null;

const asObject = (value: Json | undefined) => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null);

function mergeJson(before: string | null, entry: JsonObject, path: string): Merged {
  let root: Json = {};
  if (before !== null && before.trim() !== '') {
    try {
      root = JSON.parse(before);
    } catch {
      throw new ConfigError(`${path} is not valid JSON, so it was left as it is. Fix it, then run init again.`);
    }
  }
  const object = asObject(root);
  const servers = asObject(object?.mcpServers ?? {});
  if (!object || !servers) {
    throw new ConfigError(`${path} has no mcpServers object where one belongs, so it was left as it is.`);
  }
  if (isDeepStrictEqual(servers[SERVER], entry)) return null;
  const indent = before?.match(/^[ \t]+(?=\S)/m)?.[0] ?? 2;
  return {
    text: `${JSON.stringify({ ...object, mcpServers: { ...servers, [SERVER]: entry } }, null, indent)}\n`,
    replaced: servers[SERVER] !== undefined,
  };
}

/** The key of a table header line (`[a.b]` or `[[a.b]]`), or null for any other line. */
function tomlHeader(line: string) {
  const text = line.trim();
  return text.startsWith('[') && text.endsWith(']') ? text.replace(/^\[+|\]+$/g, '') : null;
}
const tomlKey = (raw: string) => raw.split('.').map(part => part.trim().replace(/^["']|["']$/g, '')).join('.');

/** The multi-line string delimiter still open after `line`, given the one open before it. */
function openString(line: string, open: string | null) {
  const delimiter = open ?? ['"""', "'''"].find(mark => line.includes(mark));
  if (!delimiter) return null;
  const odd = line.split(delimiter).length % 2 === 0;
  return odd ? (open ? null : delimiter) : open;
}

/**
 * Codex's config.toml, edited as text so every other line stays byte for byte.
 * The [mcp_servers.getmattered] table and its sub-tables are replaced in place,
 * or appended. A getmattered server written as a dotted or inline key is left
 * for a person: a second definition would make Codex refuse the whole file.
 */
function mergeToml(before: string | null, table: string[], path: string): Merged {
  const kept: string[] = [];
  const ours: string[] = [];
  let insertAt = -1;
  let current = '';
  let inOurs = false;
  let open: string | null = null;
  for (const line of before === null ? [] : before.split('\n')) {
    if (!open) {
      const header = tomlHeader(line);
      if (header !== null) {
        current = tomlKey(header);
        inOurs = current === `mcp_servers.${SERVER}` || current.startsWith(`mcp_servers.${SERVER}.`);
        if (inOurs && insertAt < 0) insertAt = kept.length;
      } else {
        const key = tomlKey(line.split('=')[0] ?? '');
        const dotted = current === '' && (key === `mcp_servers.${SERVER}` || key.startsWith(`mcp_servers.${SERVER}.`));
        const inline = current === 'mcp_servers' && (key === SERVER || key.startsWith(`${SERVER}.`));
        if (line.includes('=') && (dotted || inline)) {
          throw new ConfigError(`${path} defines the getmattered server in another form. Edit that entry by hand to: ${table.join(' ')}`);
        }
      }
    }
    (inOurs ? ours : kept).push(line);
    open = openString(line, open);
  }
  const existing = ours.map(line => line.trim()).filter(Boolean);
  if (isDeepStrictEqual(existing, table)) return null;
  const trimEnd = (lines: string[]) => {
    const copy = [...lines];
    while (copy.length > 0 && copy[copy.length - 1].trim() === '') copy.pop();
    return copy;
  };
  const lines = insertAt >= 0
    ? [...kept.slice(0, insertAt), ...table, '', ...kept.slice(insertAt)]
    : [...trimEnd(kept), ...(trimEnd(kept).length > 0 ? [''] : []), ...table];
  return { text: `${trimEnd(lines).join('\n')}\n`, replaced: ours.length > 0 };
}

/** `text` at `path` in one rename, created at `mode`, so no reader sees half a file. */
function writeAtomic(path: string, text: string, mode: number) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const fd = openSync(temp, 'wx', mode);
  try {
    try {
      fchmodSync(fd, mode);
      writeFileSync(fd, text);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

export type ConfigureResult = { status: 'added' | 'updated' | 'unchanged'; path: string; backup?: string };

export function configureClient(client: Client, now = new Date()): ConfigureResult {
  // A symlinked config (a dotfiles repo) is written through, so the link stays.
  const path = existsSync(client.configPath) ? realpathSync(client.configPath) : client.configPath;
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const merged = client.server.format === 'json'
    ? mergeJson(before, client.server.entry, path)
    : mergeToml(before, client.server.table, path);
  if (!merged) return { status: 'unchanged', path };
  let backup: string | undefined;
  if (before !== null) {
    backup = `${path}.getmattered-backup-${now.toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(path, backup, constants.COPYFILE_EXCL);
  }
  writeAtomic(path, merged.text, before !== null ? statSync(path).mode & 0o777 : 0o600);
  return { status: merged.replaced ? 'updated' : 'added', path, backup };
}

/**
 * Copies the package's skill folders into `target`. A folder of the same name
 * whose SKILL.md does not name GetMattered belongs to someone else and stays.
 */
export function installSkills(source: string, target: string) {
  const installed: string[] = [];
  const skipped: string[] = [];
  const names = readdirSync(source, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const name of names) {
    const dest = join(target, name);
    const skill = join(dest, 'SKILL.md');
    const ours = existsSync(skill) && /getmattered/i.test(readFileSync(skill, 'utf8'));
    if (existsSync(dest) && !ours) {
      skipped.push(name);
      continue;
    }
    rmSync(dest, { force: true, recursive: true });
    cpSync(join(source, name), dest, { recursive: true });
    installed.push(name);
  }
  return { installed, skipped };
}

export type InitOptions = {
  args: string[];
  env: ClientEnv;
  skillsSource: string;
  /** Asks one question and returns the answer. Absent when there is no terminal. */
  ask?: (question: string) => Promise<string>;
  log: (line: string) => void;
};

const USAGE = 'usage: getmattered-mcp init [--yes] [--clients claude-code,codex,claude-desktop,cursor] [--no-skills]';

function parseArgs(args: string[]) {
  const flags: { yes: boolean; skills: boolean; clients: string[] | null } = { yes: false, skills: true, clients: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--yes' || arg === '-y') {
      flags.yes = true;
    } else if (arg === '--no-skills') {
      flags.skills = false;
    } else if (arg === '--clients' || arg.startsWith('--clients=')) {
      const value = arg === '--clients' ? args[(index += 1)] : arg.slice('--clients='.length);
      flags.clients = (value ?? '').split(',').map(id => id.trim()).filter(Boolean);
    } else {
      return null;
    }
  }
  return flags;
}

async function pick(clients: Client[], ask: (question: string) => Promise<string>, log: (line: string) => void) {
  log('GetMattered can connect to these AI apps:');
  clients.forEach((client, index) => log(`  ${index + 1}. ${client.name.padEnd(15)}${client.detected ? 'found' : 'not found'}`));
  const answer = (await ask('Which ones? Press Enter for every app found, or type numbers like 1,3: ')).trim();
  if (answer === '') return clients.filter(client => client.detected);
  const picked = answer.split(/[\s,]+/).map(Number);
  if (picked.some(number => !Number.isInteger(number) || number < 1 || number > clients.length)) return null;
  return clients.filter((_, index) => picked.includes(index + 1));
}

export async function runInit({ args, env, skillsSource, ask, log }: InitOptions) {
  const flags = parseArgs(args);
  if (!flags) {
    log(USAGE);
    return 64;
  }
  const clients = resolveClients(env);
  const homes = [env.home, existsSync(env.home) ? realpathSync(env.home) : env.home];
  const tilde = (path: string) => {
    const home = homes.find(prefix => path.startsWith(prefix));
    return home ? `~${path.slice(home.length)}` : path;
  };
  const interactive = !flags.yes && !flags.clients;

  let chosen: Client[] | null;
  if (flags.clients) {
    const unknown = flags.clients.filter(id => !clients.some(client => client.id === id));
    if (unknown.length > 0 || flags.clients.length === 0) {
      log(`${unknown.length > 0 ? `unknown client "${unknown.join(', ')}". ` : ''}Choose from: ${CLIENT_IDS.join(', ')}`);
      return 64;
    }
    chosen = clients.filter(client => flags.clients?.includes(client.id));
  } else if (flags.yes) {
    chosen = clients.filter(client => client.detected);
  } else if (!ask) {
    log('init asks which apps to set up, and this is not a terminal. Pass --yes (every app found) or --clients with a list.');
    log(USAGE);
    return 64;
  } else {
    chosen = await pick(clients, ask, log);
    if (!chosen) {
      log(`answer with numbers from 1 to ${clients.length}, like 1,3`);
      return 64;
    }
  }
  if (chosen.length === 0) {
    log(`No AI app chosen or found. Pass --clients with one of: ${CLIENT_IDS.join(', ')}`);
    return flags.yes ? 1 : 0;
  }

  const done: Client[] = [];
  for (const client of chosen) {
    try {
      const result = configureClient(client);
      const backup = result.backup ? ` Backup: ${tilde(result.backup)}` : '';
      const said = { added: 'added GetMattered to', updated: 'updated GetMattered in', unchanged: 'already set up in' }[result.status];
      log(`${client.name}: ${said} ${tilde(result.path)}.${backup}`);
      done.push(client);
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      log(`${client.name}: ${error.message}`);
    }
  }

  const skillDirs = [...new Set(done.flatMap(client => (client.skillsDir ? [client.skillsDir] : [])))];
  let addSkills = flags.skills && skillDirs.length > 0;
  if (addSkills && interactive && ask) {
    const names = done.filter(client => client.skillsDir).map(client => client.name).join(' and ');
    const answer = (await ask(`Add the GetMattered skills to ${names}? They teach your assistant each job search step. [Y/n] `)).trim().toLowerCase();
    addSkills = answer === '' || answer === 'y' || answer === 'yes';
  }
  if (addSkills) {
    for (const dir of skillDirs) {
      const { installed, skipped } = installSkills(skillsSource, dir);
      const kept = skipped.length > 0 ? ` Kept your own folders of the same name: ${skipped.join(', ')}.` : '';
      log(`Skills: ${installed.length} in ${tilde(dir)}.${kept}`);
    }
  }

  if (done.length > 0) log(`Next: ${done[0].nextStep}`);
  return done.length === chosen.length ? 0 : 1;
}
