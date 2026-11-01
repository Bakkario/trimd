import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens, stripAnsi } from '../src/core/renderer.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null };

test('Task 7.1: Inter-block vertical rhythm emits exactly 1 blank line between adjacent top-level blocks', () => {
  const md = [
    '# First Heading',
    '',
    'First paragraph text.',
    '',
    '## Second Heading',
    '',
    '- item 1',
    '- item 2',
    '',
    '---',
    '',
    'Final paragraph.',
  ].join('\n');

  const { lines } = renderTokens(parseTokens(md), rctx);
  const texts = lines.map((l) => stripAnsi(l.text));

  // No leading or trailing blank lines
  assert.notEqual(texts[0], '', 'no leading blank line');
  assert.notEqual(texts[texts.length - 1], '', 'no trailing blank line');

  // Find H1 and underline
  assert.equal(texts[0], 'First Heading');
  assert.ok(texts[1].startsWith('━'), 'H1 underline immediately follows H1');
  assert.equal(texts[2], '', 'exactly 1 blank line between H1 block and paragraph');
  assert.equal(texts[3], 'First paragraph text.');
  assert.equal(texts[4], '', 'exactly 1 blank line before H2');
  assert.ok(texts[5].startsWith('▌ Second Heading'), 'H2 with ▌ prefix');
  assert.equal(texts[6], '', 'exactly 1 blank line between H2 and list');
  assert.ok(texts[7].includes('item 1'));
  assert.ok(texts[8].includes('item 2'));
  assert.equal(texts[9], '', 'exactly 1 blank line between list and hr');
  assert.ok(texts[10].startsWith('─'), 'hr line');
  assert.equal(texts[11], '', 'exactly 1 blank line between hr and final paragraph');
  assert.equal(texts[12], 'Final paragraph.');
  assert.equal(texts.length, 13, 'exact total line count without duplicate blank lines');
});
