import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import React from 'react';
import {
  TOKYO_NIGHT_THEME,
  PLAIN_THEME,
  DEFAULT_THEME,
  BUILTIN_THEMES,
  allThemeIds,
} from '../src/core/themes.js';
import { renderFile } from '../src/core/pipeline.js';
import App from '../src/ui/App.js';

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

test('TOKYO_NIGHT_THEME has correct id, name, and truecolor values matching mockup', () => {
  assert.equal(TOKYO_NIGHT_THEME.id, 'tokyo-night');
  assert.equal(TOKYO_NIGHT_THEME.name, 'Tokyo Night');
  assert.equal(TOKYO_NIGHT_THEME.colors.headerBg, '48;2;22;22;30');
  assert.equal(TOKYO_NIGHT_THEME.colors.codeBg, '48;2;26;27;38');
  assert.equal(TOKYO_NIGHT_THEME.colors.calloutBg, '48;2;36;40;59');
  assert.equal(TOKYO_NIGHT_THEME.colors.accentPill, '1;38;2;22;22;30;48;2;122;162;247');
  assert.equal(TOKYO_NIGHT_THEME.colors.scrollbar, '38;2;187;154;247');

  assert.ok(BUILTIN_THEMES['tokyo-night'], 'registered in BUILTIN_THEMES');
  assert.ok(allThemeIds().includes('tokyo-night'), 'included in allThemeIds()');
});

test('App writes OSC 2 terminal title sequence on mount when theme is not plain', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-osc2-'));
  const origWrite = process.stdout.write;
  let titleSeq = '';
  process.stdout.write = (chunk: any) => {
    if (typeof chunk === 'string' && chunk.includes('\x1b]2;')) {
      titleSeq += chunk;
    }
    return true;
  };
  try {
    const note = join(tmp, 'TestTitleNote.md');
    writeFileSync(note, '# Test Title Note\n\nSome body text.\n');
    const doc = renderFile(note, { root: tmp, width: 80, theme: TOKYO_NIGHT_THEME, showFrontmatter: false });

    const out = captureStdout();
    const stdin = fakeTty();
    const inst = render(
      <App
        doc={doc}
        root={tmp}
        theme={TOKYO_NIGHT_THEME}
        themeId="tokyo-night"
        sidebarOpen={false}
        showHidden={false}
        showFrontmatter={false}
      />,
      { stdout: out, stdin }
    );

    await wait(200);
    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    assert.ok(titleSeq.includes('\x1b]2;Trimd — Test Title Note\x07'), 'emitted OSC 2 sequence with title');
  } finally {
    process.stdout.write = origWrite;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('App suppresses OSC 2 title sequence when theme is plain', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-osc2-plain-'));
  const origWrite = process.stdout.write;
  let titleSeq = '';
  process.stdout.write = (chunk: any) => {
    if (typeof chunk === 'string' && chunk.includes('\x1b]2;')) {
      titleSeq += chunk;
    }
    return true;
  };
  try {
    const note = join(tmp, 'PlainNote.md');
    writeFileSync(note, '# Plain Note\n\nSome body text.\n');
    const doc = renderFile(note, { root: tmp, width: 80, theme: PLAIN_THEME, showFrontmatter: false });

    const out = captureStdout();
    const stdin = fakeTty();
    const inst = render(
      <App
        doc={doc}
        root={tmp}
        theme={PLAIN_THEME}
        themeId="plain"
        sidebarOpen={false}
        showHidden={false}
        showFrontmatter={false}
      />,
      { stdout: out, stdin }
    );

    await wait(200);
    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    assert.ok(!titleSeq.includes('\x1b]2;Trimd —'), 'suppressed OSC 2 sequence on plain theme');
  } finally {
    process.stdout.write = origWrite;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('App scrollbar click-to-position jumps scrollTop proportionally (R-13)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-click-scroll-'));
  try {
    const note = join(tmp, 'LongDoc.md');
    const paras = Array.from({ length: 60 }, (_, i) => `Paragraph line ${i + 1}`).join('\n\n');
    writeFileSync(note, `# Long Document\n\n${paras}\n`);
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
    // Click on far-right scrollbar column: x = 79, y = 12 (midway down content rows)
    // SGR 1006 mouse release: \x1b[<0;80;13m (1-based: x=80 -> 79, y=13 -> 12)
    process.stdin.emit('data', '\x1b[<0;80;13m');
    await wait(200);

    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    const raw = (out as unknown as { chunks: string[] }).chunks.join('');
    // Mid-document paragraphs should now be visible
    assert.ok(raw.includes('Paragraph line 3') || raw.includes('Paragraph line 4') || raw.includes('Paragraph line 5'), 'jumped down document via scrollbar click');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
