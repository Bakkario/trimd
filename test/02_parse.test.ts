import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens } from '../src/core/parse.js';

test('heading token stream contains heading_open', () => {
  const tokens = parseTokens('# H\n');
  assert.ok(tokens.some((t) => t.type === 'heading_open'));
});

test('GFM table produces table_open', () => {
  const tokens = parseTokens('| A | B |\n|---|---|\n| 1 | 2 |\n');
  assert.ok(tokens.some((t) => t.type === 'table_open'));
});

test('fence token carries info js', () => {
  const tokens = parseTokens('```js\nconst x = 1;\n```\n');
  const fence = tokens.find((t) => t.type === 'fence');
  assert.ok(fence, 'expected a fence token');
  assert.equal(fence!.info, 'js');
});

test('task items carry meta.task / meta.checked', () => {
  const tokens = parseTokens('- [x] done\n- [ ] open\n');
  const items = tokens.filter((t) => t.type === 'list_item_open');
  assert.equal(items.length, 2);
  assert.equal(items[0].meta?.task, true);
  assert.equal(items[0].meta?.checked, true);
  assert.equal(items[1].meta?.task, true);
  assert.equal(items[1].meta?.checked, false);
});

test('~~strike~~ produces s_open', () => {
  const tokens = parseTokens('a ~~strike~~ b\n');
  const inline = tokens.find((t) => t.type === 'inline');
  assert.ok(inline);
  assert.ok(inline!.children!.some((c) => c.type === 's_open'));
  assert.ok(inline!.children!.some((c) => c.type === 's_close'));
});

// ISSUE-004 — file:// destinations parse as links (validateLink extension).
function linkHref(src: string): string | null {
  const inline = parseTokens(src).find((t) => t.type === 'inline');
  const lo = (inline?.children ?? []).find((c) => c.type === 'link_open');
  if (!lo || !lo.attrs) return null;
  const h = lo.attrs.find((a) => a[0] === 'href');
  return h ? String(h[1]) : null;
}

test('file:// links parse as link_open, href kept verbatim (ISSUE-004)', () => {
  assert.equal(linkHref('[a](file:///home/x/y.md)'), 'file:///home/x/y.md');
  assert.equal(linkHref('[a](file:///home/x/my%20file.md)'), 'file:///home/x/my%20file.md');
  assert.equal(linkHref('[a](<file:///home/x/y z.md>)'), 'file:///home/x/y%20z.md', 'angle-bracket spaces arrive %20-encoded');
  assert.equal(linkHref('[a](file:///home/x/y.md#anchor)'), 'file:///home/x/y.md#anchor');
});

test('file:// with nested-markup label (ISSUE-004)', () => {
  const inline = parseTokens('[a **b**](file:///home/x/y.md)').find((t) => t.type === 'inline');
  assert.deepEqual(
    (inline?.children ?? []).map((c) => c.type),
    ['link_open', 'text', 'strong_open', 'text', 'strong_close', 'text', 'link_close'],
  );
});

test('file://relative parses; http/relative/# unchanged (ISSUE-004)', () => {
  assert.equal(linkHref('[x](file://relative/path.md)'), 'file://relative/path.md');
  assert.equal(linkHref('[h](https://e.com)'), 'https://e.com');
  assert.equal(linkHref('[r](rel.md)'), 'rel.md');
  assert.equal(linkHref('[a](#anchor)'), '#anchor');
});

test('fence + inline code: file:// text untouched, no link tokens (ISSUE-004)', () => {
  const tokens = parseTokens('```\n[x](file:///f.md)\n```\nend `code [y](file:///f.md) code`');
  const fence = tokens.find((t) => t.type === 'fence');
  assert.equal(fence?.content, '[x](file:///f.md)\n');
  const inline = tokens.find((t) => t.type === 'inline');
  assert.ok(inline!.children!.some((c) => c.type === 'code_inline' && c.content.includes('[y](file:///f.md)')));
  assert.ok(!tokens.some((t) => t.type === 'link_open'), 'no link token from fence/code content');
});
