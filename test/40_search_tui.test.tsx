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
  Object.defineProperty(out, 'columns', { value: 80 });
  (out as unknown as { chunks: string[] }).chunks = chunks;
  return out;
}

const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setup(): { inst: ReturnType<typeof render>; out: Writable; stdin: Readable; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-40-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  const lines: string[] = [];
  for (let i = 1; i <= 40; i++) lines.push(`${i}. line ${i}`);
  lines[0] = '1. alpha line 1';
  lines[34] = '35. alpha line 35';
  writeFileSync(join(root, 'a.md'), lines.join('\n') + '\n');
  const doc = renderFile(join(root, 'a.md'), { root, width: 49, theme: DEFAULT_THEME, showFrontmatter: false, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={false} />,
    { stdout: out, stdin },
  );
  return { inst, out, stdin, tmp };
}

async function finish(h: { inst: ReturnType<typeof render>; out: Writable }): Promise<{ raw: string; plain: string }> {
  let unmounted = false;
  try {
    h.inst.unmount();
    unmounted = true;
    await waitExit(h.inst);
  } finally {
    if (!unmounted) h.inst.unmount();
    releaseStdinFixture();
  }
  const raw = (h.out as unknown as { chunks: string[] }).chunks.join('');
  return { raw, plain: stripAnsi(raw) };
}

test('TUI search: typing "/" opens input row and highlights matches', async () => {
  const h = setup();
  try {
    await wait(200);
    h.stdin.push('/');
    await wait(100);
    h.stdin.push('alpha');
    await wait(200);
    const { raw, plain } = await finish(h);
    assert.ok(plain.includes('? alpha▌'), 'search input row rendered');
    assert.ok(raw.includes('\x1b[38;5;214m\x1b[7malpha\x1b[27m\x1b[39m'), 'current match reverse highlight present');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('TUI search: pressing "n" steps to next match and scrolls', async () => {
  const h = setup();
  try {
    await wait(200);
    h.stdin.push('/');
    await wait(100);
    h.stdin.push('alpha');
    await wait(100);
    h.stdin.push('n');
    await wait(200);
    const { plain } = await finish(h);
    assert.ok(plain.includes('L20 20/40') || plain.includes('35. alpha line 35'), 'scrolled to center match around line 35');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('TUI search: Esc closes row, then Esc clears search', async () => {
  const h = setup();
  try {
    await wait(200);
    h.stdin.push('/');
    await wait(100);
    h.stdin.push('alpha');
    await wait(100);
    h.stdin.push('\x1b'); // Esc -> row closed, matches remain
    await wait(100);
    h.stdin.push('\x1b'); // Esc -> search cleared
    await wait(200);
    const { raw, plain } = await finish(h);
    assert.ok(!plain.includes('? alpha▌'), 'search input row is closed');
    assert.ok(!raw.includes('38;5;214'), 'search highlighting removed');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});
