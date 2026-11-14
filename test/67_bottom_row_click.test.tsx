import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable, Readable } from 'node:stream';
import { render } from 'ink';
import App from '../src/ui/App.js';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import { stripAnsi } from '../src/core/renderer.js';

function fakeTty(): Readable {
  const stdin = new Readable({ read() {} });
  Object.defineProperty(stdin, 'isTTY', { value: true });
  (stdin as unknown as { setRawMode: (e: boolean) => void }).setRawMode = () => {};
  return stdin;
}

function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitExit = (inst: ReturnType<typeof render>) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise<void>((_res, rej) => setTimeout(() => rej(new Error('unmount timeout')), 2000)),
  ]);

function captureStdout(columns = 80, rows = 24) {
  const chunks: string[] = [];
  const s = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      cb();
    },
  });
  Object.assign(s, { columns, rows, chunks });
  return s;
}

test('ISSUE-025: clicking Linked Mentions link on bottom-most content row navigates to source note', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-67-'));
  try {
    // Enough lines so scrolling to bottom ('G') places Linked Mentions on the very last content row (e.y = 22)
    const bodyLines = Array.from({ length: 30 }, (_, i) => `Paragraph line ${i + 1}`).join('\n\n');
    writeFileSync(join(tmp, 'target.md'), `# Target Note\n\n${bodyLines}\n`);
    writeFileSync(join(tmp, 'referrer.md'), `# Referrer Note\n\nMentions [[target]].\n`);

    const doc = renderFile(join(tmp, 'target.md'), {
      root: tmp,
      width: 44,
      theme: DEFAULT_THEME,
      showFrontmatter: false,
      showHidden: false,
    });
    const out = captureStdout(80, 24);
    const stdin = fakeTty();
    const inst = render(
      <App
        doc={doc}
        root={tmp}
        theme={DEFAULT_THEME}
        themeId="default"
        sidebarOpen={true}
        showHidden={false}
        showFrontmatter={false}
      />,
      { stdout: out, stdin },
    );

    try {
      await wait(200);
      // Scroll to bottom ('G') so Linked Mentions link row lands on last content row (0-based e.y = 22, 1-based y = 23)
      stdin.push('G');
      await wait(200);

      // Status bar click (1-based y = 24 -> 0-based e.y = 23) must be ignored
      process.stdin.emit('data', '\x1b[<0;36;24m');
      await wait(150);

      // Click Linked Mentions link on bottom-most content row (1-based x = 36 -> 0-based e.x = 35 -> docX = 2, y = 23 -> e.y = 22)
      process.stdin.emit('data', '\x1b[<0;36;23m');
      await wait(250);
    } finally {
      inst.unmount();
      await waitExit(inst);
      releaseStdinFixture();
    }

    const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
    assert.ok(frame.includes('Referrer Note'), 'clicking bottom-row Linked Mentions link navigates to referrer.md');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ISSUE-025: clicking status bar row (e.y === 1 + crows) does not navigate', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-67-sb-'));
  try {
    const bodyLines = Array.from({ length: 30 }, (_, i) => `Paragraph line ${i + 1}`).join('\n\n');
    writeFileSync(join(tmp, 'target.md'), `# Target Note\n\n${bodyLines}\n`);
    writeFileSync(join(tmp, 'referrer.md'), `# Referrer Note\n\nMentions [[target]].\n`);

    const doc = renderFile(join(tmp, 'target.md'), {
      root: tmp,
      width: 44,
      theme: DEFAULT_THEME,
      showFrontmatter: false,
      showHidden: false,
    });
    const out = captureStdout(80, 24);
    const stdin = fakeTty();
    const inst = render(
      <App
        doc={doc}
        root={tmp}
        theme={DEFAULT_THEME}
        themeId="default"
        sidebarOpen={true}
        showHidden={false}
        showFrontmatter={false}
      />,
      { stdout: out, stdin },
    );

    try {
      await wait(200);
      stdin.push('G');
      await wait(200);
      // Click status bar row (1-based y = 24 -> 0-based e.y = 23)
      process.stdin.emit('data', '\x1b[<0;36;24m');
      await wait(200);
    } finally {
      inst.unmount();
      await waitExit(inst);
      releaseStdinFixture();
    }

    const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
    assert.ok(!frame.includes('Referrer Note'), 'status bar click must not trigger navigation');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
