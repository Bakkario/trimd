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
