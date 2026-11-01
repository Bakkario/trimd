import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.FORCE_COLOR = '1';

const { parseTokens } = await import('../src/core/parse.js');
const { renderTokens, visibleWidth, wrapLines } = await import('../src/core/renderer.js');
const { DEFAULT_THEME, DRACULA_THEME } = await import('../src/core/themes.js');
const { renderFile } = await import('../src/core/pipeline.js');

test('visibleWidth correctly accounts for double-width emojis, dingbats, and fullwidth characters', () => {
  assert.equal(visibleWidth('hello'), 5);
  assert.equal(visibleWidth('⚡'), 2);
  assert.equal(visibleWidth('🛠'), 2);
  assert.equal(visibleWidth('⏳'), 2);
  assert.equal(visibleWidth('⚔'), 2);
  assert.equal(visibleWidth('⚔️'), 2);
  assert.equal(visibleWidth('🤖'), 2);
  assert.equal(visibleWidth('🤝'), 2);
  assert.equal(visibleWidth('中文'), 4);
  assert.equal(visibleWidth('⚡ FAST-PACED'), 13);
  // UI icons remain 1 column
  assert.equal(visibleWidth('✔'), 1);
  assert.equal(visibleWidth('☐'), 1);
  assert.equal(visibleWidth('⚠'), 1);
  assert.equal(visibleWidth('•'), 1);
  assert.equal(visibleWidth('│'), 1);
  assert.equal(visibleWidth('┃'), 1);
});

test('code fence header line has visible width exactly equal to ctx.width without overflowing', () => {
  for (const w of [60, 70, 80, 90, 100, 112]) {
    const code = '```json\n{"test": 1}\n```';
    const rctx = { theme: DRACULA_THEME, width: w, sourceDir: '/tmp', resolve: () => null };
    const res = renderTokens(parseTokens(code), rctx);
    const headerVis = visibleWidth(res.lines[0].text);
    assert.equal(headerVis, w, `fence header at width ${w} should have visible width ${w}, got ${headerVis}`);
  }
});

test('code fence lines containing double-width characters pad to exact width without overflowing', () => {
  const code = '```json\n' +
    '{\n' +
    '  "type": "text", "text": "⚡ FAST-PACED"\n' +
    '}\n' +
    '```';
  const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null };
  const res = renderTokens(parseTokens(code), rctx);
  for (let i = 0; i < res.lines.length; i++) {
    const vis = visibleWidth(res.lines[i].text);
    assert.equal(vis, 80, `line ${i} should be padded to exactly 80 columns, got ${vis}`);
  }
});

test('wrapLines with emojis respects visible column width', () => {
  const line = { text: '## ⚔ The Great Agent Showdown ⚔', links: [] };
  const wrapped = wrapLines([line], 20);
  for (const l of wrapped) {
    assert.ok(visibleWidth(l.text) <= 20, `line exceeds 20 cols: ${visibleWidth(l.text)} for ${l.text}`);
  }
});
