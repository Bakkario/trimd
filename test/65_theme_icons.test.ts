import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOKYO_NIGHT_THEME,
  DEFAULT_THEME,
  resolveIconSet,
  detectNerdFont,
  NERD_ICONS,
  EMOJI_ICONS,
  ASCII_ICONS,
  NONE_ICONS,
} from '../src/core/themes.js';
import { parseArgs, loadConfig } from '../src/core/config.js';
import { getEntryIcon } from '../src/ui/Sidebar.js';
import { UsageError, ConfigError } from '../src/core/types.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Theme-defined icons and configurable icon sets (ADR-036, ISSUE-023)', async (t) => {
  await t.test('TOKYO_NIGHT_THEME defaults to nerd icons', () => {
    assert.equal(TOKYO_NIGHT_THEME.icons, 'nerd');
    const set = resolveIconSet({}, TOKYO_NIGHT_THEME.icons);
    assert.equal(set.dir, NERD_ICONS.dir);
    assert.equal(set.file, NERD_ICONS.file);
    assert.ok(set.dir.includes(''), 'contains nerd font folder glyph');
    assert.ok(set.file.includes(''), 'contains nerd font markdown glyph');
  });

  await t.test('resolveIconSet handles ascii, none, and emoji presets', () => {
    const ascii = resolveIconSet({}, 'ascii');
    assert.equal(ascii.dir, '/ ');
    assert.equal(ascii.active, '* ');

    const none = resolveIconSet({}, 'none');
    assert.equal(none.dir, '');
    assert.equal(none.file, '');
    assert.equal(none.active, '● ');

    const emoji = resolveIconSet({}, 'emoji');
    assert.equal(emoji.dir, '📁 ');
    assert.equal(emoji.file, '📄 ');
  });

  await t.test('detectNerdFont checks NERD_FONT env and modern terminal signatures', () => {
    assert.equal(detectNerdFont({}), false);
    assert.equal(detectNerdFont({ NERD_FONT: '1' }), true);
    assert.equal(detectNerdFont({ USE_NERD_FONT: '1' }), true);
    assert.equal(detectNerdFont({ TRIMD_ICONS: 'nerd' }), true);
    assert.equal(detectNerdFont({ KITTY_WINDOW_ID: '1' }), true);
    assert.equal(detectNerdFont({ GHOSTTY_RESOURCES_DIR: '/opt/ghostty' }), true);
    assert.equal(detectNerdFont({ WEZTERM_PANE: '0' }), true);
  });

  await t.test('auto mode detects nerd font or falls back to emoji', () => {
    const withNerd = resolveIconSet({ NERD_FONT: '1' }, 'auto');
    assert.equal(withNerd.dir, NERD_ICONS.dir);

    const withoutNerd = resolveIconSet({}, 'auto');
    assert.equal(withoutNerd.dir, EMOJI_ICONS.dir);
  });

  await t.test('custom icon mapping in theme merges over base', () => {
    const custom = resolveIconSet({}, { dir: '📂 ', file: '📝 ' });
    assert.equal(custom.dir, '📂 ');
    assert.equal(custom.file, '📝 ');
  });

  await t.test('configIcons overrides themeIcons', () => {
    // Theme says nerd, but config says ascii
    const set = resolveIconSet({}, 'nerd', 'ascii');
    assert.equal(set.dir, '/ ');
  });

  await t.test('parseArgs parses --icons flag or throws on invalid', () => {
    const parsed1 = parseArgs(['doc.md', '--icons=nerd']);
    assert.equal(parsed1.flags.icons, 'nerd');

    const parsed2 = parseArgs(['doc.md', '--icons', 'none']);
    assert.equal(parsed2.flags.icons, 'none');

    assert.throws(() => parseArgs(['doc.md', '--icons', 'invalid']), UsageError);
  });

  await t.test('loadConfig validates icons property', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'trimd-cfg-icons-'));
    try {
      const cfgPath = join(tmp, 'config.json');
      writeFileSync(cfgPath, JSON.stringify({ icons: 'ascii' }));
      const cfg = loadConfig(cfgPath);
      assert.equal(cfg.icons, 'ascii');

      writeFileSync(cfgPath, JSON.stringify({ icons: 'invalid-mode' }));
      assert.throws(() => loadConfig(cfgPath), ConfigError);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await t.test('getEntryIcon renders according to active icon set', () => {
    const dirEntry = { name: 'docs', isDir: true, abs: '/test/docs' };
    const mdEntry = { name: 'notes.md', isDir: false, abs: '/test/notes.md' };

    // With Nerd Font
    const nerdDirIcon = getEntryIcon(dirEntry, false, false, DEFAULT_THEME, NERD_ICONS);
    assert.ok(nerdDirIcon.includes(''), 'nerd dir icon');
    const nerdMdIcon = getEntryIcon(mdEntry, false, false, DEFAULT_THEME, NERD_ICONS);
    assert.ok(nerdMdIcon.includes(''), 'nerd md icon');

    // With ASCII
    const asciiDirIcon = getEntryIcon(dirEntry, false, false, DEFAULT_THEME, ASCII_ICONS);
    assert.ok(asciiDirIcon.includes('/'), 'ascii dir icon');

    // With None
    const noneDirIcon = getEntryIcon(dirEntry, false, false, DEFAULT_THEME, NONE_ICONS);
    assert.equal(noneDirIcon, '', 'none dir icon is empty');
  });
});
