import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.FORCE_COLOR = '1';

const { parseTokens } = await import('../src/core/parse.js');
const { renderTokens } = await import('../src/core/renderer.js');
const { DEFAULT_THEME } = await import('../src/core/themes.js');
const { fenceLabelLang } = await import('../src/core/highlight.js');
const { renderFile } = await import('../src/core/pipeline.js');

function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;[^\\]*\\/g, '');
}

test('fenceLabelLang returns mermaid for mermaid input', () => {
  assert.equal(fenceLabelLang('mermaid'), 'mermaid');
  assert.equal(fenceLabelLang('MERMAID'), 'mermaid');
});

test('code fence header contains [y copy] LinkSpan and dark surface', () => {
  const code = '```typescript\nconst a: number = 42;\n```';
  const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null };
  const res = renderTokens(parseTokens(code), rctx);

  assert.equal(res.lines.length, 2);
  const header = res.lines[0];
  assert.ok(strip(header.text).includes('[y copy]'));
  assert.equal(header.links.length, 1);
  assert.equal(header.links[0].kind, 'copy');
  assert.equal(header.links[0].href, 'copy:0');
  assert.equal(header.links[0].resolved, true);

  // Line 1 has line number gutter and code
  const line1 = res.lines[1];
  assert.ok(strip(line1.text).startsWith(' 1 │ const a: number = 42;'));
  assert.ok(line1.text.includes('\x1b[' + DEFAULT_THEME.colors.codeBg + 'm'));
});

test('doc.fences records fence metadata', () => {
  const code = '```python\nx = 1\n```';
  const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null };
  const res = renderTokens(parseTokens(code), rctx);

  assert.ok(res.fences);
  assert.equal(res.fences.length, 1);
  assert.equal(res.fences[0].lang, 'python');
  assert.equal(res.fences[0].raw, 'x = 1');
  assert.equal(res.fences[0].line, 0);
  assert.equal(res.fences[0].endLine, 1);
});

test('task markers render ✔ for checked and ☐ for unchecked', () => {
  const md = '- [x] done task\n- [ ] pending task';
  const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null };
  const res = renderTokens(parseTokens(md), rctx);

  assert.ok(strip(res.lines[0].text).includes('✔ done task'));
  assert.ok(strip(res.lines[1].text).includes('☐ pending task'));
});

test('image placeholder renders ▣ Image: <alt> (<src>) LinkSpan', () => {
  const md = '![Architecture Diagram](/tmp/arch.png)';
  const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => '/tmp/arch.png' };
  const res = renderTokens(parseTokens(md), rctx);

  assert.ok(strip(res.lines[0].text).includes('▣ Image: Architecture Diagram (/tmp/arch.png)'));
  // When resolved and exists, has link. When doesn't exist, has ⚠
  const unresolvedRes = renderTokens(parseTokens('![Pic](missing.png)'), { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null });
  assert.ok(strip(unresolvedRes.lines[0].text).includes('⚠'));
});
