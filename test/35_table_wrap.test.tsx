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

// ISSUE-014 — table cells wrap within their column (no truncation) and the
// table fits the pane width (no whole-row wrap, columns stay aligned).
//
// Pane width 49 (80 cols, sidebar open). Verified geometry: Name=5,
// Description=35 (natural 102, shrunk), Status=7 → total exactly 49.
// Long cell (102) wraps to 4 lines; code cell (68) wraps to 2 lines.
// Inter-column gap chars sit at doc offsets 5 and 41 on every table line.
//
// capture-stdout only surfaces the final state at unmount (ink 8 defers
// frame writes — test/31). Assertions use the ANSI-stripped frame.

const LONG =
  'this is a very long cell whose content exceeds forty visible characters and must therefore wrap around';
const CODE =
  'some inline code that is also quite long enough to force a wrap here';

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

function setup(docFile: string, root: string): { inst: ReturnType<typeof render>; out: Writable; stdin: Readable } {
  const doc = renderFile(docFile, { root, width: 49, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
    { stdout: out, stdin },
  );
  return { inst, out, stdin };
}

async function finish(h: { inst: ReturnType<typeof render>; out: Writable }): Promise<string> {
  let unmounted = false;
  try {
    h.inst.unmount();
    unmounted = true;
    await waitExit(h.inst);
  } finally {
    if (!unmounted) h.inst.unmount();
    releaseStdinFixture();
  }
  return stripAnsi((h.out as unknown as { chunks: string[] }).chunks.join(''));
}

// Doc region of each frame line: sidebar (30) + separator (1) → doc starts
// at column 31 (ADR-023).
function docLines(frame: string): string[] {
  return frame.split('\n').map((l) => (l.length >= 31 ? l.slice(31) : ''));
}

test('table: cells wrap within the column, no truncation, aligned columns', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-35-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  const list = Array.from({ length: 30 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n') + '\n';
  writeFileSync(join(root, 'b.md'), list);
  const docFile = join(root, 'table.md');
  writeFileSync(
    docFile,
    `# Table test\n\n| Name | Description | Status |\n| --- | --- | --- |\n| short | a short cell | ok |\n| long | ${LONG} | pending |\n| code | \`${CODE}\` | done |\n`,
  );
  const h = setup(docFile, root);
  try {
    await wait(200);
    const frame = await finish(h);
    const lines = docLines(frame);
    const headerIdx = lines.findIndex((l) => l.startsWith('Name '));
    assert.ok(headerIdx >= 0, 'header line present');
    const endIdx = lines.findIndex((l, i) => i > headerIdx && l.includes('long enough to force a wrap here'));
    assert.ok(endIdx > headerIdx, 'last code-row line present');
    const table = lines.slice(headerIdx, endIdx + 1);
    // 9 physical lines: header, separator, short, long×4, code×2
    assert.equal(table.length, 9, 'expected table line count');

    // 1. No truncation anywhere; every word of the long cell survives.
    assert.ok(!frame.includes('…'), 'no truncation ellipsis in the frame');
    for (const w of LONG.split(' ')) assert.ok(frame.includes(w), `long-cell word survives: ${w}`);

    // 2. Alignment: gap chars at doc offsets 5 and 41 are spaces wherever a
    //    line reaches that far; separator is a single unbroken line.
    for (const l of table) {
      if (l.length > 5) assert.equal(l[5], ' ', `gap at offset 5 in: ${JSON.stringify(l)}`);
      if (l.length > 41) assert.equal(l[41], ' ', `gap at offset 41 in: ${JSON.stringify(l)}`);
    }
    assert.equal(table[1], '───── ' + '─'.repeat(35) + ' ' + '─'.repeat(7), 'separator line');

    // 3. Row padding: short cells do not orphan the wide cell's tail.
    assert.ok(table[3].startsWith('long  '), 'long row line 1 starts at the Name column');
    assert.ok(table[3].trimEnd().endsWith('pending'), 'pending sits on the long row line 1');
    assert.ok(table[4].startsWith('      '), 'long row line 2 has blank Name/Status continuation');
    assert.ok(table[6].includes('around'), 'long cell final word on the row final line');
    assert.ok(table[7].startsWith('code  '), 'code row line 1 starts at the Name column');
    assert.ok(table[7].trimEnd().endsWith('done'), 'done sits on the code row line 1');
    assert.ok(table[8].includes('long enough to force a wrap here'), 'code cell line 2 content');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('table: narrow table stays one line per row (no-wrap regression)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-35-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  const list = Array.from({ length: 30 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n') + '\n';
  writeFileSync(join(root, 'b.md'), list);
  const docFile = join(root, 't2.md');
  writeFileSync(docFile, '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n');
  const h = setup(docFile, root);
  try {
    await wait(200);
    const frame = await finish(h);
    const lines = docLines(frame);
    assert.ok(lines.includes('a b c'), 'narrow header on one line');
    assert.ok(lines.includes('─ ─ ─'), 'narrow separator on one line');
    assert.ok(lines.includes('1 2 3'), 'narrow body row on one line');
    // header + body only — no wrap-continuation lines
    const tableish = lines.filter((l) => l.startsWith('a b c') || l.startsWith('1 2 3'));
    assert.equal(tableish.length, 2, 'no extra table lines');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
