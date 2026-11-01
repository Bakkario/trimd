import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens, wrapLines, visibleWidth, stripAnsi } from '../src/core/renderer.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

const C = DEFAULT_THEME.colors;

function renderAndWrap(md: string, width: number) {
  const doc = renderTokens(parseTokens(md), {
    theme: DEFAULT_THEME,
    width: 80,
    sourceDir: '/tmp',
    resolve: () => null,
  });
  return wrapLines(doc.lines, width);
}

test('ISSUE-016: callout body wrap carries border and 2-space indent on all physical lines', () => {
  const md = `> [!WARNING] Title\n> On Kubuntu 26.04, ssh.socket owns port 22. Run daemon-reload before restarting sshd.`;
  const lines = renderAndWrap(md, 40);

  // Line 0: title line
  assert.equal(lines.length, 4);
  assert.ok(stripAnsi(lines[0].text).includes('WARNING — Title'));

  // Body continuation lines 1, 2, 3 must all have border prefix and 2-space indent
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].text;
    const plain = stripAnsi(raw);
    assert.ok(visibleWidth(raw) <= 40, `line ${i} exceeds width: ${visibleWidth(raw)}`);
    assert.ok(raw.startsWith(`\x1b[${C.calloutWarning}m┃ \x1b[0m`), `line ${i} missing border SGR`);
    assert.ok(plain.startsWith('┃   '), `line ${i} missing "┃   " prefix: ${JSON.stringify(plain)}`);
  }
});

test('ISSUE-016: blockquote wrap carries "│ " prefix on all physical lines', () => {
  const md = `> This is a blockquote that contains quite a few words so that it definitely wraps across lines.`;
  const lines = renderAndWrap(md, 30);

  assert.ok(lines.length > 1);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].text;
    const plain = stripAnsi(raw);
    assert.ok(visibleWidth(raw) <= 30);
    assert.ok(raw.startsWith(`\x1b[${C.quote}m│ \x1b[0m`), `line ${i} missing quote border SGR`);
    assert.ok(plain.startsWith('│ '), `line ${i} missing "│ " prefix: ${JSON.stringify(plain)}`);
  }
});

test('ISSUE-016: nested blockquote wrap carries "│ │ " prefix on all physical lines', () => {
  const md = `> > nested blockquote that is very long and will wrap across multiple physical lines in this test`;
  const lines = renderAndWrap(md, 30);

  assert.ok(lines.length > 1);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].text;
    const plain = stripAnsi(raw);
    assert.ok(visibleWidth(raw) <= 30);
    assert.ok(plain.startsWith('│ │ '), `line ${i} missing "│ │ " prefix: ${JSON.stringify(plain)}`);
  }
});
