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
import type { Theme } from '../src/core/types.js';

// ISSUE-009 — frontmatter slots metaLabel/metaKey/metaValue. A custom theme
// gives the three slots distinct SGRs (spreads DEFAULT otherwise); the tags
// line stays on the built-in `tag` value (38;5;208). ink rewrites closing
// SGRs, so assert the opening SGR prefixes in the raw capture (test/35
// pattern).

const META_THEME: Theme = {
  id: 'meta-test',
  name: 'meta-test',
  colors: { ...DEFAULT_THEME.colors, metaLabel: '35', metaKey: '33', metaValue: '32' },
};

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

test('frontmatter renders with metaLabel/metaKey/metaValue slots (ISSUE-009)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-38-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  const docFile = join(root, 'note.md');
  writeFileSync(docFile, '---\ntitle: Alpha\ntags: [x, y]\n---\nBody line.\n');
  const doc = renderFile(docFile, { root, width: 49, theme: META_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={META_THEME} themeId="meta-test" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
    { stdout: out, stdin },
  );
  try {
    await wait(200);
    let unmounted = false;
    try {
      inst.unmount();
      unmounted = true;
      await waitExit(inst);
    } finally {
      if (!unmounted) inst.unmount();
      releaseStdinFixture();
    }
    const raw = (out as unknown as { chunks: string[] }).chunks.join('');
    assert.ok(raw.includes('\x1b[35m── metadata ──'), 'label line uses metaLabel');
    assert.ok(raw.includes('\x1b[33mtitle: '), 'key + separator uses metaKey');
    assert.ok(raw.includes('\x1b[32mAlpha'), 'value uses metaValue');
    assert.ok(raw.includes('\x1b[38;5;208m#x'), 'tags line stays on the tag slot');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
