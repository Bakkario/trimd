import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, applySearch } from '../src/core/search.js';
import { DEFAULT_THEME, PLAIN_THEME } from '../src/core/themes.js';
import type { RenderedDoc, RenderedLine } from '../src/core/types.js';

test('findMatches: case-insensitive, multiple matches, overlapping', () => {
  const lines: RenderedLine[] = [
    { text: 'Hello \x1b[1mWorld\x1b[0m hello', links: [] },
    { text: 'aaaa', links: [] },
    { text: 'no match here', links: [] },
  ];

  // match "hello"
  const m1 = findMatches(lines, 'hello');
  assert.equal(m1.length, 2);
  assert.deepEqual(m1[0], { line: 0, startCol: 0, endCol: 5 });
  assert.deepEqual(m1[1], { line: 0, startCol: 12, endCol: 17 });

  // overlapping "aa" in "aaaa" -> indices 0, 1, 2
  const m2 = findMatches(lines, 'aa');
  assert.equal(m2.length, 3);
  assert.deepEqual(m2[0], { line: 1, startCol: 0, endCol: 2 });
  assert.deepEqual(m2[1], { line: 1, startCol: 1, endCol: 3 });
  assert.deepEqual(m2[2], { line: 1, startCol: 2, endCol: 4 });

  // empty query -> []
  assert.deepEqual(findMatches(lines, ''), []);
  // no match -> []
  assert.deepEqual(findMatches(lines, 'xyz'), []);
});

test('applySearch: applies search slot SGR, reverse for current, preserves links', () => {
  const doc: RenderedDoc = {
    lines: [
      {
        text: 'hello \x1b]8;url=https://example.com\x1b\\\x1b[38;5;39mworld\x1b[0m\x1b]8;;\x1b\\ and hello again',
        links: [
          {
            line: 0,
            startCol: 6,
            endCol: 11,
            href: 'https://example.com',
            kind: 'http',
          },
        ],
      },
    ],
    meta: null,
    title: 'Test',
    warnings: [],
    source: '/tmp/test.md',
  };

  const matches = findMatches(doc.lines, 'hello');
  assert.equal(matches.length, 2);

  // Apply search with currentIdx = 0
  const searchedDoc = applySearch(doc, matches, 0, DEFAULT_THEME);
  const line0 = searchedDoc.lines[0];

  // Links array unchanged
  assert.deepEqual(line0.links, doc.lines[0].links);

  // First "hello" is current match -> carries search SGR (38;5;214) and ;7
  assert.ok(line0.text.includes('\x1b[38;5;214;7mhello\x1b[0m'));

  // Second "hello" is non-current match -> carries search SGR but not ;7
  assert.ok(line0.text.includes('\x1b[38;5;214mhello\x1b[0m'));

  // OSC 8 link is preserved
  assert.ok(line0.text.includes('\x1b]8;url=https://example.com\x1b\\'));

  // Plain theme -> empty search slot, current match has ;7 only
  const plainDoc = applySearch(doc, matches, 0, PLAIN_THEME);
  assert.ok(plainDoc.lines[0].text.includes('\x1b[7mhello\x1b[0m'));
});
