import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFrontmatter, renderMeta } from '../src/core/frontmatter.js';
import { DEFAULT_THEME, PLAIN_THEME } from '../src/core/themes.js';
import type { Theme } from '../src/core/types.js';

const dim = (s: string): string => '\x1b[2m' + s + '\x1b[0m';
const tag = (s: string): string => '\x1b[38;5;208m' + s + '\x1b[0m';

test('valid frontmatter extracted; body intact, no leading ---', () => {
  const text = '---\ntitle: Hello\ncount: 3\ntags: [a, b]\n---\nBody line.\n';
  const { meta, body } = extractFrontmatter(text);
  assert.ok(meta !== null);
  assert.equal(body, 'Body line.\n');
  assert.equal(meta!.raw, 'title: Hello\ncount: 3\ntags: [a, b]\n');
  assert.equal(meta!.valid, true);
  assert.deepEqual(meta!.data, { title: 'Hello', count: 3, tags: ['a', 'b'] });
});

test('absent frontmatter → meta null, body unchanged', () => {
  assert.deepEqual(extractFrontmatter('# Hello\nno frontmatter'), { meta: null, body: '# Hello\nno frontmatter' });
  const unterminated = '---\njust text\nstill no close';
  assert.deepEqual(extractFrontmatter(unterminated), { meta: null, body: unterminated });
});

test('invalid YAML → valid:false, data:null, raw kept', () => {
  const text = '---\na: b: c\n---\nbody\n';
  const { meta, body } = extractFrontmatter(text);
  assert.ok(meta !== null);
  assert.equal(body, 'body\n');
  assert.equal(meta!.valid, false);
  assert.equal(meta!.data, null);
  assert.equal(meta!.raw, 'a: b: c\n');
  const scalar = '---\njust a string\n---\nbody\n';
  const m2 = extractFrontmatter(scalar).meta!;
  assert.equal(m2.valid, false);
  assert.equal(m2.data, null);
});

test('renderMeta: header dim, key:value dim, array joined, tags chips line', () => {
  const meta = { raw: 'x', valid: true, data: { title: 'Hello', count: 3, list: ['x', 'y'], tags: ['a', 'b'] } };
  const lines = renderMeta(meta as never, DEFAULT_THEME);
  assert.equal(lines.length, 6);
  assert.equal(lines[0].text, dim('── metadata ──'));
  assert.equal(lines[1].text, dim('title: ') + dim('Hello'));
  assert.equal(lines[2].text, dim('count: ') + dim('3'));
  assert.equal(lines[3].text, dim('list: ') + dim('x, y'));
  assert.equal(lines[4].text, dim('tags: ') + dim('a, b'));
  assert.equal(lines[5].text, tag('#a') + ' ' + tag('#b'));
  for (const l of lines) assert.equal(l.links.length, 0);
});

test('renderMeta: invalid → single dim raw line; plain theme has no SGR', () => {
  const bad = { raw: 'a: b: c\n', valid: false, data: null };
  const one = renderMeta(bad as never, DEFAULT_THEME);
  assert.equal(one.length, 1);
  assert.equal(one[0].text, dim('a: b: c\n'));
  const meta = { raw: 'x', valid: true, data: { title: 'Hello' } };
  const plain = renderMeta(meta as never, PLAIN_THEME);
  assert.equal(plain[0].text, '── metadata ──');
  assert.equal(plain[1].text, 'title: Hello');
});

// ISSUE-009 — metaLabel/metaKey/metaValue slots: distinct SGRs per slot.
const META_THEME: Theme = {
  id: 'meta-test',
  name: 'meta-test',
  colors: { ...DEFAULT_THEME.colors, metaLabel: '35', metaKey: '33', metaValue: '32' },
};

test('renderMeta: metaLabel/metaKey/metaValue slots paint separately (ISSUE-009)', () => {
  const meta = { raw: 'x', valid: true, data: { title: 'Hello', tags: ['a'] } };
  const lines = renderMeta(meta as never, META_THEME);
  assert.equal(lines[0].text, '\x1b[35m── metadata ──\x1b[0m', 'label line → metaLabel');
  assert.equal(lines[1].text, '\x1b[33mtitle: \x1b[0m\x1b[32mHello\x1b[0m', 'key + separator → metaKey, value → metaValue');
  assert.equal(lines[2].text, '\x1b[33mtags: \x1b[0m\x1b[32ma\x1b[0m', 'tags key/value line like any other key');
  assert.equal(lines[3].text, tag('#a'), 'tags chip line stays on the tag slot');
  const bad = { raw: 'a: b: c\n', valid: false, data: null };
  assert.equal(renderMeta(bad as never, META_THEME)[0].text, '\x1b[32ma: b: c\n\x1b[0m', 'invalid raw line → metaValue');
});
