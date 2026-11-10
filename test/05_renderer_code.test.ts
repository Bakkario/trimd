import { test } from 'node:test';
import assert from 'node:assert/strict';

// cli-highlight colors via chalk, which is level 0 (plain) on non-TTY stdout
// (as in `node --test`) and honors NO_COLOR / TERM=dumb / FORCE_COLOR=0 — all
// of which this environment sets. Force level 1 unconditionally before the core
// modules (and thus chalk) load, hence the dynamic imports below.
process.env.FORCE_COLOR = '1';

const { parseTokens } = await import('../src/core/parse.js');
const { renderTokens } = await import('../src/core/renderer.js');
const { DEFAULT_THEME } = await import('../src/core/themes.js');
const { highlightAuto } = await import('../src/core/highlight.js');

const C = DEFAULT_THEME.colors;
const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null };
function render(src: string) { return renderTokens(parseTokens(src), rctx).lines; }
function strip(s: string): string { return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;[^\\]*\\/g, ''); }
const LABEL = '\x1b[' + C.codeLabel + 'm';
const RST = '\x1b[0m';

test('js fence: exact label prefix `── js `, highlighted output has SGR escapes, no backticks', () => {
  const ls = render('```js\nconst x = 1;\n// hello\n```');
  assert.equal(ls.length, 3, 'label + 2 code lines, got ' + ls.length);
  assert.ok(strip(ls[0].text).startsWith('── js '), 'label prefix wrong: ' + JSON.stringify(ls[0].text));
  assert.ok(strip(ls[0].text).includes('[y copy]'), 'label must contain [y copy]');
  for (const l of ls) assert.ok(!l.text.includes('`'), 'no fence backticks in: ' + strip(l.text));
  const joined = ls.slice(1).map((l) => l.text).join('\n');
  assert.ok(joined.includes('\x1b['), 'js output must contain SGR escapes');
  assert.ok(strip(joined).includes('1 │ const x = 1;'));
  assert.ok(strip(joined).includes('2 │ // hello'));
});

test('unknown language: label `── code `, auto-highlighted (ISSUE-005)', () => {
  const ls = render('```notalang\ndef f(x):\n    return x + 1\n```');
  assert.ok(strip(ls[0].text).startsWith('── code '), 'label prefix wrong: ' + JSON.stringify(ls[0].text));
  const joined = ls.slice(1).map((l) => l.text).join('\n');
  assert.ok(strip(joined).includes('1 │ def f(x):'));
  assert.ok(strip(joined).includes('2 │     return x + 1'));
  assert.ok(joined.includes('\x1b['), 'labelLang code → auto-detect SGR (ISSUE-005)');
});

test('unlabeled fence: label `── code `, python auto-highlighted (ISSUE-005)', () => {
  const ls = render('```\ndef f(x):\n    return x + 1\n```');
  assert.ok(strip(ls[0].text).startsWith('── code '), 'label prefix wrong: ' + JSON.stringify(ls[0].text));
  const joined = ls.slice(1).map((l) => l.text).join('\n');
  assert.ok(strip(joined).includes('1 │ def f(x):'));
  assert.ok(strip(joined).includes('2 │     return x + 1'));
  assert.ok(joined.includes('\x1b['), 'unlabeled → auto-detect SGR');
});

test('code-labeled fence: bash auto-highlighted (ISSUE-005)', () => {
  const ls = render('```code\necho hi\n# comment\n```');
  assert.ok(strip(ls[0].text).startsWith('── code '), 'label prefix wrong: ' + JSON.stringify(ls[0].text));
  const joined = ls.slice(1).map((l) => l.text).join('\n');
  assert.ok(strip(joined).includes('1 │ echo hi'));
  assert.ok(strip(joined).includes('2 │ # comment'));
  assert.ok(joined.includes('\x1b['), 'code label → auto-detect SGR');
});

test('unlabeled fence of undetectable prose: no SGR (ISSUE-005)', () => {
  const ls = render('```\nhello world\n```');
  assert.ok(strip(ls[0].text).startsWith('── code '));
  const joined = ls.slice(1).map((l) => l.text).join('\n');
  assert.equal(strip(joined).trim(), '1 │ hello world', 'prose must stay plain');
});

test('empty fence: no crash, single empty code line (ISSUE-005)', () => {
  const ls = render('```\n```');
  assert.equal(ls.length, 2, 'label + 1 empty code line, got ' + ls.length);
  assert.ok(strip(ls[1].text).startsWith(' 1 │'));
});

test('highlightAuto: detectable → SGR, prose → plain, empty → empty, cache-stable (ISSUE-005)', () => {
  assert.ok(highlightAuto('def f():\n    return 1').includes('\x1b['), 'detectable → SGR');
  assert.equal(highlightAuto('hello world'), 'hello world', 'prose → plain');
  assert.equal(highlightAuto(''), '', 'empty → empty');
  const a = highlightAuto('const q = 3;');
  assert.equal(highlightAuto('const q = 3;'), a, 'cache-stable across calls');
});

test('math fence: label contains `── math ──`, content plain', () => {
  const ls = render('```math\nE = mc^2\n```');
  assert.ok(ls[0].text.includes('── math ' + '─'), 'math label wrong: ' + JSON.stringify(ls[0].text));
  assert.ok(strip(ls[0].text).includes('── math ──'), 'label must read `── math ──`');
  assert.equal(ls.length, 2);
  assert.ok(strip(ls[1].text).includes('1 │ E = mc^2') || strip(ls[1].text).includes('1 │ E = mc²'), 'math content must include line number and plain text');
  // Content should not have syntax highlighting escapes other than codeBg/gutter
  assert.ok(!ls[1].text.includes('\x1b[38;'), 'math content must have no syntax highlight escapes');
});

test('mermaid fence: label contains `── mermaid ──`, content plain (ADR-027 Task 7.3)', () => {
  const ls = render('```mermaid\ngraph TD\n  A --> B\n```');
  assert.ok(ls[0].text.includes('── mermaid '), 'mermaid label prefix wrong: ' + JSON.stringify(ls[0].text));
  assert.ok(strip(ls[0].text).includes('── mermaid ──'), 'label must read `── mermaid ──`');
  assert.equal(ls.length, 3);
  assert.ok(strip(ls[1].text).includes('1 │ graph TD'));
  assert.ok(strip(ls[2].text).includes('2 │   A --> B'));
});
