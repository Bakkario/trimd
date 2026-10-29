import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens } from '../src/core/renderer.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import type { RenderedLine } from '../src/core/types.js';

const C = DEFAULT_THEME.colors;
const dir = mkdtempSync(join(tmpdir(), 'trimd-17-'));
writeFileSync(join(dir, 'target.md'), 'x');
function rctx(sourceDir: string): { theme: typeof DEFAULT_THEME; width: number; sourceDir: string; resolve: (t: string) => string | null } {
  return { theme: DEFAULT_THEME, width: 80, sourceDir, resolve: (t) => (t.startsWith('/') ? t : join(sourceDir, t)) };
}
function render(src: string): RenderedLine[] { return renderTokens(parseTokens(src), rctx(dir)).lines; }
const DIM = '\x1b[2m';
const RST = '\x1b[0m';
const LNK = '\x1b[38;5;39m';
const QUOTE = '\x1b[2;38;5;245m';
const OSC = (url: string): string => '\x1b]8;url=' + url + '\x1b\\';
const OSCE = '\x1b]8;;\x1b\\';

test('blockquote lines each get exact `│ ` prefix in quote color', () => {
  const ls = render('> para one\n>\n> para two');
  assert.equal(ls.length, 2);
  assert.equal(ls[0].text, QUOTE + '│ ' + RST + 'para one');
  assert.equal(ls[1].text, QUOTE + '│ ' + RST + 'para two');
});

test('nested blockquotes get `│ │ ` prefix', () => {
  const ls = render('> > nested');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, QUOTE + '│ ' + RST + QUOTE + '│ ' + RST + 'nested');
});

test('resolved local link: exact OSC 8 bytes; LinkSpan cols match visible label', () => {
  const target = join(dir, 'target.md');
  const ls = render('see [note](target.md) now');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, 'see ' + OSC('file://' + target) + LNK + 'note' + RST + OSCE + ' now');
  assert.equal(ls[0].links.length, 1);
  const span = ls[0].links[0];
  assert.equal(span.line, 0);
  assert.equal(span.startCol, 4);
  assert.equal(span.endCol, 8);
  assert.equal(span.href, target);
  assert.equal(span.kind, 'file');
  assert.equal(span.resolved, true);
});

test('http link: href kept as-is, kind http', () => {
  const ls = render('[site](https://example.com/x)');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, OSC('https://example.com/x') + LNK + 'site' + RST + OSCE);
  assert.equal(ls[0].links.length, 1);
  assert.equal(ls[0].links[0].kind, 'http');
  assert.equal(ls[0].links[0].href, 'https://example.com/x');
});

test('missing local file: dim text + ` ⚠`, no span, no OSC 8', () => {
  const ls = render('[gone](definitely-missing-xyz.md)');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, DIM + 'gone' + RST + DIM + ' ⚠' + RST);
  assert.equal(ls[0].links.length, 0);
  assert.ok(!ls[0].text.includes('\x1b]8;'));
});

test('anchor-only link: plain dim text, no span, no warning', () => {
  const ls = render('[top](#top)');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, DIM + 'top' + RST);
  assert.equal(ls[0].links.length, 0);
});

test('unresolved (resolve → null): dim text + ` ⚠`, no span', () => {
  const ls = renderTokens(parseTokens('[nope](whatever.md)'), { theme: DEFAULT_THEME, width: 80, sourceDir: dir, resolve: () => null }).lines;
  assert.equal(ls[0].text, DIM + 'nope' + RST + DIM + ' ⚠' + RST);
  assert.equal(ls[0].links.length, 0);
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});
