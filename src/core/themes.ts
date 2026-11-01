import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Theme, ThemeColors, Config } from './types.js';
import { ConfigError } from './types.js';

export const DEFAULT_THEME: Theme = {
  id: 'default',
  name: 'default',
  colors: {
    heading1: '1;38;5;51',
    heading2: '1;38;5;45',
    heading3: '1;38;5;39',
    heading4: '1;38;5;38',
    heading5: '1;38;5;46',
    heading6: '1;38;5;46',
    bold: '38;5;255',
    italic: '',
    strike: '',
    inlineCode: '38;5;208',
    codeLabel: '2;38;5;245',
    link: '38;5;39',
    tag: '38;5;208',
    quote: '2;38;5;245',
    metaLabel: '2',
    metaKey: '2',
    metaValue: '2',
    tableHead: '1',
    tableBorder: '2;38;5;245',
    hr: '2;38;5;245',
    dim: '2',
    success: '38;5;42',
    warning: '38;5;214',
    error: '38;5;196',
    info: '38;5;39',
    calloutNote: '38;5;39',
    calloutTip: '38;5;208',
    calloutInfo: '38;5;51',
    calloutSuccess: '38;5;42',
    calloutQuestion: '38;5;63',
    calloutWarning: '38;5;214',
    calloutDanger: '38;5;196',
    sidebar: '38;5;252',
    statusOk: '2;38;5;245',
    statusWarn: '38;5;214',
    search: '38;5;214',
  },
};

export const LIGHT_THEME: Theme = {
  id: 'light',
  name: 'light',
  colors: {
    heading1: '1;38;5;26',
    heading2: '1;38;5;25',
    heading3: '1;38;5;24',
    heading4: '1;38;5;27',
    heading5: '1;38;5;25',
    heading6: '1;38;5;27',
    bold: '1;38;5;235',
    italic: '',
    strike: '',
    inlineCode: '38;5;88',
    codeLabel: '2;38;5;241',
    link: '38;5;21',
    tag: '38;5;88',
    quote: '2;38;5;241',
    metaLabel: '2',
    metaKey: '2',
    metaValue: '2',
    tableHead: '1',
    tableBorder: '2;38;5;241',
    hr: '2;38;5;241',
    dim: '2',
    success: '38;5;28',
    warning: '38;5;130',
    error: '38;5;124',
    info: '38;5;25',
    calloutNote: '38;5;21',
    calloutTip: '38;5;88',
    calloutInfo: '38;5;25',
    calloutSuccess: '38;5;28',
    calloutQuestion: '38;5;56',
    calloutWarning: '38;5;130',
    calloutDanger: '38;5;124',
    sidebar: '38;5;241',
    statusOk: '2;38;5;241',
    statusWarn: '38;5;130',
    search: '38;5;130',
  },
};

export const DRACULA_THEME: Theme = {
  id: 'dracula',
  name: 'dracula',
  colors: {
    heading1: '1;38;2;189;147;249',
    heading2: '1;38;2;80;250;123',
    heading3: '1;38;2;255;255;254',
    heading4: '1;38;2;255;255;254',
    heading5: '1;38;2;255;255;254',
    heading6: '1;38;2;255;255;254',
    bold: '1;38;2;255;255;254',
    italic: '',
    strike: '',
    inlineCode: '38;2;255;255;254',
    codeLabel: '2;38;2;98;114;164',
    link: '38;2;80;250;123',
    tag: '38;2;255;121;198',
    quote: '2;38;2;98;114;164',
    metaLabel: '2',
    metaKey: '2',
    metaValue: '2',
    tableHead: '1',
    tableBorder: '2;38;2;98;114;164',
    hr: '2;38;2;98;114;164',
    dim: '2',
    success: '38;2;80;250;123',
    warning: '38;2;241;250;140',
    error: '38;2;255;85;85',
    info: '38;2;98;114;255',
    calloutNote: '38;2;98;114;255',
    calloutTip: '38;2;255;121;198',
    calloutInfo: '38;2;98;114;255',
    calloutSuccess: '38;2;80;250;123',
    calloutQuestion: '38;2;255;184;108',
    calloutWarning: '38;2;241;250;140',
    calloutDanger: '38;2;255;85;85',
    sidebar: '38;2;241;250;140',
    statusOk: '2;38;2;98;114;164',
    statusWarn: '38;2;241;250;140',
    search: '38;2;241;250;140',
  },
};

const EMPTY_COLORS: ThemeColors = {
  heading1: '',
  heading2: '',
  heading3: '',
  heading4: '',
  heading5: '',
  heading6: '',
  bold: '',
  italic: '',
  strike: '',
  inlineCode: '',
  codeLabel: '',
  link: '',
  tag: '',
  quote: '',
  metaLabel: '',
  metaKey: '',
  metaValue: '',
  tableHead: '',
  tableBorder: '',
  hr: '',
  dim: '',
  success: '',
  warning: '',
  error: '',
  info: '',
  calloutNote: '',
  calloutTip: '',
  calloutInfo: '',
  calloutSuccess: '',
  calloutQuestion: '',
  calloutWarning: '',
  calloutDanger: '',
  sidebar: '',
  statusOk: '',
  statusWarn: '',
  search: '',
};

export const PLAIN_THEME: Theme = {
  id: 'plain',
  name: 'plain',
  colors: { ...EMPTY_COLORS },
};

export const BUILTIN_THEMES: Record<string, Theme> = {
  [DEFAULT_THEME.id]: DEFAULT_THEME,
  [LIGHT_THEME.id]: LIGHT_THEME,
  [DRACULA_THEME.id]: DRACULA_THEME,
};

/** Wrap text in SGR sequences for the given theme key; empty color => plain text. */
export function paint(theme: Theme, key: keyof ThemeColors, s: string): string {
  const v = theme.colors[key];
  if (v === '') return s;
  return '\x1b[' + v + 'm' + s + '\x1b[0m';
}

/** $XDG_CONFIG_HOME/trimd/themes or ~/.config/trimd/themes */
export function themeDir(): string {
  const base = process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, 'trimd', 'themes')
    : path.join(os.homedir(), '.config', 'trimd', 'themes');
  return base;
}

/**
 * Load a user theme from themeDir/<id>.json.
 * Returns null when the file does not exist.
 * Throws ConfigError on invalid JSON, id mismatch, or non-string colors.
 * Colors merge over DEFAULT_THEME.colors; unknown keys are ignored.
 */
export function loadUserTheme(id: string): Theme | null {
  const file = path.join(themeDir(), id + '.json');
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new ConfigError('cannot read theme ' + file + ': ' + (e as Error).message);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ConfigError('theme ' + file + ' is not valid JSON');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new ConfigError('theme ' + file + ' must be a JSON object');
  }
  const obj = json as Record<string, unknown>;
  if (obj.id !== id) {
    throw new ConfigError('theme id mismatch: file says ' + JSON.stringify(obj.id) + ', expected ' + id);
  }
  if (typeof obj.colors !== 'object' || obj.colors === null || Array.isArray(obj.colors)) {
    throw new ConfigError('theme ' + id + ' has no colors object');
  }
  for (const [k, v] of Object.entries(obj.colors as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      throw new ConfigError('theme ' + id + ': color ' + k + ' must be a string');
    }
  }
  const colors = { ...EMPTY_COLORS, ...DEFAULT_THEME.colors };
  for (const [k, v] of Object.entries(obj.colors as Record<string, string>)) {
    if (k in colors) (colors as Record<string, string>)[k] = v;
  }
  return { id, name: typeof obj.name === 'string' ? obj.name : id, colors };
}

/** All theme ids in order: built-ins first, then user themes (sorted). */
export function allThemeIds(): string[] {
  const ids = Object.keys(BUILTIN_THEMES);
  let user: string[] = [];
  try {
    user = fs
      .readdirSync(themeDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    user = [];
  }
  return [...ids, ...user];
}

/**
 * 02 §4: NO_COLOR / TERM=dumb → PLAIN_THEME (ignores --theme), else --theme → cfg.theme → 'default'.
 * Unknown id => ConfigError('unknown theme: <id>').
 */
export function resolveTheme(
  env: NodeJS.ProcessEnv,
  flags: { theme?: string | null },
  cfg: Config,
): Theme {
  if (env.NO_COLOR !== undefined || env.TERM === 'dumb') {
    return PLAIN_THEME;
  }
  const id = flags.theme || cfg.theme || 'default';
  const builtin = BUILTIN_THEMES[id];
  if (builtin) return builtin;
  const user = loadUserTheme(id);
  if (user) return user;
  throw new ConfigError("theme: unknown theme '" + id + "'");
}
