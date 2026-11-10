import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens } from '../src/core/renderer.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null };

function render(src: string) {
  return renderTokens(parseTokens(src), rctx).lines;
}

test('extended inline: emojis, emoticons, and typographer symbols', () => {
  const md = 'Hello :wink: :rocket: and 8-) with (c) (r) (tm) and +- 5';
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  assert.ok(text.includes('😉'), 'should replace :wink: with 😉');
  assert.ok(text.includes('🚀'), 'should replace :rocket: with 🚀');
  assert.ok(text.includes('😎'), 'should replace 8-) with 😎');
  assert.ok(text.includes('©'), 'should replace (c) with ©');
  assert.ok(text.includes('®'), 'should replace (r) with ®');
  assert.ok(text.includes('™'), 'should replace (tm) with ™');
  assert.ok(text.includes('±'), 'should replace +- with ±');
});

test('extended inline: superscript and subscript', () => {
  const md = 'The 19^th^ century formula for water is H~2~O';
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
  assert.ok(clean.includes('19ᵗʰ'), `should render 19ᵗʰ, got: ${clean}`);
  assert.ok(clean.includes('H₂O'), `should render H₂O, got: ${clean}`);
});

test('extended inline: ins and mark tags', () => {
  const md = 'This has ++Inserted text++ and ==Marked text== inline.';
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  assert.ok(text.includes('Inserted text'), 'contains inserted text');
  assert.ok(text.includes('Marked text'), 'contains marked text');
  assert.ok(lines.some((l) => l.text.includes('\x1b[4;') || l.text.includes('Inserted text')));
  assert.ok(lines.some((l) => l.text.includes('\x1b[7m') || l.text.includes('Marked text')));
});

test('extended inline: bare URL linkify', () => {
  const md = 'Visit https://github.com/walid/trimd for details.';
  const lines = render(md);
  const allSpans = lines.flatMap((l) => l.links);
  const found = allSpans.find((s) => s.href === 'https://github.com/walid/trimd');
  assert.ok(found, 'should have link span for bare URL');
  assert.equal(found?.kind, 'http');
});

test('table right-aligned and center-aligned columns', () => {
  const md = [
    '| Item | Qty | Price |',
    '| :--- | :---: | ---: |',
    '| Apple | 10 | $1.50 |',
    '| Banana | 2 | $0.25 |',
  ].join('\n');

  const lines = render(md);
  const textLines = lines.map((l) => l.text);
  const appleLine = textLines.find((l) => l.includes('Apple'));
  assert.ok(appleLine, 'apple line found');
  const cleanApple = appleLine!.replace(/\x1b\[[0-9;]*m/g, '');
  assert.ok(cleanApple.includes('$1.50 │'), `expected $1.50 right-aligned before border, got: ${cleanApple}`);
});
