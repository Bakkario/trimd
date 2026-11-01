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
import { collectVisibleLinks, applyLinkHints, resolveHintInput } from '../src/core/link-hints.js';
import type { LinkSpan, RenderedLine } from '../src/core/types.js';

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

test('collectVisibleLinks deduplicates consecutive wrapped link fragments', () => {
  const span1: LinkSpan = { line: 0, startCol: 5, endCol: 15, href: '/doc1.md', kind: 'file', resolved: true };
  const span1Cont: LinkSpan = { line: 1, startCol: 0, endCol: 8, href: '/doc1.md', kind: 'file', resolved: true };
  const span2: LinkSpan = { line: 2, startCol: 10, endCol: 20, href: 'https://example.com', kind: 'http', resolved: true };

  const lines: RenderedLine[] = [
    { text: 'line 0 link fragment', links: [span1] },
    { text: 'fragment continued here', links: [span1Cont] },
    { text: 'line 2 another link', links: [span2] },
  ];

  const targets = collectVisibleLinks(lines, 0, 3);
  assert.equal(targets.length, 2);
  assert.equal(targets[0].index, 1);
  assert.equal(targets[0].span.href, '/doc1.md');
  assert.equal(targets[1].index, 2);
  assert.equal(targets[1].span.href, 'https://example.com');
});

test('resolveHintInput single-digit immediate activation and multi-digit pending', () => {
  // When total is 5 (<= 9), any '1'..'5' has k * 10 > 5 -> immediate activate
  assert.deepEqual(resolveHintInput('1', 5), { status: 'activate', index: 1 });
  assert.deepEqual(resolveHintInput('5', 5), { status: 'activate', index: 5 });
  assert.deepEqual(resolveHintInput('6', 5), { status: 'invalid' });

  // When total is 15:
  // '1' has 1 * 10 = 10 <= 15 -> pending
  assert.deepEqual(resolveHintInput('1', 15), { status: 'pending' });
  // '2' has 2 * 10 = 20 > 15 -> immediate activate
  assert.deepEqual(resolveHintInput('2', 15), { status: 'activate', index: 2 });
  // '12' -> activate
  assert.deepEqual(resolveHintInput('12', 15), { status: 'activate', index: 12 });
});

test('applyLinkHints injects [1] badges after visible links', () => {
  const span: LinkSpan = { line: 0, startCol: 4, endCol: 8, href: '/a.md', kind: 'file', resolved: true };
  const lines: RenderedLine[] = [{ text: 'See link here', links: [span] }];
  const targets = collectVisibleLinks(lines, 0, 1);
  const hinted = applyLinkHints(lines, targets, 0, DEFAULT_THEME, 80);

  const plain = stripAnsi(hinted[0].text);
  assert.ok(plain.includes('link[1]'));
});

test('App: l key activates link mode, shows badges, and follows link on keypress', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-47-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  writeFileSync(join(root, 'target.md'), '# Target Doc\nTarget body\n');
  writeFileSync(join(root, 'source.md'), '# Source Doc\nGo to [[target]] now.\n');

  const doc = renderFile(join(root, 'source.md'), { root, width: 60, theme: DEFAULT_THEME, showFrontmatter: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={false} showHidden={false} showFrontmatter={false} />,
    { stdout: out, stdin },
  );

  try {
    await wait(200);

    // Press 'l' to enter link mode
    stdin.push('l');
    await wait(200);

    // Press '1' to activate link 1
    stdin.push('1');
    await wait(300);

    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
    // Successfully navigated to Target Doc!
    assert.ok(frame.includes('Target Doc'), 'navigated to Target Doc via keyboard link hint');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
