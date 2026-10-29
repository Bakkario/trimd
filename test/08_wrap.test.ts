import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleWidth, wrapLines } from '../src/core/renderer.js';
import type { RenderedLine } from '../src/core/types.js';

const OSC = (url: string): string => '\x1b]8;url=' + url + '\x1b\\';
const OSCE = '\x1b]8;;\x1b\\';
const styled = (sgr: string, s: string): string => '\x1b[' + sgr + 'm' + s + '\x1b[0m';

test('visibleWidth strips SGR and OSC 8 exactly (incl. nested styles)', () => {
  assert.equal(visibleWidth('plain'), 5);
  assert.equal(visibleWidth(styled('1;38;5;39', 'hi') + ' there'), 8);
  assert.equal(visibleWidth(OSC('file:///x/y.md') + 'ab' + OSCE), 2);
  assert.equal(visibleWidth(OSC('https://e.com') + styled('38;5;39', 'ab') + OSCE + styled('1', 'cd')), 4);
});

test('short lines pass through unchanged (text and spans)', () => {
  const t = OSC('file:///t.md') + styled('38;5;39', 'note') + OSCE + ' tail';
  const lines: RenderedLine[] = [
    { text: t, links: [{ line: 0, startCol: 0, endCol: 4, href: '/t.md', kind: 'file', resolved: true }] },
  ];
  const w = wrapLines(lines, 80);
  assert.equal(w.length, 1);
  assert.equal(w[0].text, t);
  assert.deepEqual(w[0].links, lines[0].links);
});
test('mixed-style line wraps at exact visible width; styles survive wrap', () => {
  const t = 'aaaa ' + styled('1;38;5;51', 'bbbb') + ' cccc dddd';
  const w = wrapLines([{ text: t, links: [] }], 15);
  assert.equal(w.length, 2);
  for (const l of w) assert.ok(visibleWidth(l.text) <= 15, 'line over width: ' + l.text);
  assert.equal(w[0].text, 'aaaa ' + styled('1;38;5;51', 'bbbb') + ' cccc');
  assert.equal(w[1].text, 'dddd');
});

test('long word hard-splits; every fragment keeps its SGR', () => {
  const t = styled('3', 'abcdefghij') + ' x';
  const w = wrapLines([{ text: t, links: [] }], 5);
  assert.equal(w.length, 3);
  assert.equal(w[0].text, styled('3', 'abcde'));
  assert.equal(w[1].text, styled('3', 'fghij'));
  assert.equal(w[2].text, 'x');
});
test('link spanning the wrap: one span per physical line, remapped cols', () => {
  const url = 'file:///l.md';
  const t = 'xx ' + OSC(url) + styled('38;5;39', 'abcdefghijkl') + OSCE + ' yy';
  const lines: RenderedLine[] = [
    { text: t, links: [{ line: 0, startCol: 3, endCol: 15, href: '/l.md', kind: 'file', resolved: true }] },
  ];
  const w = wrapLines(lines, 10);
  assert.equal(w.length, 3);
  assert.equal(w[0].text, 'xx');
  assert.equal(w[0].links.length, 0);
  assert.equal(w[1].links.length, 1);
  assert.equal(w[1].links[0].line, 1);
  assert.equal(w[1].links[0].startCol, 0);
  assert.equal(w[1].links[0].endCol, 10);
  assert.equal(w[1].links[0].href, '/l.md');
  assert.equal(w[1].links[0].kind, 'file');
  assert.equal(w[2].text, OSC(url) + styled('38;5;39', 'kl') + OSCE + ' yy');
  assert.equal(w[2].links.length, 1);
  assert.equal(w[2].links[0].line, 2);
  assert.equal(w[2].links[0].startCol, 0);
  assert.equal(w[2].links[0].endCol, 2);
});

test('empty logical line yields one empty physical line', () => {
  const w = wrapLines([{ text: '', links: [] }], 80);
  assert.equal(w.length, 1);
  assert.equal(w[0].text, '');
  assert.equal(w[0].links.length, 0);
});
