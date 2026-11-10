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

// ISSUE-006 — `..` back row in the sidebar.
//
// Fixture vault: root/{aaa/x.md, a.md, sub/{s1.md, s2.md}} — root listing:
// [▸ aaa, ▸ sub, a.md] (dirs first, case-insensitive sort); sub listing:
// [s1.md, s2.md]. 24×80, sidebar open. capture-stdout surfaces only the
// final frame at unmount (ink 8 — test/35 pattern), so every flow ends in
// the state under test. Cursor row detection: the raw frame contains
// `\x1b[7m<row>` (ink closes the reverse with \x1b[27m, not \x1b[0m).
//
// Keys go to the fake tty (useInput); mouse SGR bytes go to process.stdin
// (the App's mouse parser listens there — test/21/30 pattern).

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

// The App's mouse effect attaches a 'data' listener to the test process's
// process.stdin and removes it on unmount; the ref'd socket handle would
// keep the process alive — release it in teardown (test/16/21/25 pattern).
function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref?.();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mouse left-release at sidebar column 10 (0-based) on content row `row`
// (0-based, below the header row): 1-based coordinates (11, row + 2).
const clickSidebarRow = (row: number) =>
  process.stdin.emit('data', `\x1b[<0;11;${row + 5}m`);

function makeVault(): { tmp: string; root: string; a: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-36-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  mkdirSync(join(root, 'aaa'));
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'a.md'), '# Alpha\n');
  writeFileSync(join(root, 'aaa', 'x.md'), '# X\n');
  writeFileSync(join(root, 'sub', 's1.md'), '# S1\n');
  writeFileSync(join(root, 'sub', 's2.md'), '# S2\n');
  return { tmp, root, a: join(root, 'a.md') };
}

function setup(a: string, root: string): { inst: ReturnType<typeof render>; out: Writable; stdin: Readable } {
  const doc = renderFile(a, { root, width: 49, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
    { stdout: out, stdin },
  );
  return { inst, out, stdin };
}

interface Handle { inst: ReturnType<typeof render>; out: Writable; stdin: Readable }

async function finish(h: Handle): Promise<{ raw: string; frame: string }> {
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
  return { raw, frame: stripAnsi(raw) };
}

// Final frame (24 rows): row 0 = header, rows 1..22 = content, row 23 =
// status bar. Sidebar region = terminal columns 0..29 (ADR-023).
function sideLines(frame: string): string[] {
  return frame.split('\n').map((l) => l.slice(0, 30));
}

// Enter `sub` via the keyboard: focus the sidebar, move the cursor to
// row 1 (`▸ sub`), Enter. After entering, the cursor is on the first
// entry (row 1, `  s1.md`), not the back row (pre-006 UX preserved).
async function enterSub(h: Handle): Promise<void> {
  h.stdin.push('\x1b[D'); // ← focus the sidebar (spatial — sidebar is left)
  await wait(250);
  h.stdin.push('\x1b[B'); // ↓ cursor 0 → 1 (`▸ sub`)
  await wait(250);
  h.stdin.push('\r'); // Enter → into sub (cursor 1 = first entry)
  await wait(250);
}

test('back row: hidden at the session root (ISSUE-006)', async () => {
  const { tmp, root, a } = makeVault();
  const h = setup(a, root);
  try {
    await wait(200);
    const { raw, frame } = await finish(h);
    const side = sideLines(frame);
    assert.ok(side[0].includes('vault'), 'sidebar header is the root basename');
    assert.ok(side.some((l) => l.includes('aaa')), 'first entry');
    assert.ok(side.some((l) => l.includes('sub')), 'second entry');
    assert.ok(side.some((l) => l.includes('a.md')), 'file entry');
    assert.ok(raw.includes('\x1b[7m') && raw.includes('aaa'), 'cursor starts at the top entry');
    assert.ok(!side.some((l) => l.includes('..')), 'no `..` row anywhere in the sidebar region');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('back row: rendered inside a subdirectory, cursor on the first entry (ISSUE-006)', async () => {
  const { tmp, root, a } = makeVault();
  const h = setup(a, root);
  try {
    await wait(200);
    await enterSub(h);
    const { raw, frame } = await finish(h);
    const side = sideLines(frame);
    assert.ok(side[0].includes('sub'), 'sidebar header is the subdirectory');
    assert.ok(side.some((l) => l.includes('..')), 'back row present');
    assert.ok(raw.includes('\x1b[7m') && raw.includes('s1.md'), 'cursor on the first entry (row 1), not the back row');
    const backLine = raw.split('\n').find((l) => l.includes('..'));
    assert.ok(backLine && !backLine.includes('\x1b[7m'), 'back row is not the cursor row');
    assert.ok(side.some((l) => l.includes('s1.md')), 'entry 0 shifted to content row 1');
    assert.ok(side.some((l) => l.includes('s2.md')), 'entry 1 shifted to content row 2');
    assert.ok(frame.includes('Alpha'), 'doc unchanged');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('keyboard: Enter on the back row goes up, cursor restored to the entered dir (ISSUE-006)', async () => {
  const { tmp, root, a } = makeVault();
  const h = setup(a, root);
  try {
    await wait(200);
    await enterSub(h);
    h.stdin.push('\x1b[A'); // ↑ cursor 1 (first entry) → 0 (`..`)
    await wait(250);
    h.stdin.push('\r'); // Enter on cursor 0 (`..`) → up to root
    await wait(250);
    const { raw, frame } = await finish(h);
    const side = sideLines(frame);
    assert.ok(side[0].includes('vault'), 'back at the root');
    assert.ok(raw.includes('\x1b[7m') && raw.includes('sub'), 'cursor restored to the sub row (idx 1)');
    const aaaLine = raw.split('\n').find((l) => l.includes('aaa'));
    assert.ok(aaaLine && !aaaLine.includes('\x1b[7m'), 'cursor is not at the top row');
    assert.ok(side.some((l) => l.includes('aaa')), 'content entry aaa at root');
    assert.ok(side.some((l) => l.includes('sub')), 'content entry sub at root');
    assert.ok(!side.some((l) => l.includes('..')), 'no back row at root');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cursor offset: Enter at cursor 1 opens entry 0 (ISSUE-006)', async () => {
  const { tmp, root, a } = makeVault();
  const h = setup(a, root);
  try {
    await wait(200);
    await enterSub(h); // cursor 1 = entry 0 (`  s1.md`)
    h.stdin.push('\r'); // Enter at cursor 1 → entry 0 (offset applied)
    await wait(250);
    const { frame } = await finish(h);
    assert.ok(frame.includes('S1'), 's1.md doc is displayed');
    assert.ok(frame.includes('sub/s1.md'), 'breadcrumb is sub/s1.md');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cursor clamps: ↑ at cursor 0 is a no-op, ↓ reaches the last entry (ISSUE-006)', async () => {
  const { tmp, root, a } = makeVault();
  const h = setup(a, root);
  try {
    await wait(200);
    await enterSub(h); // cursor 1 = first entry
    h.stdin.push('\x1b[A'); // ↑ cursor 1 (first entry) → 0 (back row)
    await wait(250);
    h.stdin.push('\x1b[A'); // ↑ at cursor 0 → no-op
    await wait(250);
    h.stdin.push('\x1b[B'); // ↓ → 1 (`  s1.md`)
    await wait(250);
    h.stdin.push('\x1b[B'); // ↓ → 2 (`  s2.md`, last row)
    await wait(250);
    h.stdin.push('\x1b[B'); // ↓ → clamped at 2
    await wait(250);
    const { raw } = await finish(h);
    assert.ok(raw.includes('\x1b[7m') && raw.includes('s2.md'), 'cursor clamped on the last entry');
    const backLine = raw.split('\n').find((l) => l.includes('..'));
    assert.ok(backLine && !backLine.includes('\x1b[7m'), 'cursor left the back row');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('mouse: click on the back row (content row 0) goes up (ISSUE-006)', async () => {
  const { tmp, root, a } = makeVault();
  const h = setup(a, root);
  try {
    await wait(200);
    await enterSub(h);
    clickSidebarRow(0); // 1-based (11, 2) → content row 0 = `..`
    await wait(300);
    const { raw, frame } = await finish(h);
    const side = sideLines(frame);
    assert.ok(side[0].includes('vault'), 'back at the root');
    assert.ok(raw.includes('\x1b[7m') && raw.includes('sub'), 'cursor restored to the sub row (idx 1)');
    assert.ok(!side.some((l) => l.includes('..')), 'no back row at root');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('mouse: click on an entry row applies the back-row offset (ISSUE-006)', async () => {
  const { tmp, root, a } = makeVault();
  const h = setup(a, root);
  try {
    await wait(200);
    clickSidebarRow(1); // at root: content row 1 = `sub` (no offset)
    await wait(300);
    const { raw, frame } = await finish(h);
    const side = sideLines(frame);
    assert.ok(side[0].includes('sub'), 'entered the clicked directory');
    assert.ok(raw.includes('\x1b[7m') && raw.includes('s1.md'), 'cursor on the first entry after entering a dir');
    const backLine = raw.split('\n').find((l) => l.includes('..'));
    assert.ok(backLine && !backLine.includes('\x1b[7m'), 'back row is not the cursor row');
    assert.ok(side.some((l) => l.includes('..')), 'back row rendered in sub directory');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
