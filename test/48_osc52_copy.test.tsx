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
import { encodeOsc52, isSshSession } from '../src/core/clipboard.js';

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
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

test('isSshSession returns true when SSH env vars present', () => {
  assert.equal(isSshSession({}), false);
  assert.equal(isSshSession({ SSH_CLIENT: '192.168.1.1' }), true);
  assert.equal(isSshSession({ SSH_CONNECTION: '192.168.1.1 5000 192.168.1.2 22' }), true);
  assert.equal(isSshSession({ SSH_TTY: '/dev/pts/1' }), true);
});

test('encodeOsc52 formats standard and tmux wrapped escapes', () => {
  const text = 'hello world';
  const b64 = Buffer.from(text).toString('base64');
  assert.equal(encodeOsc52(text, {}), `\x1b]52;c;${b64}\x07`);
  assert.equal(encodeOsc52(text, { TMUX: '/tmp/tmux-1000/default' }), `\x1bPtmux;\x1b\x1b]52;c;${b64}\x07\x1b\\`);
});

test('App: y key copies single code fence to OSC 52 clipboard and shows toast', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-48-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  writeFileSync(join(root, 'code.md'), '# Code Doc\n\n```python\nprint("hello")\n```\n');

  const doc = renderFile(join(root, 'code.md'), { root, width: 80, theme: DEFAULT_THEME, showFrontmatter: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={false} showHidden={false} showFrontmatter={false} />,
    { stdout: out, stdin },
  );

  try {
    await wait(200);

    // Press 'y' to copy visible code fence
    stdin.push('y');
    await wait(300);

    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    const raw = (out as unknown as { chunks: string[] }).chunks.join('');
    // stdout should receive OSC 52 sequence with base64 of print("hello")
    const expectedB64 = Buffer.from('print("hello")').toString('base64');
    assert.ok(raw.includes(expectedB64), 'OSC 52 escape contains code base64');
    assert.ok(raw.includes('copied python block'), 'status bar displays copied block toast');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
