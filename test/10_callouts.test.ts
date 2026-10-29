import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens, visibleWidth } from '../src/core/renderer.js';
import { parseCallout } from '../src/core/callouts.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import type { RenderedLine } from '../src/core/types.js';

const C = DEFAULT_THEME.colors;
const dir = mkdtempSync(join(tmpdir(), 'trimd-21-'));
after(() => rmSync(dir, { recursive: true, force: true }));
function rctx(): { theme: typeof DEFAULT_THEME; width: number; sourceDir: string; resolve: (t: string) => string | null } {
  return { theme: DEFAULT_THEME, width: 80, sourceDir: dir, resolve: (t) => (t.startsWith('/') ? t : join(dir, t)) };
}
function render(src: string): RenderedLine[] { return renderTokens(parseTokens(src), rctx()).lines; }
const RST = '\x1b[0m';
const bold = (s: string): string => '\x1b[1;38;5;255m' + s + RST;
const border = (sgr: string, s: string): string => '\x1b[' + sgr + 'm' + s + RST;

test('parseCallout: types, titles, nulls', () => {
  assert.deepEqual(parseCallout('[!WARNING] Fix this'), { type: 'WARNING', title: 'Fix this' });
  assert.deepEqual(parseCallout('[!note]'), { type: 'NOTE', title: null });
  assert.deepEqual(parseCallout('[!TIP]'), { type: 'TIP', title: null });
  assert.equal(parseCallout('plain text'), null);
  assert.deepEqual(parseCallout('[!NOTE] trailing words'), { type: 'NOTE', title: 'trailing words' });
  assert.equal(parseCallout('[!NOTE x]'), null);
});

test('> [!WARNING] Fix this: border in calloutWarning, title bold WARNING — Fix this', () => {
  const ls = render('> [!WARNING] Fix this');
  assert.equal(ls.length, 1);
  assert.equal(
    ls[0].text,
    border(C.calloutWarning, '│ ') + bold_border(C.calloutWarning, 'WARNING') + ' — ' + bold('Fix this'),
  );
});

function bold_border(sgr: string, s: string): string { return '\x1b[1;' + sgr + 'm' + s + RST; }

test('unknown type → calloutNote border', () => {
  const ls = render('> [!ROCKET] hello');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, border(C.calloutNote, '│ ') + bold_border(C.calloutNote, 'ROCKET') + ' — ' + bold('hello'));
});

test('callout body lines prefixed │   (border + 2-space indent)', () => {
  const ls = render('> [!NOTE] Title\n> body one\n>\n> body two');
  assert.equal(ls.length, 3);
  assert.equal(ls[0].text, border(C.calloutNote, '│ ') + bold_border(C.calloutNote, 'NOTE') + ' — ' + bold('Title'));
  assert.equal(ls[1].text, border(C.calloutNote, '│ ') + '  body one');
  assert.equal(ls[2].text, border(C.calloutNote, '│ ') + '  body two');
  for (const l of ls.slice(1)) {
    const v = l.text.replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(v.startsWith('│   '), 'missing │   prefix: ' + JSON.stringify(v));
  }
});

test('no title: marker line dropped, body still indented', () => {
  const ls = render('> [!NOTE]\n> only body');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, border(C.calloutNote, '│ ') + '  only body');
});

test('non-callout blockquote unchanged (INV-1.6)', () => {
  const ls = render('> plain quote');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].text, border(C.quote, '│ ') + 'plain quote');
});
