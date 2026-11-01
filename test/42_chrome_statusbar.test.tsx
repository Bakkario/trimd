import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import App from '../src/ui/App.js';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

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
  Object.defineProperty(out, 'columns', { value: 100 });
  (out as unknown as { chunks: string[] }).chunks = chunks;
  return out;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

test('Task 6.3: Top chrome header has DOC / FILES accent pills and StatusBar has resilient hints & scroll %', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-42-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  writeFileSync(join(root, 'note.md'), '# Hello World\n\nThis is a sample document for testing the Phase 3 chrome.\n');
  const doc = renderFile(join(root, 'note.md'), { root, width: 44, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
    { stdout: out, stdin },
  );

  try {
    await wait(200);
    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    const raw = (out as unknown as { chunks: string[] }).chunks.join('');
    const frame = stripAnsi(raw);

    // Header checks
    assert.ok(frame.includes('DOC'), 'DOC pill text rendered in top header');
    assert.ok(frame.includes('< B  F >'), 'history state indicators rendered');
    assert.ok(frame.includes('min'), 'reading time stat rendered');

    // Status bar checks
    assert.ok(frame.includes('find'), 'search hint in status bar');
    assert.ok(frame.includes('%'), 'percentage rendered in status bar');
    assert.ok(frame.includes('default'), 'theme pill in status bar');

    // ISSUE-022: full-width headerBg surface checks
    assert.ok(raw.includes(`\x1b[${DEFAULT_THEME.colors.headerBg}m`), 'Row 0 and StatusBar are painted with theme.colors.headerBg');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
