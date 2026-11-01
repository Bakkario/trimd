import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens, stripAnsi } from '../src/core/renderer.js';
import { DEFAULT_THEME, DRACULA_THEME } from '../src/core/themes.js';

const rctx = {
  theme: DEFAULT_THEME,
  width: 80,
  sourceDir: '/tmp',
  resolve: () => null,
};

test('Task 7.2: Callout renders with ┃ border in type color and icon/marker prefix', () => {
  const md = `> [!WARNING] Socket Activation Gotcha\n> On Kubuntu 26.04, ssh.socket owns port 22.`;
  const { lines } = renderTokens(parseTokens(md), rctx);
  assert.equal(lines.length, 2);

  const plain0 = stripAnsi(lines[0].text);
  assert.ok(plain0.startsWith('┃ ! WARNING — Socket Activation Gotcha'), `Header line plain text: ${plain0}`);
  assert.ok(lines[0].text.includes(`\x1b[${DEFAULT_THEME.colors.calloutWarning}m┃ \x1b[0m`));

  const plain1 = stripAnsi(lines[1].text);
  assert.ok(plain1.startsWith('┃   On Kubuntu 26.04'), `Body line plain text: ${plain1}`);
  assert.ok(lines[1].text.includes(`\x1b[${DEFAULT_THEME.colors.calloutWarning}m┃ \x1b[0m`));
});

test('Task 7.2: Callout types map to their icons/markers', () => {
  const types = [
    { type: 'NOTE', icon: '¶ NOTE', color: DEFAULT_THEME.colors.calloutNote },
    { type: 'TIP', icon: '* TIP', color: DEFAULT_THEME.colors.calloutTip },
    { type: 'INFO', icon: 'i INFO', color: DEFAULT_THEME.colors.calloutInfo },
    { type: 'SUCCESS', icon: '✔ SUCCESS', color: DEFAULT_THEME.colors.calloutSuccess },
    { type: 'QUESTION', icon: '? QUESTION', color: DEFAULT_THEME.colors.calloutQuestion },
    { type: 'WARNING', icon: '! WARNING', color: DEFAULT_THEME.colors.calloutWarning },
    { type: 'DANGER', icon: '× DANGER', color: DEFAULT_THEME.colors.calloutDanger },
  ];

  for (const t of types) {
    const md = `> [!${t.type}] Title\n> Body`;
    const { lines } = renderTokens(parseTokens(md), rctx);
    const plain = stripAnsi(lines[0].text);
    assert.ok(plain.includes(`${t.icon} — Title`), `Type ${t.type} matches icon ${t.icon}`);
    assert.ok(lines[0].text.includes(`\x1b[${t.color}m┃ \x1b[0m`));
  }
});

test('Task 7.2: Box-drawn tables have rounded corners and 1-space cell padding', () => {
  const md = `| Endpoint | Bind Scope | Protocol | Latency |\n| --- | --- | --- | --- |\n| linbox:22 | tailscale0 | SSH + SGR-1006 | 1.8 ms |\n| localhost:8080 | loopback | HTTP preview | 0.2 ms |`;
  const { lines } = renderTokens(parseTokens(md), rctx);
  assert.equal(lines.length, 6);

  const plain = lines.map((l) => stripAnsi(l.text));
  // 0: top border ╭──┬──╮
  assert.ok(plain[0].startsWith('╭─') && plain[0].includes('┬─') && plain[0].endsWith('─╮'), `Top border: ${plain[0]}`);
  // 1: header row │ cell │
  assert.ok(plain[1].startsWith('│ Endpoint ') && plain[1].includes(' │ Bind Scope ') && plain[1].endsWith(' │'), `Header: ${plain[1]}`);
  // 2: header divider ├─┼─┤
  assert.ok(plain[2].startsWith('├─') && plain[2].includes('┼─') && plain[2].endsWith('─┤'), `Divider: ${plain[2]}`);
  // 3 & 4: data rows
  assert.ok(plain[3].startsWith('│ linbox:22 ') && plain[3].endsWith(' │'), `Row 1: ${plain[3]}`);
  assert.ok(plain[4].startsWith('│ localhost:8080 ') && plain[4].endsWith(' │'), `Row 2: ${plain[4]}`);
  // 5: bottom border ╰─┴─╯
  assert.ok(plain[5].startsWith('╰─') && plain[5].includes('┴─') && plain[5].endsWith('─╯'), `Bottom: ${plain[5]}`);
});
