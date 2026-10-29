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
const dir = mkdtempSync(join(tmpdir(), 'trimd-25-'));
writeFileSync(join(dir, 'Present.md'), 'x');
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
const OSC = (url: string): string => '\x1b]8;url=' + url + '\x1b\\';
const OSCE = '\x1b]8;;\x1b\\';
const EMB = (s: string): string => DIM + '\u25b8 note: ' + s + RST;

test('block embed: standalone line, resolved → clickable span kind embed', () => {
  const abs = join(dir, 'Present.md');
  const ls = render('![[Present]]');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, OSC('file://' + abs) + EMB('Present') + OSCE);
  assert.equal(ls[0].links.length, 1);
  const s = ls[0].links[0];
  assert.equal(s.kind, 'embed');
  assert.equal(s.href, abs);
  assert.equal(s.target, 'Present');
  assert.equal(s.startCol, 0);
  assert.equal(s.endCol, 15); // ▸ note: Present = 15 visible chars
});

test('inline embed mid-paragraph', () => {
  const abs = join(dir, 'Present.md');
  const ls = render('before ![[Present]] after');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, 'before ' + OSC('file://' + abs) + EMB('Present') + OSCE + ' after');
  assert.equal(ls[0].links[0].kind, 'embed');
  assert.equal(ls[0].links[0].startCol, 7);
});

test('unresolved embed: dim + ⚠, no span', () => {
  const ls = render('![[Missing]]');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, EMB('Missing') + DIM + ' \u26a0' + RST);
  assert.equal(ls[0].links.length, 0);
});

test('embed label override: ![[Present|Here]]', () => {
  const abs = join(dir, 'Present.md');
  const ls = render('![[Present|Here]]');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, OSC('file://' + abs) + EMB('Here') + OSCE);
  assert.equal(ls[0].links[0].target, 'Present');
});
