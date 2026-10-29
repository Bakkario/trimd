import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens } from '../src/core/renderer.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import type { RenderedLine } from '../src/core/types.js';

const C = DEFAULT_THEME.colors;
const dir = mkdtempSync(join(tmpdir(), 'trimd-23-'));
after(() => rmSync(dir, { recursive: true, force: true }));
function rctx(): { theme: typeof DEFAULT_THEME; width: number; sourceDir: string; resolve: (t: string) => string | null } {
  return { theme: DEFAULT_THEME, width: 80, sourceDir: dir, resolve: (t) => (t.startsWith('/') ? t : join(dir, t)) };
}
function render(src: string): RenderedLine[] { return renderTokens(parseTokens(src), rctx()).lines; }
const TAG = (s: string): string => '\x1b[38;5;208m' + s + '\x1b[0m';

test('See #topic/sub and #x_y. — both chips colored, surrounding text untouched', () => {
  const ls = render('See #topic/sub and #x_y.');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, 'See ' + TAG('#topic/sub') + ' and ' + TAG('#x_y.'));
});

test('# Heading is not tagged (block rule consumes it)', () => {
  const ls = render('# Heading');
  assert.equal(ls.length, 1);
  const v = ls[0].text.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(v, 'Heading');
  assert.ok(!ls[0].text.includes('\x1b[38;5;208m'));
});

test('C# is not tagged (no preceding whitespace)', () => {
  const ls = render('C#');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, 'C#');
});
