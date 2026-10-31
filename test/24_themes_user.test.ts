import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allThemeIds, loadUserTheme, themeDir, DEFAULT_THEME } from '../src/core/themes.js';
import { ConfigError } from '../src/core/types.js';

// 02 §3 — user themes: themeDir / loadUserTheme / allThemeIds.
const tmp = mkdtempSync(join(tmpdir(), 'trimd-24-'));
const xdg = join(tmp, 'xdg');
const themesDir = join(xdg, 'trimd', 'themes');
mkdirSync(themesDir, { recursive: true });

// Valid user theme with only two colors — the rest must merge from DEFAULT_THEME.
writeFileSync(join(themesDir, 'night.json'), JSON.stringify({
  id: 'night',
  name: 'Night',
  colors: { heading1: '38;5;45', dim: '1' },
}));
// Id mismatch: filename bad.json but id says "other".
writeFileSync(join(themesDir, 'bad.json'), JSON.stringify({ id: 'other', colors: { link: '1' } }));
// Bad JSON.
writeFileSync(join(themesDir, 'ugly.json'), '{ not json');
// Non-string color value.
writeFileSync(join(themesDir, 'nstring.json'), JSON.stringify({ id: 'nstring', colors: { link: 42 } }));
// User theme defining a new frontmatter slot (ISSUE-009).
writeFileSync(join(themesDir, 'metaslot.json'), JSON.stringify({ id: 'metaslot', colors: { metaLabel: '35' } }));

const prevXDG = process.env.XDG_CONFIG_HOME;
process.env.XDG_CONFIG_HOME = xdg;
test.after(() => {
  if (prevXDG === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXDG;
  rmSync(tmp, { recursive: true, force: true });
});

test('themeDir() honors $XDG_CONFIG_HOME/trimd/themes (02 §3)', () => {
  assert.equal(themeDir(), join(xdg, 'trimd', 'themes'));
});

test('allThemeIds(): builtins first, then user ids from the dir listing (02 §3)', () => {
  const ids = allThemeIds();
  assert.deepEqual(ids.slice(0, 3), ['default', 'light', 'dracula'], 'builtins in order');
  assert.ok(ids.includes('night'), 'user theme id from themes/night.json');
  // other .json files list too (they are candidate ids; validation happens in loadUserTheme)
  assert.ok(ids.includes('bad') && ids.includes('ugly') && ids.includes('nstring'));
});

test("loadUserTheme('night'): merged theme — missing keys inherit from DEFAULT_THEME (02 §3)", () => {
  const t = loadUserTheme('night');
  assert.ok(t !== null, 'night loads');
  assert.equal(t!.id, 'night');
  assert.equal(t!.name, 'Night');
  assert.equal(t!.colors.heading1, '38;5;45', 'user color wins');
  assert.equal(t!.colors.dim, '1', 'user color wins');
  assert.equal(t!.colors.link, DEFAULT_THEME.colors.link, 'missing key inherits default');
  assert.equal(t!.colors.calloutTip, DEFAULT_THEME.colors.calloutTip, 'missing key inherits default');
  assert.equal(Object.keys(t!.colors).length, Object.keys(DEFAULT_THEME.colors).length, 'full color set');
});

test("loadUserTheme: new frontmatter slot merges in (02 §3, ISSUE-009)", () => {
  const t = loadUserTheme('metaslot');
  assert.ok(t !== null, 'metaslot loads');
  assert.equal(t!.colors.metaLabel, '35', 'new slot from the user theme');
  assert.equal(t!.colors.metaKey, DEFAULT_THEME.colors.metaKey, 'missing new slot inherits default');
  assert.equal(t!.colors.metaValue, DEFAULT_THEME.colors.metaValue, 'missing new slot inherits default');
  assert.equal(Object.keys(t!.colors).length, Object.keys(DEFAULT_THEME.colors).length, 'full color set (32 keys)');
});

test("loadUserTheme: id-mismatch file → ConfigError (02 §3)", () => {
  assert.throws(() => loadUserTheme('bad'), ConfigError);
});

test('loadUserTheme: bad JSON → ConfigError (02 §3)', () => {
  assert.throws(() => loadUserTheme('ugly'), ConfigError);
});

test('loadUserTheme: non-string color value → ConfigError (02 §3)', () => {
  assert.throws(() => loadUserTheme('nstring'), ConfigError);
});

test('loadUserTheme: unknown id (absent file) → null (02 §3)', () => {
  assert.equal(loadUserTheme('missing'), null);
});
