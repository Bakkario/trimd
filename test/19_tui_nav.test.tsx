import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { navOpen, navBack, navForward, navUp, nextTheme, hitTestDoc, hitTestSidebar } from '../src/core/nav.js';
import type { UiState } from '../src/core/nav.js';
import type { RenderedDoc } from '../src/core/types.js';

// 10-line doc with one link span on line 2 (0-based) covering columns [5, 12).
function makeDoc(source: string): RenderedDoc {
  return {
    lines: Array.from({ length: 10 }, (_, i) => ({
      text: 'line ' + String(i + 1),
      links: i === 2 ? [{ line: 2, startCol: 5, endCol: 12, href: '/x/target.md', kind: 'file' }] : [],
    })),
    meta: null,
    title: source,
    warnings: [],
    source,
  };
}

function initialState(): UiState {
  return {
    stack: [{ abs: '/x/a.md', doc: makeDoc('/x/a.md'), scrollTop: 0 }],
    cur: 0,
    focus: 'doc',
    sidebarOpen: true,
    cwd: '/x',
    cursor: 0,
    themeId: 'default',
    help: false,
    reloadTick: 0,
  };
}

test('navOpen: pushes a new doc, cur moves to it, scrollTop 0 (02 §11)', () => {
  const st = initialState();
  let renderedWith: string | null = null;
  const next = navOpen(st, '/x/b.md', (abs) => { renderedWith = abs; return makeDoc(abs); });
  assert.equal(renderedWith, '/x/b.md', 'render callback called with the abs path');
  assert.equal(next.stack.length, 2, 'stack grew by one');
  assert.equal(next.cur, 1, 'cur points at the new entry');
  assert.equal(next.stack[1].abs, '/x/b.md');
  assert.equal(next.stack[1].scrollTop, 0, 'new doc starts at the top');
  assert.equal(next.stack[1].doc.source, '/x/b.md');
  assert.equal(next.reloadTick, st.reloadTick, 'reloadTick untouched on push');
});

test('navOpen: same abs → reloadTick+1, stack unchanged (02 §11)', () => {
  const st = initialState();
  const next = navOpen(st, '/x/a.md', (abs) => makeDoc(abs));
  assert.equal(next.reloadTick, st.reloadTick + 1, 'reloadTick incremented');
  assert.equal(next.stack.length, st.stack.length, 'stack length unchanged');
  assert.equal(next.cur, st.cur, 'cur unchanged');
  assert.equal(next.stack[0].abs, st.stack[0].abs, 'stack content unchanged');
});

test('navBack/navForward: clamped at both ends, move within bounds (02 §11)', () => {
  const st = initialState();
  const two = navOpen(st, '/x/b.md', (abs) => makeDoc(abs));
  const three = navOpen(two, '/x/c.md', (abs) => makeDoc(abs));

  // back from middle
  const back1 = navBack(three);
  assert.equal(back1.cur, 1, 'back from cur=2 → cur=1');
  // back to bottom clamp
  const back0 = navBack(back1);
  assert.equal(back0.cur, 0, 'back from cur=1 → cur=0');
  const clampBack = navBack(back0);
  assert.equal(clampBack, back0, 'back at cur=0 returns the same state (no new object)');

  // forward from bottom
  const fwd1 = navForward(back0);
  assert.equal(fwd1.cur, 1, 'forward from cur=0 → cur=1');
  const fwd2 = navForward(fwd1);
  assert.equal(fwd2.cur, 2, 'forward from cur=1 → cur=2');
  const clampFwd = navForward(fwd2);
  assert.equal(clampFwd, fwd2, 'forward at stack end returns the same state (no new object)');
});

test('nextTheme: cycles with wrap-around, unknown id → first, empty ids → unchanged (02 §11)', () => {
  const ids = ['default', 'light', 'dracula', 'plain'];
  const st = initialState();

  assert.equal(nextTheme(st, ids).themeId, 'light', 'default → light');
  assert.equal(nextTheme({ ...st, themeId: 'light' }, ids).themeId, 'dracula', 'light → dracula');
  assert.equal(nextTheme({ ...st, themeId: 'dracula' }, ids).themeId, 'plain', 'dracula → plain');
  assert.equal(nextTheme({ ...st, themeId: 'plain' }, ids).themeId, 'default', 'plain wraps → default');
  assert.equal(nextTheme({ ...st, themeId: 'nope' }, ids).themeId, 'default', 'unknown id → first');
  assert.equal(nextTheme(st, []).themeId, 'default', 'empty ids → unchanged');
});

test('hitTestDoc: finds span at (x,y), excludes boundaries, null outside (02 §11)', () => {
  const doc = makeDoc('/x/a.md');

  assert.deepEqual(hitTestDoc(doc, 0, 7, 2), doc.lines[2].links[0], 'hit inside span (x=7 in [5,12))');
  assert.deepEqual(hitTestDoc(doc, 0, 5, 2), doc.lines[2].links[0], 'hit at startCol is included');
  assert.equal(hitTestDoc(doc, 0, 4, 2), null, 'x just below startCol → null');
  assert.equal(hitTestDoc(doc, 0, 12, 2), null, 'x at endCol is excluded');
  assert.equal(hitTestDoc(doc, 0, 7, 1), null, 'other line → null');
  assert.equal(hitTestDoc(doc, 0, 7, 3), null, 'line with no links → null');
  assert.equal(hitTestDoc(doc, 0, 7, 10), null, 'absLine out of range → null');
  assert.equal(hitTestDoc(doc, 0, 0, 10), null, 'absLine out of range at x=0 → null');
});

test('hitTestSidebar: entry at row y, null beyond list length (02 §11; guards 3.6 wiring)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-19-'));
  try {
    writeFileSync(join(tmp, 'a.md'), '');
    writeFileSync(join(tmp, 'b.md'), '');
    const e0 = hitTestSidebar(tmp, false, 0);
    assert.ok(e0 !== null, 'row 0 resolves to an entry');
    assert.equal(e0!.name, 'a.md');
    const e1 = hitTestSidebar(tmp, false, 1);
    assert.equal(e1!.name, 'b.md');
    assert.equal(hitTestSidebar(tmp, false, 2), null, 'row beyond the list → null');
    assert.equal(hitTestSidebar(tmp, false, -1), null, 'negative row → null');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('navUp: cwd up one level, cursor on the entered dir row (ISSUE-006; 02 §11)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-19b-'));
  const root = join(tmp, 'root');
  const sub = join(root, 'sub');
  const deep = join(sub, 'deep');
  const hidden = join(root, '.hidden');
  mkdirSync(root);
  mkdirSync(sub);
  mkdirSync(deep);
  mkdirSync(hidden);
  writeFileSync(join(root, 'a.md'), '');
  writeFileSync(join(root, 'b.md'), '');
  writeFileSync(join(sub, 's1.md'), '');
  writeFileSync(join(sub, 's2.md'), '');
  writeFileSync(join(deep, 'd.md'), '');
  writeFileSync(join(hidden, 'h.md'), '');
  try {
    // leaf dir → non-root parent: back row shown in the parent → cursor = idx + 1
    const st: UiState = { ...initialState(), cwd: deep, cursor: 3 };
    const up = navUp(st, root, false);
    assert.equal(up.cwd, sub, 'cwd moves to the parent');
    assert.equal(up.cursor, 1, 'cursor = deep row (idx 0 + 1 back-row offset)');
    assert.equal(up.stack, st.stack, 'stack untouched');
    assert.equal(up.cur, st.cur, 'cur untouched');
    assert.equal(up.focus, st.focus, 'focus untouched');
    assert.equal(up.reloadTick, st.reloadTick, 'reloadTick untouched');

    // depth-1 dir → root: no back row at root → cursor = idx
    const up2 = navUp({ ...st, cwd: sub }, root, false);
    assert.equal(up2.cwd, root, 'cwd moves to root');
    assert.equal(up2.cursor, 0, 'cursor = sub row in the root listing (no back row)');

    // at root: no-op, same state object
    const atRoot: UiState = { ...st, cwd: root, cursor: 0 };
    assert.equal(navUp(atRoot, root, false), atRoot, 'navUp at root returns the same state');

    // fallback: child dir absent from the parent listing (hidden, showHidden=false)
    const up3 = navUp({ ...st, cwd: hidden, cursor: 1 }, root, false);
    assert.equal(up3.cwd, root, 'cwd still moves to root');
    assert.equal(up3.cursor, 0, 'fallback: top row when the child dir is not listed');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
