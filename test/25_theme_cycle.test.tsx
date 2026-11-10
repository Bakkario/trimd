import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import App from '../src/ui/App.js';
import { renderFile } from '../src/core/pipeline.js';
import { allThemeIds, DEFAULT_THEME } from '../src/core/themes.js';
import { nextTheme } from '../src/core/nav.js';
import type { UiState } from '../src/core/nav.js';
import type { RenderedDoc } from '../src/core/types.js';

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

// The App's mouse effect attaches a 'data' listener to the test process's
// process.stdin and removes it on unmount; the ref'd socket handle would keep
// the process alive — release it in teardown (same pattern as tests 16/21).
function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

function makeDoc(source: string): RenderedDoc {
  return {
    lines: Array.from({ length: 10 }, (_, i) => ({ text: 'line ' + String(i + 1), links: [] })),
    meta: null,
    title: source,
    warnings: [],
    source,
  };
}

function initialState(themeId: string): UiState {
  return {
    stack: [{ abs: '/x/a.md', doc: makeDoc('/x/a.md'), scrollTop: 0 }],
    cur: 0,
    focus: 'doc',
    sidebarOpen: true,
    cwd: '/x',
    cursor: 0,
    themeId,
    help: false,
    reloadTick: 0,
  };
}

// --- nextTheme with allThemeIds() from a temp dir (02 §11, task 4.3) ---

test('nextTheme cycles allThemeIds() from a temp dir, wrapping back to default (02 §11, INV-3.8)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-25-'));
  const prevXDG = process.env.XDG_CONFIG_HOME;
  try {
    mkdirSync(join(tmp, 'trimd', 'themes'), { recursive: true });
    writeFileSync(join(tmp, 'trimd', 'themes', 'night.json'), JSON.stringify({
      id: 'night', name: 'Night', colors: { heading1: '38;5;45' },
    }));
    process.env.XDG_CONFIG_HOME = tmp;

    assert.deepEqual(allThemeIds(), ['default', 'light', 'dracula', 'tokyo-night', 'night'], 'builtins first, then user ids');

    let st = initialState('default');
    st = nextTheme(st, allThemeIds());
    assert.equal(st.themeId, 'light', 'default → light');
    st = nextTheme(st, allThemeIds());
    assert.equal(st.themeId, 'dracula', 'light → dracula');
    st = nextTheme(st, allThemeIds());
    assert.equal(st.themeId, 'tokyo-night', 'dracula → tokyo-night');
    st = nextTheme(st, allThemeIds());
    assert.equal(st.themeId, 'night', 'tokyo-night → night (user theme)');
    st = nextTheme(st, allThemeIds());
    assert.equal(st.themeId, 'default', 'night → default (wrap-around)');
  } finally {
    if (prevXDG === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = prevXDG;
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- T key wiring in App (INV-3.8, task 4.3) ---

test('App: T key cycles the theme; status bar shows the new themeId (INV-3.8)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-25b-'));
  let unmounted = false;
  try {
    writeFileSync(join(tmp, 'a.md'), '# Alpha\n');
    const doc = renderFile(join(tmp, 'a.md'), { root: tmp, width: 48, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });

    const out = captureStdout();
    const stdin = fakeTty();
    const inst = render(
      <App doc={doc} root={tmp} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
      { stdout: out, stdin },
    );

    try {
      await new Promise((r) => setTimeout(r, 200));
      // T → nextTheme(state, allThemeIds()); no user themes in this env, so
      // default → light. Ink's useInput reads stdin via 'readable' + read()
      // (not 'data'), so push the byte into the fake TTY stream.
      stdin.push('T');
      await new Promise((r) => setTimeout(r, 300));
      inst.unmount();
      unmounted = true;
      await waitExit(inst);
      const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
      assert.ok(frame.includes('light'), 'status bar shows the cycled theme id');
      assert.ok(frame.includes('L1 1/'), 'status bar line counter still present');
    } finally {
      if (!unmounted) inst.unmount();
      releaseStdinFixture();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
