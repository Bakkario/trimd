import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'ink';
import App from '../src/ui/App.js';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

const here = dirname(fileURLToPath(import.meta.url));
const note = join(here, 'fixtures', 'obsidian_note.md');
const present = join(here, 'fixtures', 'root', 'Present.md');

// strips SGR, OSC 8 and generic terminal control sequences
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\]8;[^\]]*\\/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

test('App renders the fixture doc with a status bar (capture-stdout pattern, 06 §1)', async () => {
  // The App's mouse effect (02 §10) attaches a 'data' listener to the test
  // process's process.stdin and removes it on unmount, but the net-socket
  // handle stays ref'd and would keep the test process alive. Release it
  // in teardown (same pattern as test/21).
  const releaseStdinFixture = () => {
    process.stdin.pause();
    process.stdin.unref();
  };
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-16-'));
  try {
    mkdirSync(join(tmp, 'root'));
    copyFileSync(note, join(tmp, 'obsidian_note.md'));
    copyFileSync(present, join(tmp, 'Present.md'));

    const doc = renderFile(join(tmp, 'obsidian_note.md'), {
      root: tmp,
      width: 80,
      theme: DEFAULT_THEME,
      showFrontmatter: true,
    });

    const chunks: string[] = [];
    const out = new Writable({
      write(chunk: Buffer | string, _enc, cb) {
        chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
        cb();
      },
    });
    Object.defineProperty(out, 'columns', { value: 80 });
    Object.defineProperty(out, 'rows', { value: 24 });

    // Ink's useInput requires a raw-mode-capable stdin; process.stdin under
    // node --test is not a TTY, so provide a fake one that satisfies
    // isTty(stdin) && typeof stdin.setRawMode === 'function'.
    const fakeStdin = new Readable({ read() {} });
    Object.defineProperty(fakeStdin, 'isTTY', { value: true });
    (fakeStdin as unknown as { setRawMode: (e: boolean) => void }).setRawMode = () => {};

    const inst = render(
      <App doc={doc} root={tmp} theme={DEFAULT_THEME} themeId="default" sidebarOpen={false} showHidden={false} showFrontmatter={true} />,
      { stdout: out, stdin: fakeStdin },
    );
    inst.unmount();
    await Promise.race([
      inst.waitUntilExit(),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
    ]);

    const frame = stripAnsi(chunks.join(''));
    // status bar path names the fixture note
    assert.ok(frame.includes('obsidian_note'), 'frame should identify the obsidian note fixture');
    // heading rendered as plain styled text, no raw markdown
    assert.ok(frame.includes('Main Title'), 'H1 heading text rendered');
    assert.ok(!frame.includes('## '), 'no raw ## heading syntax in frame');
    // status bar shows the theme id
    assert.ok(frame.includes('default'), 'status bar shows theme id');
    // status bar center: L1 1/N
    const total = doc.lines.length;
    assert.ok(frame.includes('L1 1/' + total), 'status bar line counter present');
  } finally {
    releaseStdinFixture();
    rmSync(tmp, { recursive: true, force: true });
  }
});
