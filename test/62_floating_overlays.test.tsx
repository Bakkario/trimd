import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import React from 'react';
import { sliceAnsiByCols, buildModalBox, composeOverlay } from '../src/core/overlay.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import { renderFile } from '../src/core/pipeline.js';
import App from '../src/ui/App.js';

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\]8;[^\]]*\\/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function fakeTty(): Readable {
  const stdin = new Readable({ read() {} });
  Object.defineProperty(stdin, 'isTTY', { value: true });
  (stdin as unknown as { setRawMode: (e: boolean) => void }).setRawMode = () => {};
  return stdin;
}

function captureStdout(): Writable {
  const chunks: string[] = [];
  const out = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      cb();
    },
  });
  Object.defineProperty(out, 'rows', { value: 24 });
  Object.defineProperty(out, 'columns', { value: 80 });
  (out as unknown as { chunks: string[] }).chunks = chunks;
  return out;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout')), 2000)),
  ]);

function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

test('sliceAnsiByCols slices string accurately and resets ANSI', () => {
  const colored = '\x1b[31mHello \x1b[32mWorld\x1b[0m';
  const sliced = sliceAnsiByCols(colored, 7);
  const plain = stripAnsi(sliced);
  assert.equal(plain, 'Hello W');
  assert.ok(sliced.endsWith('\x1b[0m'));

  // Padding when shorter
  const short = 'Hi';
  const padded = sliceAnsiByCols(short, 5);
  assert.equal(stripAnsi(padded), 'Hi   ');
});

test('buildModalBox constructs rounded box with title, body, and footer', () => {
  const box = buildModalBox('Outline', ['First line', 'Second line'], 'Esc close', 30, DEFAULT_THEME);
  assert.equal(box.length, 4); // top, 2 lines, footer
  const plainRows = box.map(stripAnsi);
  assert.ok(plainRows[0].includes('╭─ ◈ Outline'));
  assert.ok(plainRows[0].includes('╮'));
  assert.ok(plainRows[1].includes('First line'));
  assert.ok(plainRows[2].includes('Second line'));
  assert.ok(plainRows[3].includes('╰─ Esc close'));
  assert.ok(plainRows[3].includes('╯'));
});

test('composeOverlay splices modal box over base rows at startRow and startCol', () => {
  const baseRows = [
    'Line 0: The quick brown fox jumps over the lazy dog',
    'Line 1: Second line of the document with extra text',
    'Line 2: Third line of the document with extra text',
    'Line 3: Fourth line of the document with extra text',
  ];
  const modalRows = [
    '╭─ Box ─╮',
    '│ Body  │',
    '╰───────╯',
  ];

  const composed = composeOverlay(baseRows, modalRows, 1, 20);
  assert.equal(composed.length, 4);
  assert.equal(composed[0], baseRows[0]); // row 0 untouched
  const row1 = stripAnsi(composed[1]);
  assert.ok(row1.startsWith('Line 1: Second line '));
  assert.ok(row1.endsWith('╭─ Box ─╮'));
});

test('App o key opens floating outline overlay while preserving doc text on left', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-overlay-outline-'));
  try {
    const note = join(tmp, 'Doc.md');
    writeFileSync(note, '# Section One\n\nDocLeftTextOnFirstParagraph is here.\n\n## Section Two\n\nMore text.\n');
    const doc = renderFile(note, { root: tmp, width: 80, theme: DEFAULT_THEME, showFrontmatter: false });

    const out = captureStdout();
    const stdin = fakeTty();
    const inst = render(
      <App
        doc={doc}
        root={tmp}
        theme={DEFAULT_THEME}
        themeId="default"
        sidebarOpen={false}
        showHidden={false}
        showFrontmatter={false}
      />,
      { stdout: out, stdin }
    );

    await wait(200);
    stdin.push('o');
    await wait(200);

    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    const output = (out as unknown as { chunks: string[] }).chunks.join('');
    const plain = stripAnsi(output);
    assert.ok(plain.includes('Outline (o)'), 'includes floating outline title');
    assert.ok(plain.includes('Section One'), 'lists section one heading');
    assert.ok(plain.includes('DocLeftTextOnFirstParagraph'), 'preserves left doc text on same frame');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('App p key opens Wikilink Peek and Enter navigates to target note', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-overlay-peek-'));
  try {
    const noteA = join(tmp, 'Source.md');
    const noteB = join(tmp, 'Target.md');
    writeFileSync(noteA, '# Source Note\n\nHere is a link to [[Target]].\n');
    writeFileSync(noteB, '# Target Note Title\n\nDetailed contents inside target note.\n');

    const doc = renderFile(noteA, { root: tmp, width: 80, theme: DEFAULT_THEME, showFrontmatter: false });

    // 1. Verify Peek modal opens on 'p'
    {
      const out = captureStdout();
      const stdin = fakeTty();
      const inst = render(
        <App
          doc={doc}
          root={tmp}
          theme={DEFAULT_THEME}
          themeId="default"
          sidebarOpen={false}
          showHidden={false}
          showFrontmatter={false}
        />,
        { stdout: out, stdin }
      );

      await wait(200);
      stdin.push('p');
      await wait(200);

      inst.unmount();
      await waitExit(inst);
      releaseStdinFixture();

      const output = (out as unknown as { chunks: string[] }).chunks.join('');
      const plain = stripAnsi(output);
      assert.ok(plain.includes('Peek: Target'), 'shows peek modal with target basename');
      assert.ok(plain.includes('Target Note Title') || plain.includes('Detailed contents'), 'shows preview lines of target note');
    }

    // 2. Verify Enter navigates to target note
    {
      const out = captureStdout();
      const stdin = fakeTty();
      const inst = render(
        <App
          doc={doc}
          root={tmp}
          theme={DEFAULT_THEME}
          themeId="default"
          sidebarOpen={false}
          showHidden={false}
          showFrontmatter={false}
        />,
        { stdout: out, stdin }
      );

      await wait(200);
      stdin.push('p');
      await wait(200);
      stdin.push('\r');
      await wait(200);

      inst.unmount();
      await waitExit(inst);
      releaseStdinFixture();

      const output = (out as unknown as { chunks: string[] }).chunks.join('');
      const plain = stripAnsi(output);
      assert.ok(plain.includes('Target.md'), 'navigated to Target.md');
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('App p key displays toast when no link is in view', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-overlay-nolink-'));
  try {
    const note = join(tmp, 'Plain.md');
    writeFileSync(note, '# Plain Note\n\nNo links here at all.\n');
    const doc = renderFile(note, { root: tmp, width: 80, theme: DEFAULT_THEME, showFrontmatter: false });

    const out = captureStdout();
    const stdin = fakeTty();
    const inst = render(
      <App
        doc={doc}
        root={tmp}
        theme={DEFAULT_THEME}
        themeId="default"
        sidebarOpen={false}
        showHidden={false}
        showFrontmatter={false}
      />,
      { stdout: out, stdin }
    );

    await wait(200);
    stdin.push('p');
    await wait(200);

    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    const output = (out as unknown as { chunks: string[] }).chunks.join('');
    const plain = stripAnsi(output);
    assert.ok(plain.includes('no link in view to peek'), 'displays toast warning');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('buildModalBox preserves headerBg across inner ANSI resets and handles empty footerHint (ISSUE-032)', () => {
  const theme = {
    ...DEFAULT_THEME,
    colors: {
      ...DEFAULT_THEME.colors,
      headerBg: '48;5;236',
    },
  };
  const body = `\x1b[32mCopied 11 chars\x1b[0m`;
  const rows = buildModalBox('✔ Trimd', [body], '', 30, theme);
  assert.equal(rows.length, 3, 'top + body + bottom');
  // Body row (index 1) must re-assert 48;5;236 after \x1b[0m so trailing pad spaces keep modal background
  assert.ok(rows[1].includes('\x1b[0m\x1b[48;5;236m'), 're-asserts headerBg after inner reset');
  // All rows must have identical visible width (30)
  for (const row of rows) {
    assert.equal(stripAnsi(row).length, 30, `row width 30: ${stripAnsi(row)}`);
  }
  // No OSC 52 label in footer
  assert.ok(!stripAnsi(rows[rows.length - 1]).includes('OSC 52'));
});
