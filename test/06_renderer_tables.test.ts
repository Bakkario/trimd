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
const HEAD = '\x1b[1;' + C.tableHead + 'm';
const RST = '\x1b[0m';
const BORDER = '\x1b[' + C.tableBorder + 'm';

test('2x2 table renders 5 visible lines with box borders (top, header, sep, row, bottom)', () => {
  const ls = render('| Name | Value |\n| --- | --- |\n| cpu  | 80%   |');
  assert.equal(ls.length, 5);
  assert.equal(ls[0].text, BORDER + '╭──────┬───────╮' + RST);
  assert.equal(ls[1].text, BORDER + '│ ' + RST + HEAD + 'Name' + RST + ' ' + BORDER + '│ ' + RST + HEAD + 'Value' + RST + ' ' + BORDER + '│' + RST);
  assert.equal(ls[2].text, BORDER + '├──────┼───────┤' + RST);
  assert.equal(ls[3].text, BORDER + '│ ' + RST + 'cpu  ' + BORDER + '│ ' + RST + '80%   ' + BORDER + '│' + RST);
  assert.equal(ls[4].text, BORDER + '╰──────┴───────╯' + RST);
});

test('columns align: col 2 starts at the same visible column in every row', () => {
  const ls = render('| aa | bbbb |\n| --- | --- |\n| a | cc |\n| aaa | c |');
  assert.equal(ls.length, 6);
  const v = ls.map((l) => strip(l.text));
  assert.equal(v[1], '│ aa  │ bbbb │');
  assert.equal(v[3], '│ a   │ cc   │');
  assert.equal(v[4], '│ aaa │ c    │');
  const col2First = ['b', 'c', 'c'];
  for (let k = 0; k < 3; k++) {
    const row: string = [v[1], v[3], v[4]][k];
    assert.equal(row.indexOf(col2First[k]), 8, 'col-2 start differs in: ' + row);
  }
});

test('wide table fits the pane: column width = max visible width (no cap, no truncation)', () => {
  const long = 'a'.repeat(45);
  const ls = render('| ' + long + ' | b |\n| --- | --- |\n| c | d |');
  assert.equal(ls.length, 5);
  assert.equal(strip(ls[0].text), '╭' + '─'.repeat(47) + '┬───╮');
  assert.equal(strip(ls[1].text), '│ ' + 'a'.repeat(45) + ' │ b │');
  assert.ok(ls[1].text.includes(HEAD), 'header cell stays bold');
  assert.equal(strip(ls[2].text), '├' + '─'.repeat(47) + '┼───┤');
  assert.equal(strip(ls[3].text), '│ c' + ' '.repeat(44) + ' │ d │');
  assert.equal(strip(ls[4].text), '╰' + '─'.repeat(47) + '┴───╯');
});

test('table wider than the pane: widths shrink (widest first, ties leftmost), cells wrap', () => {
  // natural 50+50 + 7 = 107 > 80 → shrinks columns so Σ widths + 7 <= 80 (36 + 37 + 7 = 80)
  const a50 = 'a'.repeat(50);
  const ls = render('| ' + a50 + ' | ' + a50 + ' |\n| --- | --- |\n| x | y |');
  assert.equal(ls.length, 6);
  assert.equal(strip(ls[0].text), '╭' + '─'.repeat(38) + '┬' + '─'.repeat(39) + '╮');
  assert.equal(strip(ls[1].text), '│ ' + 'a'.repeat(36) + ' │ ' + 'a'.repeat(37) + ' │', 'header line 1');
  assert.equal(strip(ls[2].text), '│ ' + 'a'.repeat(14) + ' '.repeat(22) + ' │ ' + 'a'.repeat(13) + ' '.repeat(24) + ' │', 'header line 2');
  assert.equal(strip(ls[3].text), '├' + '─'.repeat(38) + '┼' + '─'.repeat(39) + '┤', 'separator');
  assert.equal(strip(ls[4].text), '│ x' + ' '.repeat(35) + ' │ y' + ' '.repeat(36) + ' │', 'body row');
  assert.equal(strip(ls[5].text), '╰' + '─'.repeat(38) + '┴' + '─'.repeat(39) + '╯', 'bottom');
});

test('INV-1.2: no | pipes anywhere in table output', () => {
  const ls = render('| a | b |\n| --- | --- |\n| c | d |');
  for (const l of ls) assert.ok(!l.text.includes('|'), 'pipe in: ' + strip(l.text));
});
