import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import App from '../src/ui/App.js';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME, PLAIN_THEME, BUILTIN_THEMES } from '../src/core/themes.js';
import { detectGitBranch } from '../src/core/resolve.js';

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

function captureStdout(columns = 120, rows = 24): Writable {
  const chunks: string[] = [];
  const out = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      cb();
    },
  });
  Object.defineProperty(out, 'rows', { value: rows });
  Object.defineProperty(out, 'columns', { value: columns });
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

test('Lualine 3-tier footer & Bufferline top chrome render colored chips, diagnostics, and word count', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-68-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  writeFileSync(join(root, 'note.md'), '# Hello World\n\nAlpha beta gamma delta epsilon.\n');
  const tokyo = BUILTIN_THEMES['tokyo-night'] ?? DEFAULT_THEME;
  const doc = renderFile(join(root, 'note.md'), { root, width: 84, theme: tokyo, showFrontmatter: true, showHidden: false });
  const out = captureStdout(120, 24);
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={tokyo} themeId={tokyo.id} sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
    { stdout: out, stdin },
  );

  try {
    await wait(200);
    stdin.push('q');
    await waitExit(inst);
    const raw = (out as unknown as { chunks: string[] }).chunks.join('');
    const frame = stripAnsi(raw);

    // Top Bufferline bar: active tab marker ●, < B  F >, min, word count (no redundant DOC/FILES pills)
    const topLine = frame.split('\n').find((l) => l.includes('¶ note.md ●')) ?? '';
    assert.ok(topLine.includes('¶ note.md ●'), 'active Bufferline tab with ● marker');
    assert.ok(!topLine.includes('DOC') && !topLine.includes('FILES'), 'no redundant DOC/FILES pills in top bar');
    assert.ok(frame.includes('< B  F >'), 'history pill present');
    assert.ok(frame.includes('1 min'), 'reading time chip present');
    assert.ok(/\d+w/.test(frame), 'word count pill present');

    // Bottom Lualine footer: DOC pill, active file chip, two-tone hints, diagnostics, position · pct, theme badge
    assert.ok(frame.includes('DOC'), 'DOC mode pill present in footer');
    assert.ok(frame.includes('note.md'), 'active file chip present in footer');
    assert.ok(frame.includes('scroll') && frame.includes('outline') && frame.includes('peek'), 'expanded key hints at 120 cols');
    assert.ok(frame.includes('✔ 0 warn'), 'zero-warning diagnostics chip present');
    assert.ok(/L1 1\/\d+ · \d+%/.test(frame), 'Lualine position + scroll% chip present');
    assert.ok(frame.includes(tokyo.id), 'theme end-cap badge present');
    assert.ok(raw.includes('\x1b[' + tokyo.colors.calloutBg), 'calloutBg chip tinting applied');
    assert.ok(raw.includes('\x1b[' + tokyo.colors.codeBg), 'codeBg chip tinting applied');
  } finally {
    releaseStdinFixture();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('Noice floating Find (/) overlay renders centered modal without shrinking doc pane', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-68-search-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  writeFileSync(join(root, 'note.md'), '# Title\n\nalpha beta\ngamma alpha\n');
  const doc = renderFile(join(root, 'note.md'), { root, width: 84, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout(120, 24);
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
    { stdout: out, stdin },
  );

  try {
    await wait(200);
    stdin.push('/');
    await wait(50);
    stdin.push('alpha');
    await wait(150);
    stdin.push('q');
    await waitExit(inst);
    const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
    assert.ok(frame.includes('Find (/)'), 'Noice floating search modal title rendered');
    assert.ok(frame.includes('? alpha▌'), 'search query + cursor rendered inside modal');
    assert.ok(frame.includes('[1/2]'), 'match counter badge rendered inside modal');
    assert.ok(frame.includes('FIND'), 'FIND mode pill shown in footer while searching');
  } finally {
    releaseStdinFixture();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('PLAIN_THEME emits zero ANSI SGR escapes in top bar and Lualine footer', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-68-plain-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  writeFileSync(join(root, 'note.md'), '# Plain\n\nJust text.\n');
  const doc = renderFile(join(root, 'note.md'), { root, width: 64, theme: PLAIN_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout(100, 24);
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={PLAIN_THEME} themeId="plain" sidebarOpen={false} showHidden={false} showFrontmatter={true} />,
    { stdout: out, stdin },
  );

  try {
    await wait(200);
    stdin.push('q');
    await waitExit(inst);
    const raw = (out as unknown as { chunks: string[] }).chunks.join('');
    // eslint-disable-next-line no-control-regex
    assert.ok(!/\x1b\[[0-9;]*m/.test(raw), 'no SGR color escapes emitted under PLAIN_THEME');
    assert.ok(raw.includes('DOC') && raw.includes('✔ 0 warn') && raw.includes('plain'), 'plain text chrome still renders');
  } finally {
    releaseStdinFixture();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('detectGitBranch returns current branch name for git repo and null for non-git dir', () => {
  const branch = detectGitBranch(process.cwd());
  assert.ok(typeof branch === 'string' && branch.length > 0, 'detectGitBranch returns branch name in Trimd repo');
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-68-nogit-'));
  try {
    assert.strictEqual(detectGitBranch(tmp), null, 'detectGitBranch returns null outside git repo');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
