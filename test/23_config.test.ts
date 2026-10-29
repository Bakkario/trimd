import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS, parseArgs, loadConfig, mergeConfig, defaultConfigPath } from '../src/core/config.js';
import type { Config } from '../src/core/types.js';
import { ConfigError, UsageError } from '../src/core/types.js';
import { resolveTheme, LIGHT_THEME, DRACULA_THEME, DEFAULT_THEME, PLAIN_THEME } from '../src/core/themes.js';

const tmp = mkdtempSync(join(tmpdir(), 'trimd-23-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

// --- parseArgs (02 §4) ---

test('parseArgs: happy path — file + all flags, both --name value and --name=value forms (02 §4)', () => {
  const p = parseArgs(['a.md', '--root', 'r', '--theme=light', '--no-frontmatter', '--no-sidebar', '--hidden', '--width', '60', '--debug', '--config', 'c.json']);
  assert.equal(p.file, 'a.md');
  assert.deepEqual(p.flags, {
    root: 'r', theme: 'light', noFrontmatter: true, noSidebar: true, hidden: true, width: 60, debug: true, config: 'c.json',
  });
});

test('parseArgs: no file → file null; -h/--help set help (02 §4)', () => {
  assert.equal(parseArgs([]).file, null);
  assert.equal(parseArgs(['-h']).flags.help, true);
  assert.equal(parseArgs(['--help']).flags.help, true);
});

test('parseArgs: unknown flag → UsageError("unknown flag: --x"), both forms (02 §4)', () => {
  assert.throws(() => parseArgs(['a.md', '--bogus']), (e: unknown) =>
    e instanceof UsageError && e.message === 'unknown flag: --bogus');
  assert.throws(() => parseArgs(['a.md', '--bogus=x']), (e: unknown) =>
    e instanceof UsageError && e.message === 'unknown flag: --bogus');
});

test('parseArgs: bad --width → UsageError (non-integer, 0, negative, missing value) (02 §4)', () => {
  for (const argv of [['a.md', '--width', 'x'], ['a.md', '--width', '0'], ['a.md', '--width', '-5'], ['a.md', '--width', '6.5'], ['a.md', '--width']]) {
    assert.throws(() => parseArgs(argv), UsageError, JSON.stringify(argv));
  }
});

test('parseArgs: second positional argument → UsageError (02 §4)', () => {
  assert.throws(() => parseArgs(['a.md', 'b.md']), UsageError);
});

// --- mergeConfig (02 §4: flag beats config beats default) ---

const fullCfg: Config = { theme: 'light', showFrontmatter: false, sidebarOpen: false, showHidden: true, width: 70 };
const allFlags = { root: 'r', theme: 'dracula', noFrontmatter: true, noSidebar: true, hidden: true, width: 50, debug: true, config: 'c.json' };

test('mergeConfig: every defined flag wins over config for all 5 keys (02 §4, INV-4.1)', () => {
  const m = mergeConfig(fullCfg, allFlags);
  assert.equal(m.theme, 'dracula', 'flag theme beats config');
  assert.equal(m.showFrontmatter, false, '--no-frontmatter beats config showFrontmatter:false (same value, flag path taken)');
  assert.equal(m.sidebarOpen, false, '--no-sidebar beats config sidebarOpen:false');
  assert.equal(m.showHidden, true, '--hidden beats config showHidden:true');
  assert.equal(m.width, 50, 'flag width beats config width');
});

test('mergeConfig: flags absent → config kept for all 5 keys (02 §4)', () => {
  const m = mergeConfig(fullCfg, {});
  assert.deepEqual(m, fullCfg);
});

test('mergeConfig: defaults beat nothing; config beats defaults (02 §4)', () => {
  const m = mergeConfig(DEFAULTS, {});
  assert.equal(m.theme, 'default');
  assert.equal(m.showFrontmatter, true);
  assert.equal(m.sidebarOpen, true);
  assert.equal(m.showHidden, false);
  assert.equal(m.width, undefined);
  const partial: Config = { ...DEFAULTS, theme: 'light' };
  const m2 = mergeConfig(partial, {});
  assert.equal(m2.theme, 'light', 'config theme kept');
  assert.equal(m2.showFrontmatter, true, 'default kept for absent config key');
});

test('mergeConfig: width 0 or absent → unset (config value kept) (02 §4)', () => {
  assert.equal(mergeConfig(fullCfg, { width: 0 }).width, 70, 'width 0 keeps config width');
  assert.equal(mergeConfig(fullCfg, {}).width, 70, 'absent width keeps config width');
  assert.equal(mergeConfig(DEFAULTS, { width: 0 }).width, undefined, 'width 0 with no config width → unset');
});

test('mergeConfig: returns a new object, does not mutate the input config (02 §4)', () => {
  const before = { ...fullCfg };
  mergeConfig(fullCfg, allFlags);
  assert.deepEqual(fullCfg, before);
});

// --- loadConfig (02 §4, INV-4.2) ---

test('loadConfig: missing file → DEFAULTS (02 §4)', () => {
  assert.deepEqual(loadConfig(join(tmp, 'nope.json')), DEFAULTS);
});

test('loadConfig: empty file → DEFAULTS, no error (INV-4.2)', () => {
  const p = join(tmp, 'empty.json');
  writeFileSync(p, '   \n');
  assert.deepEqual(loadConfig(p), DEFAULTS);
});

test('loadConfig: partial config merges over DEFAULTS (02 §4)', () => {
  const p = join(tmp, 'partial.json');
  writeFileSync(p, JSON.stringify({ theme: 'light', showFrontmatter: false }));
  assert.deepEqual(loadConfig(p), { theme: 'light', showFrontmatter: false, sidebarOpen: true, showHidden: false });
});

test('loadConfig: bad JSON → ConfigError with "config: <path>: <error>" message (INV-4.2)', () => {
  const p = join(tmp, 'bad.json');
  writeFileSync(p, '{ not json');
  assert.throws(() => loadConfig(p), (e: unknown) =>
    e instanceof ConfigError && (e as Error).message.startsWith('config: ' + p + ': '));
});

test('loadConfig: non-object JSON → ConfigError (02 §4)', () => {
  const p = join(tmp, 'arr.json');
  writeFileSync(p, '[1,2,3]');
  assert.throws(() => loadConfig(p), ConfigError);
});

test('loadConfig: wrong key type → ConfigError (02 §4)', () => {
  const p = join(tmp, 'wrongtype.json');
  writeFileSync(p, JSON.stringify({ theme: 42 }));
  assert.throws(() => loadConfig(p), ConfigError);
});

// --- resolveTheme (02 §4, INV-4.3, ADR-016) ---

test('resolveTheme: NO_COLOR set (any value) → PLAIN_THEME, ignoring --theme (02 §4, INV-4.3)', () => {
  assert.equal(resolveTheme({ NO_COLOR: '1' } as NodeJS.ProcessEnv, { theme: 'dracula' }, { ...DEFAULTS }), PLAIN_THEME);
  assert.equal(resolveTheme({ NO_COLOR: '' } as NodeJS.ProcessEnv, {}, { ...DEFAULTS }), PLAIN_THEME, 'NO_COLOR="" still counts as set');
});

test('resolveTheme: TERM=dumb → PLAIN_THEME (02 §4, INV-4.3)', () => {
  assert.equal(resolveTheme({ TERM: 'dumb' } as NodeJS.ProcessEnv, { theme: 'light' }, { ...DEFAULTS }), PLAIN_THEME);
});

test('resolveTheme: --theme beats config beats default (02 §4)', () => {
  assert.equal(resolveTheme({}, { theme: 'light' }, { ...DEFAULTS }), LIGHT_THEME);
  assert.equal(resolveTheme({}, {}, { ...DEFAULTS, theme: 'dracula' }), DRACULA_THEME);
  assert.equal(resolveTheme({}, {}, { ...DEFAULTS }), DEFAULT_THEME);
  assert.equal(resolveTheme({}, { theme: 'light' }, { ...DEFAULTS, theme: 'dracula' }), LIGHT_THEME);
});

test('resolveTheme: unknown id → ConfigError (02 §4)', () => {
  assert.throws(() => resolveTheme({}, { theme: 'nope' }, { ...DEFAULTS }), ConfigError);
});

// --- defaultConfigPath (02 §4, INV-4.1) ---

test('defaultConfigPath: $XDG_CONFIG_HOME/trimd/config.json or ~/.config/trimd/config.json (02 §4)', () => {
  const prev = process.env.XDG_CONFIG_HOME;
  try {
    process.env.XDG_CONFIG_HOME = join(tmp, 'xdg');
    assert.equal(defaultConfigPath(), join(tmp, 'xdg', 'trimd', 'config.json'));
    delete process.env.XDG_CONFIG_HOME;
    assert.equal(defaultConfigPath().endsWith('.config/trimd/config.json'), true);
  } finally {
    if (prev === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = prev;
  }
});
