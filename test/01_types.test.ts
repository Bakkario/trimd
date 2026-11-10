import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  paint,
  themeDir,
  loadUserTheme,
  allThemeIds,
} from '../src/core/themes.js';
import { ConfigError } from '../src/core/types.js';
import type { Theme } from '../src/core/types.js';

// hermetic: point themeDir() at a temp dir
process.env.XDG_CONFIG_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'trimd-t1-'));

const EXPECTED_COLORS = [
  'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
  'bold', 'italic', 'strike', 'inlineCode', 'codeLabel', 'link', 'tag', 'quote',
  'metaLabel', 'metaKey', 'metaValue',
  'tableHead', 'tableBorder', 'hr', 'dim', 'success', 'warning', 'error', 'info',
  'calloutNote', 'calloutTip', 'calloutInfo', 'calloutSuccess', 'calloutQuestion',
  'calloutWarning', 'calloutDanger', 'sidebar', 'statusOk', 'statusWarn',
  'search',
  'headerBg', 'accentPill', 'codeBg', 'calloutBg', 'tagChip', 'linkHint', 'activeDoc', 'scrollbar',
];

test('four built-ins, 41 colors each (Phase 3 Task 6.1, 13.2)', () => {
  assert.equal(Object.keys(BUILTIN_THEMES).length, 4);
  const phase3Slots = ['headerBg', 'accentPill', 'codeBg', 'calloutBg', 'tagChip', 'linkHint', 'activeDoc', 'scrollbar'] as const;
  for (const t of Object.values(BUILTIN_THEMES) as Theme[]) {
    assert.deepEqual(Object.keys(t.colors).sort(), [...EXPECTED_COLORS].sort());
    assert.ok(typeof t.id === 'string' && t.id.length > 0);
    assert.ok(typeof t.name === 'string' && t.name.length > 0);
    for (const slot of phase3Slots) {
      assert.ok(t.colors[slot].length > 0, `built-in ${t.id} has non-empty ${slot}`);
    }
  }
});

test('paint wraps with SGR; empty color is plain', () => {
  assert.equal(paint(DEFAULT_THEME, 'bold', 'hi'), '\x1b[38;5;255mhi\x1b[0m');
  assert.equal(paint(DEFAULT_THEME, 'italic', 'plain'), 'plain');
});

test('loadUserTheme: missing => null, valid => merge over default', () => {
  const dir = themeDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'testtheme.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ id: 'testtheme', name: 'Test Theme', colors: { link: '38;5;200' } }),
  );
  try {
    assert.equal(loadUserTheme('definitely-missing-theme'), null);
    const t = loadUserTheme('testtheme');
    assert.ok(t);
    assert.equal(t.id, 'testtheme');
    assert.equal(t.name, 'Test Theme');
    assert.equal(t.colors.link, '38;5;200');
    // merged over defaults
    assert.equal(t.colors.bold, DEFAULT_THEME.colors.bold);
    assert.deepEqual(Object.keys(t.colors).sort(), [...EXPECTED_COLORS].sort());
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('loadUserTheme: id mismatch / bad json / non-string color => ConfigError', () => {
  const dir = themeDir();
  fs.mkdirSync(dir, { recursive: true });
  const cases: Array<[string, unknown]> = [
    ['t-mismatch', { id: 'other', colors: {} }],
    ['t-badjson', undefined],
    ['t-badcolor', { id: 't-badcolor', colors: { link: 5 } }],
  ];
  const files = cases.map(([id]) => path.join(dir, id + '.json'));
  for (const f of files) fs.rmSync(f, { force: true });
  fs.writeFileSync(files[0], JSON.stringify(cases[0][1]));
  fs.writeFileSync(files[1], '{ not json');
  fs.writeFileSync(files[2], JSON.stringify(cases[2][1]));
  for (const [id] of cases) {
    assert.throws(() => loadUserTheme(id), ConfigError);
  }
  for (const f of files) fs.rmSync(f, { force: true });
});

test('allThemeIds: built-ins first, then user themes', () => {
  const dir = themeDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'user-a.json');
  fs.writeFileSync(file, JSON.stringify({ id: 'user-a', colors: {} }));
  try {
    const ids = allThemeIds();
    assert.equal(ids.slice(0, 4).join(','), 'default,light,dracula,tokyo-night');
    assert.ok(ids.includes('user-a'));
  } finally {
    fs.rmSync(file, { force: true });
  }
});
