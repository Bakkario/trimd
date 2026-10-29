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

test('2x2 table renders 3 visible lines (header, separator, row)', () => {
  const ls = render('| Name | Value |\n| --- | --- |\n| cpu  | 80%   |');
  assert.equal(ls.length, 3);
  assert.equal(ls[0].text, HEAD + 'Name' + RST + ' ' + HEAD + 'Value' + RST);
  assert.equal(ls[1].text, BORDER + '──── ─────' + RST);
  assert.equal(ls[2].text, 'cpu  80%');
});

test('columns align: col 2 starts at the same visible column in every row', () => {
  const ls = render('| aa | bbbb |\n| --- | --- |\n| a | cc |\n| aaa | c |');
  assert.equal(ls.length, 4);
  const v = ls.map((l) => strip(l.text));
  assert.equal(v[0], 'aa  bbbb');
  assert.equal(v[2], 'a   cc');
  assert.equal(v[3], 'aaa c');
  const col2First = ['b', 'c', 'c'];
  for (let k = 0; k < 3; k++) {
    const row: string = [v[0], v[2], v[3]][k];
    assert.equal(row.indexOf(col2First[k]), 4, 'col-2 start differs in: ' + row);
  }
});

test('cell wider than 40 chars is truncated with … (width capped at 40)', () => {
  const long = 'a'.repeat(45);
  const ls = render('| ' + long + ' | b |\n| --- | --- |\n| c | d |');
  assert.equal(ls.length, 3);
  assert.equal(strip(ls[0].text), 'a'.repeat(39) + '… b');
  assert.ok(ls[0].text.startsWith(HEAD), 'truncated header cell stays bold');
  assert.equal(strip(ls[1].text), '─'.repeat(40) + ' ' + '─');
  assert.equal(strip(ls[2].text), 'c' + ' '.repeat(40) + 'd');
});

test('INV-1.2: no | pipes anywhere in table output', () => {
  const ls = render('| a | b |\n| --- | --- |\n| c | d |');
  for (const l of ls) assert.ok(!l.text.includes('|'), 'pipe in: ' + strip(l.text));
});
