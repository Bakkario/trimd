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

// strips SGR, OSC 8 and generic terminal control sequences
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

const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

// The test process's stdin is a fixture: the App's mouse effect attaches a
// 'data' listener to it (contract, 02 §10) and removes it on unmount, but the
// net-socket handle stays ref'd and would keep the test process alive. Release
// it in each test's teardown.
function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

test('App writes MOUSE_ENABLE on mount and MOUSE_DISABLE after unmount (02 §10, ADR-012)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-21-'));
  try {
    mkdirSync(join(tmp, 'root'));
    writeFileSync(join(tmp, 'root', 'a.md'), '# Alpha\n');
    const doc = renderFile(join(tmp, 'root', 'a.md'), { root: join(tmp, 'root'), width: 48, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });

    // Intercept process.stdout (App writes the mode bytes there per 02 §10),
    // forwarding to the real stream so test output is preserved.
    const raw: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    const spy = (chunk: string | Buffer, enc?: string | ((err?: Error | null) => void), cb?: (err?: Error | null) => void): boolean => {
      raw.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      return origWrite(chunk, enc as unknown as BufferEncoding, cb);
    };
    (process.stdout as unknown as { write: typeof spy }).write = spy;

    const out = captureStdout();
    let unmounted = false;
    const inst = render(
      <App doc={doc} root={join(tmp, 'root')} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
      { stdout: out, stdin: fakeTty() },
    );

    try {
      await new Promise((r) => setTimeout(r, 200)); // let the mount effect run
      const mounted = raw.join('');
      assert.ok(mounted.includes('\x1b[?1000h'), 'X10/1006 mouse reporting enabled on mount');
      assert.ok(mounted.includes('\x1b[?1006h'), 'SGR 1006 mode enabled on mount');

      inst.unmount();
      unmounted = true;
      await waitExit(inst);
      const all = raw.join('');
      assert.ok(all.includes('\x1b[?1006l'), 'SGR 1006 disabled after unmount');
      assert.ok(all.includes('\x1b[?1000l'), 'mouse reporting disabled after unmount');
      assert.ok(all.indexOf('\x1b[?1006l') > all.indexOf('\x1b[?1006h'), 'disable comes after enable');
    } finally {
      if (!unmounted) inst.unmount();
      (process.stdout as unknown as { write: typeof origWrite }).write = origWrite;
      releaseStdinFixture();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('left-button release on a doc link navigates (02 §10 wiring, INV-3.6)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-21b-'));
  let unmounted = false;
  try {
    writeFileSync(join(tmp, 'a.md'), '[alpha](b.md)\n');
    writeFileSync(join(tmp, 'b.md'), '# Bravo\n');
    const doc = renderFile(join(tmp, 'a.md'), { root: tmp, width: 48, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });

    const out = captureStdout();
    const inst = render(
      <App doc={doc} root={tmp} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
      { stdout: out, stdin: fakeTty() },
    );

    try {
      await new Promise((r) => setTimeout(r, 200));
      // Konsole SGR 1006 left release (code 0): 1-based (32,2) → 0-based
      // (31,1) → below the header row: doc line 0, col 0 with the 30-col
      // sidebar + separator column open → the "alpha" link span on line 0 →
      // navOpen(b.md). (ADR-012 am. ISSUE-001; ADR-023 am. ISSUE-010)
      process.stdin.emit('data', '\x1b[<0;32;2m');
      await new Promise((r) => setTimeout(r, 300));
      inst.unmount();
      unmounted = true;
      await waitExit(inst);
      const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
      assert.ok(frame.includes('Bravo'), 'frame shows the clicked doc (b.md)');
      assert.ok(frame.includes('b.md'), 'breadcrumb updated to b.md');
    } finally {
      if (!unmounted) inst.unmount();
      releaseStdinFixture();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('wheel reports (code 64/65) at a link are ignored — no navigation (ADR-012 am. ISSUE-001)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-21c-'));
  let unmounted = false;
  try {
    writeFileSync(join(tmp, 'a.md'), '[alpha](b.md)\n');
    writeFileSync(join(tmp, 'b.md'), '# Bravo\n');
    const doc = renderFile(join(tmp, 'a.md'), { root: tmp, width: 48, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });

    const out = captureStdout();
    const inst = render(
      <App doc={doc} root={tmp} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
      { stdout: out, stdin: fakeTty() },
    );

    try {
      await new Promise((r) => setTimeout(r, 200));
      // Wheel up/down press+release exactly over the link span (coords
      // shifted per ADR-023 — the shift is irrelevant here: 64/65 are wheel
      // codes, not left-button, so nothing may happen).
      process.stdin.emit('data', '\x1b[<64;32;2M\x1b[<64;32;2m\x1b[<65;32;2M\x1b[<65;32;2m');
      await new Promise((r) => setTimeout(r, 300));
      inst.unmount();
      unmounted = true;
      await waitExit(inst);
      const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
      assert.ok(!frame.includes('Bravo'), 'wheel events must not navigate');
    } finally {
      if (!unmounted) inst.unmount();
      releaseStdinFixture();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
