import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens } from '../src/core/renderer.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import type { RenderedLine } from '../src/core/types.js';

const C = DEFAULT_THEME.colors;
const dir = mkdtempSync(join(tmpdir(), 'trimd-22-'));
writeFileSync(join(dir, 'Note.md'), 'x');
after(() => rmSync(dir, { recursive: true, force: true }));
function rctx(): { theme: typeof DEFAULT_THEME; width: number; sourceDir: string; resolve: (t: string) => string | null } {
  const resolve = (t: string): string | null => {
    if (t.startsWith('/')) return existsSync(t) ? t : null;
    const p = join(dir, t);
    if (existsSync(p)) return p;
    if (existsSync(p + '.md')) return p + '.md';
    return null;
  };
  return { theme: DEFAULT_THEME, width: 80, sourceDir: dir, resolve };
}
function render(src: string): RenderedLine[] { return renderTokens(parseTokens(src), rctx()).lines; }
const RST = '\x1b[0m';
const DIM = '\x1b[2m';
const LNK = '\x1b[38;5;39m';
const OSC = (url: string): string => '\x1b]8;url=' + url + '\x1b\\';
const OSCE = '\x1b]8;;\x1b\\';

test('[[Note]] and [[Note|Label]]: labels exact; resolved → span + OSC 8', () => {
  const abs = join(dir, 'Note.md');
  const ls = render('[[Note]] and [[Note|Label]]');
  assert.equal(ls.length, 1);
  assert.equal(
    ls[0].text,
    OSC('file://' + abs) + LNK + 'Note' + RST + OSCE + ' and ' + OSC('file://' + abs) + LNK + 'Label' + RST + OSCE,
  );
  assert.equal(ls[0].links.length, 2);
  const s0 = ls[0].links[0];
  assert.deepEqual(
    { line: s0.line, startCol: s0.startCol, endCol: s0.endCol, href: s0.href, kind: s0.kind, target: s0.target, resolved: s0.resolved },
    { line: 0, startCol: 0, endCol: 4, href: abs, kind: 'wikilink', target: 'Note', resolved: true },
  );
  const s1 = ls[0].links[1];
  assert.equal(s1.startCol, 9);
  assert.equal(s1.endCol, 14);
  assert.equal(s1.kind, 'wikilink');
  assert.equal(s1.target, 'Note');
});

test('unresolved wikilink: dim + trailing ⚠, no span', () => {
  const ls = render('[[Missing]]');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, DIM + 'Missing' + RST + DIM + ' \u26a0' + RST);
  assert.equal(ls[0].links.length, 0);
});

test('[[Note#Section]] strips #heading for resolution and display; resolves to Note.md', () => {
  const abs = join(dir, 'Note.md');
  const ls = render('[[Note#Section]]');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, OSC('file://' + abs) + LNK + 'Note' + RST + OSCE);
  assert.equal(ls[0].links.length, 1);
  assert.equal(ls[0].links[0].href, abs);
  assert.equal(ls[0].links[0].kind, 'wikilink');
  assert.equal(ls[0].links[0].target, 'Note');
});
