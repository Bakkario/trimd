import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.FORCE_COLOR = '1';

const { parseTokens } = await import('../src/core/parse.js');
const { renderTokens, wrapLines, stripAnsi, visibleWidth } = await import('../src/core/renderer.js');
const { DEFAULT_THEME } = await import('../src/core/themes.js');

test('bullet list item wraps with 2-space hang-indent', () => {
  const md = '- This is a very long bullet list item that wraps cleanly onto multiple lines';
  const rctx = { width: 30, theme: DEFAULT_THEME, sourceDir: '/tmp', resolve: () => null };
  const res = renderTokens(parseTokens(md), rctx);
  const wrapped = wrapLines(res.lines, 30);

  assert.ok(wrapped.length > 1);
  assert.ok(stripAnsi(wrapped[0].text).startsWith('• '));
  for (let i = 1; i < wrapped.length; i++) {
    const raw = stripAnsi(wrapped[i].text);
    assert.ok(raw.startsWith('  '), `line ${i} should start with 2 spaces hang-indent: ${JSON.stringify(raw)}`);
    assert.ok(visibleWidth(raw) <= 30);
  }
});

test('task checkbox list item wraps with 2-space hang-indent', () => {
  const md = '- [x] This is a checked task item that wraps cleanly onto multiple lines\n- [ ] This is an unchecked task item that wraps cleanly onto multiple lines';
  const rctx = { width: 30, theme: DEFAULT_THEME, sourceDir: '/tmp', resolve: () => null };
  const res = renderTokens(parseTokens(md), rctx);
  const wrapped = wrapLines(res.lines, 30);

  // First item
  assert.ok(stripAnsi(wrapped[0].text).startsWith('✔ '));
  assert.ok(stripAnsi(wrapped[1].text).startsWith('  '));
  // Second item
  const uncheckIdx = wrapped.findIndex(l => stripAnsi(l.text).startsWith('☐ '));
  assert.ok(uncheckIdx > 0);
  assert.ok(stripAnsi(wrapped[uncheckIdx + 1].text).startsWith('  '));
});

test('ordered list item wraps with hang-indent equal to number length + 2', () => {
  const md = '1. This is an ordered item that wraps cleanly onto multiple lines';
  const rctx = { width: 30, theme: DEFAULT_THEME, sourceDir: '/tmp', resolve: () => null };
  const res = renderTokens(parseTokens(md), rctx);
  const wrapped = wrapLines(res.lines, 30);

  assert.ok(wrapped.length > 1);
  assert.ok(stripAnsi(wrapped[0].text).startsWith('1. '));
  for (let i = 1; i < wrapped.length; i++) {
    const raw = stripAnsi(wrapped[i].text);
    assert.ok(raw.startsWith('   '), `line ${i} should start with 3 spaces: ${JSON.stringify(raw)}`);
    assert.ok(visibleWidth(raw) <= 30);
  }
});
