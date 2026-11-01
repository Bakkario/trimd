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
function single(src: string): string { const ls = render(src); assert.equal(ls.length, 1); return ls[0].text; }

test('INV-1.1: heading level 1 — no "#", bold+heading1 color + underline', () => {
  const ls = render('# Hello World');
  assert.equal(ls.length, 2);
  assert.equal(ls[0].text, '\x1b[1;' + C.heading1 + 'mHello World\x1b[0m');
  assert.ok(ls[1].text.includes('━'));
  assert.ok(!ls[0].text.includes('#'));
});

test('headings 2–6 use heading2..heading4, heading5 (H6 reuses heading5)', () => {
  assert.equal(single('## A'), '\x1b[' + C.heading2 + 'm▌ \x1b[0m\x1b[' + C.heading2 + 'mA\x1b[0m');
  assert.equal(single('### B'), '\x1b[' + C.heading3 + 'mB\x1b[0m');
  assert.equal(single('#### C'), '\x1b[' + C.heading4 + 'mC\x1b[0m');
  assert.equal(single('##### D'), '\x1b[' + C.heading5 + 'mD\x1b[0m');
  assert.equal(single('###### E'), '\x1b[' + C.heading5 + 'mE\x1b[0m');
});

test('bold/italic/strike/inline-code exact SGR', () => {
  assert.equal(single('**bold**'), '\x1b[1;' + C.bold + 'mbold\x1b[0m');
  assert.equal(single('*it*'), '\x1b[3mit\x1b[0m');
  assert.equal(single('~~st~~'), '\x1b[9mst\x1b[0m');
  assert.equal(single('`x = 1`'), '\x1b[' + C.inlineCode + 'mx = 1\x1b[0m');
});

test('nested emphasis flattens with reset at each boundary', () => {
  assert.equal(
    single('**a *b* c**'),
    '\x1b[1;' + C.bold + 'ma \x1b[0m\x1b[1;' + C.bold + ';3mb\x1b[0m\x1b[1;' + C.bold + 'm c\x1b[0m',
  );
});

test('inline tokens inside headings nest SGR', () => {
  assert.equal(
    single('## Hi **there**'),
    '\x1b[' + C.heading2 + 'm▌ \x1b[0m\x1b[' + C.heading2 + 'mHi \x1b[0m\x1b[' + C.heading2 + ';1;' + C.bold + 'mthere\x1b[0m',
  );
});

test('INV-1.9: hr = exactly 30 ─ in hr color', () => {
  const t = single('---');
  assert.equal(strip(t), '─'.repeat(30));
  assert.ok(t.includes('\x1b[' + C.hr + 'm'));
});

test('INV-1.8: image placeholder exact format', () => {
  assert.equal(single('![alt text](img/cat.png)'), '\x1b[' + C.dim + 'm▣ Image: alt text (img/cat.png)\x1b[0m\x1b[' + C.dim + 'm \u26a0\x1b[0m');
  assert.equal(single('![](img/cat.png)'), '\x1b[' + C.dim + 'm▣ Image: cat.png (img/cat.png)\x1b[0m\x1b[' + C.dim + 'm \u26a0\x1b[0m');
});

test('INV-1.2 subset: no raw markdown markers survive', () => {
  const lines = render('# Head\n\n**bold** and *it* and `code` and ~~st~~\n\n---');
  for (const l of lines) {
    const v = strip(l.text);
    assert.ok(!/\*\*/.test(v), 'leftover ** in: ' + v);
    assert.ok(!/`/.test(v), 'leftover backtick in: ' + v);
    assert.ok(!/^#{1,6}\s/.test(v), 'leftover # in: ' + v);
  }
});
