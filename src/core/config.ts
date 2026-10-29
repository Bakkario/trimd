import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Config } from './types.js';
import { ConfigError, UsageError } from './types.js';

// 02 §4 — config contract.

export const DEFAULTS: Config =
  { theme: 'default', showFrontmatter: true, sidebarOpen: true, showHidden: false };

export interface ParsedArgs {
  file: string | null;
  flags: {
    root?: string; theme?: string; config?: string;
    noFrontmatter?: boolean; noSidebar?: boolean; hidden?: boolean;
    width?: number; debug?: boolean; help?: boolean;
  };
}

// $XDG_CONFIG_HOME/trimd/config.json or ~/.config/trimd/config.json (02 §4, INV-4.1).
export function defaultConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, 'trimd', 'config.json')
    : join(homedir(), '.config', 'trimd', 'config.json');
  return base;
}

// 02 §4 — throws UsageError on unknown flag / bad width / missing value /
// more than one positional file argument.
export function parseArgs(argv: string[]): ParsedArgs {
  let file: string | null = null;
  const flags: ParsedArgs['flags'] = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') flags.help = true;
    else if (a === '--no-frontmatter') flags.noFrontmatter = true;
    else if (a === '--no-sidebar') flags.noSidebar = true;
    else if (a === '--hidden') flags.hidden = true;
    else if (a === '--debug') flags.debug = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      // Unknown flags are detected before value consumption (03: unknown flag
      // → UsageError('unknown flag: --x')), even in the value form --bogus=x.
      if (name !== 'root' && name !== 'theme' && name !== 'config' && name !== 'width') {
        throw new UsageError('unknown flag: --' + name);
      }
      let val: string;
      if (eq !== -1) {
        val = a.slice(eq + 1);
      } else {
        i++;
        val = argv[i];
        if (val === undefined) throw new UsageError('missing value for ' + a);
      }
      switch (name) {
        case 'root': flags.root = val; break;
        case 'theme': flags.theme = val; break;
        case 'config': flags.config = val; break;
        case 'width': {
          const n = Number(val);
          if (!Number.isInteger(n) || n <= 0) throw new UsageError('invalid --width: ' + val);
          flags.width = n;
          break;
        }
        default: throw new UsageError('unknown flag: --' + name);
      }
    } else if (file === null) file = a;
    else throw new UsageError('unexpected argument: ' + a);
  }
  return { file, flags };
}

// 02 §4 — ENOENT (or empty file) → DEFAULTS; bad JSON → ConfigError
// (INV-4.2: stderr `trimd: config: <path>: <error>`). Partial configs merge
// over DEFAULTS; present keys with a wrong type → ConfigError.
export function loadConfig(path: string): Config {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULTS };
    throw new ConfigError('config: ' + path + ': ' + (e as Error).message);
  }
  if (raw.trim() === '') return { ...DEFAULTS };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError('config: ' + path + ': ' + (e as Error).message);
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new ConfigError('config: ' + path + ': must be a JSON object');
  }
  const obj = json as Record<string, unknown>;
  const cfg: Config = { ...DEFAULTS };
  if (obj.theme !== undefined) {
    if (typeof obj.theme !== 'string') throw new ConfigError('config: ' + path + ': theme must be a string');
    cfg.theme = obj.theme;
  }
  if (obj.showFrontmatter !== undefined) {
    if (typeof obj.showFrontmatter !== 'boolean') throw new ConfigError('config: ' + path + ': showFrontmatter must be a boolean');
    cfg.showFrontmatter = obj.showFrontmatter;
  }
  if (obj.sidebarOpen !== undefined) {
    if (typeof obj.sidebarOpen !== 'boolean') throw new ConfigError('config: ' + path + ': sidebarOpen must be a boolean');
    cfg.sidebarOpen = obj.sidebarOpen;
  }
  if (obj.showHidden !== undefined) {
    if (typeof obj.showHidden !== 'boolean') throw new ConfigError('config: ' + path + ': showHidden must be a boolean');
    cfg.showHidden = obj.showHidden;
  }
  if (obj.width !== undefined) {
    if (typeof obj.width !== 'number' || !Number.isInteger(obj.width) || obj.width <= 0) {
      throw new ConfigError('config: ' + path + ': width must be a positive integer');
    }
    cfg.width = obj.width;
  }
  return cfg;
}

// 02 §4 — returns a new object; every defined flag wins; width 0 or absent → unset
// (config value kept).
export function mergeConfig(cfg: Config, f: ParsedArgs['flags']): Config {
  const out: Config = { ...cfg };
  if (f.theme !== undefined) out.theme = f.theme;
  if (f.noFrontmatter !== undefined) out.showFrontmatter = !f.noFrontmatter;
  if (f.noSidebar !== undefined) out.sidebarOpen = !f.noSidebar;
  if (f.hidden !== undefined) out.showHidden = f.hidden;
  if (f.width !== undefined && f.width !== 0) out.width = f.width;
  return out;
}
