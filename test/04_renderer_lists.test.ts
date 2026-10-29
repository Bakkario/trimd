import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens } from '../src/core/renderer.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import type { RenderedLine } from '../src/core/types.js';

const C = DEFAULT_THEME.colors;
const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null };
function render(src: string): RenderedLine[] { return renderTokens(parseTokens(src), rctx).lines; }
function strip(s: string): string { return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;[^\\]*\\/g, ''); }
const DIM = '\x1b[' + C.dim + 'm';
const SUC = '\x1b[' + C.success + 'm';
const RST = '\x1b[0m';

test('nested bullet lists indent 2 spaces per level (• dim)', () => {
  const ls = render('- a\n  - b\n    - c');
  assert.equal(ls.length, 3);
  assert.equal(ls[0].text, DIM + '•' + RST + ' a');
  assert.equal(ls[1].text, '  ' + DIM + '•' + RST + ' b');
  assert.equal(ls[2].text, '    ' + DIM + '•' + RST + ' c');
});

test('ordered numbering computed positionally (dim)', () => {
  const ls = render('1. one\n2. two\n\n3. three\n4. four');
  assert.equal(ls.length, 4);
  assert.equal(ls[0].text, DIM + '1.' + RST + ' one');
  assert.equal(ls[1].text, DIM + '2.' + RST + ' two');
  assert.equal(ls[2].text, DIM + '3.' + RST + ' three');
  assert.equal(ls[3].text, DIM + '4.' + RST + ' four');
});

test('task items: [ ] all dim; [x] x in success; one space after box', () => {
  const ls = render('- [ ] todo\n- [x] done');
  assert.equal(ls.length, 2);
  assert.equal(ls[0].text, DIM + '[' + RST + DIM + ' ' + RST + DIM + ']' + RST + ' todo');
  assert.equal(ls[1].text, DIM + '[' + RST + SUC + 'x' + RST + DIM + ']' + RST + ' done');
});

test('nested task items inherit indentation', () => {
  const ls = render('- [x] a\n  - [ ] b');
  assert.equal(ls.length, 2);
  assert.equal(ls[0].text, DIM + '[' + RST + SUC + 'x' + RST + DIM + ']' + RST + ' a');
  assert.equal(ls[1].text, '  ' + DIM + '[' + RST + DIM + ' ' + RST + DIM + ']' + RST + ' b');
});

test('INV-1.2: no raw "- " markers at line starts', () => {
  const ls = render('- a\n- b\n  - c');
  for (const l of ls) {
    const v = strip(l.text);
    assert.ok(!/^- /.test(v), 'leftover "- " in: ' + v);
    assert.ok(!/^\t/.test(v), 'leftover tab in: ' + v);
  }
});
