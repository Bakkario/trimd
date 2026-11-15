import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { render } from 'ink';
import App from '../src/ui/App.js';
import { clearRenderCache, renderFile } from '../src/core/pipeline.js';
import { buildIndex, clearGitCache } from '../src/core/resolve.js';
import { clearImageCache, renderHalfBlockImage } from '../src/core/media.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

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
  return out;
}

test('renderFile cache: second identical call returns same RenderedDoc in < 1ms and invalidates on clearRenderCache', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-76-'));
  try {
    const file = join(tmp, 'note.md');
    writeFileSync(file, '# Hello\n\n```ts\nconst x = 1;\n```\n');
    clearRenderCache();

    const ctx = { root: tmp, width: 80, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false, gfx: 'none' as const };
    const doc1 = renderFile(file, ctx);

    const t0 = performance.now();
    const doc2 = renderFile(file, ctx);
    const hitMs = performance.now() - t0;

    assert.equal(doc2, doc1, 'cache hit must return exact cached RenderedDoc');
    assert.ok(hitMs < 1, `expected cache hit < 1ms, got ${hitMs.toFixed(3)}ms`);

    clearRenderCache();
    const doc3 = renderFile(file, ctx);
    assert.notEqual(doc3, doc1, 'clearRenderCache must force re-render');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('App mount reuses cached RenderedDoc when width and gfx match', async () => {
  const releaseStdin = () => {
    process.stdin.pause();
    process.stdin.unref?.();
  };
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-76-app-'));
  try {
    const file = join(tmp, 'doc.md');
    writeFileSync(file, '# Title\n\nBody paragraph.\n');
    clearRenderCache();
    const doc = renderFile(file, {
      root: tmp,
      width: 44,
      theme: DEFAULT_THEME,
      showFrontmatter: true,
      showHidden: false,
      gfx: 'halfblock',
    });

    const out = captureStdout();
    const stdin = fakeTty();
    const inst = render(
      <App
        doc={doc}
        root={tmp}
        theme={DEFAULT_THEME}
        themeId="default"
        sidebarOpen={true}
        showHidden={false}
        showFrontmatter={true}
        gfx="halfblock"
      />,
      { stdout: out, stdin },
    );
    inst.unmount();
    await inst.waitUntilExit();
    assert.equal(
      renderFile(file, { root: tmp, width: 44, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false, gfx: 'halfblock' }),
      doc,
      'App mount with matching geometry/gfx must keep cached RenderedDoc',
    );
  } finally {
    releaseStdin();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('buildIndex skips node_modules and caches per root until clearGitCache', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-76-idx-'));
  try {
    mkdirSync(join(tmp, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(tmp, 'node_modules', 'pkg', 'ignored.md'), '# Ignored');
    writeFileSync(join(tmp, 'real.md'), '# Real');
    clearGitCache(tmp);

    const idx1 = buildIndex(tmp, false);
    assert.equal(idx1.exact.has('ignored.md'), false, 'node_modules must be skipped');
    assert.equal(idx1.exact.has('real.md'), true, 'real.md must be indexed');

    const idx2 = buildIndex(tmp, false);
    assert.equal(idx2, idx1, 'buildIndex must return cached RootIndex');

    clearGitCache(tmp);
    const idx3 = buildIndex(tmp, false);
    assert.notEqual(idx3, idx1, 'clearGitCache must invalidate buildIndex cache');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('renderHalfBlockImage caches ANSI rows across identical calls', () => {
  clearImageCache();
  const png = readFileSync(join(process.cwd(), 'test/fixtures/sample-diagram.png'));
  const rows1 = renderHalfBlockImage(png, 24, 8, '');
  const t0 = performance.now();
  const rows2 = renderHalfBlockImage(png, 24, 8, '');
  const hitMs = performance.now() - t0;

  assert.deepEqual(rows2, rows1);
  assert.ok(hitMs < 1, `expected halfBlockCache hit < 1ms, got ${hitMs.toFixed(3)}ms`);
});
