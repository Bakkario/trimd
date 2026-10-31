import { basename, dirname } from 'node:path';
import type { LinkSpan, RenderedDoc } from './types.js';
import { listEntries, type DirEntry } from './resolve.js';

// 02 §11 — pure UI state transitions + hit-testing. No react imports (Law 1).

export interface DocState { abs: string; doc: RenderedDoc; scrollTop: number; }
export type Focus = 'doc' | 'sidebar';
export interface UiState {
  stack: DocState[];      // current = stack[cur]
  cur: number;
  focus: Focus;
  sidebarOpen: boolean;
  cwd: string;            // sidebar directory (absolute)
  cursor: number;         // sidebar cursor index
  themeId: string;
  help: boolean;
  reloadTick: number;
}

export function navOpen(st: UiState, abs: string, render: (abs: string) => RenderedDoc): UiState {
  // abs === current abs → reloadTick+1 (re-render); else push {abs, doc, scrollTop:0}, cur=stack.length.
  const cur = st.stack[st.cur];
  if (abs === cur.abs) return { ...st, reloadTick: st.reloadTick + 1 };
  const stack = st.stack.slice(0, st.cur + 1);
  stack.push({ abs, doc: render(abs), scrollTop: 0 });
  return { ...st, stack, cur: stack.length - 1 };
}

export function navBack(st: UiState): UiState {
  return st.cur > 0 ? { ...st, cur: st.cur - 1 } : st;
}

export function navForward(st: UiState): UiState {
  return st.cur < st.stack.length - 1 ? { ...st, cur: st.cur + 1 } : st;
}

export function navUp(st: UiState, root: string, showHidden: boolean): UiState {
  // 02 §11 / ISSUE-006 — sidebar cwd up one level. Caller guarantees
  // cwd ≠ root (App gates on showBack = cwd !== root). Cursor (decided
  // 2026-10-31): the row of the directory we came from in the parent's
  // listing (+1 while the `..` back row is shown, i.e. parent ≠ root);
  // fallback: top row.
  if (st.cwd === root) return st;
  const cwd = dirname(st.cwd);
  const childName = basename(st.cwd);
  const idx = listEntries(cwd, showHidden).findIndex((e) => e.isDir && e.name === childName);
  const cursor = idx === -1 ? 0 : idx + (cwd !== root ? 1 : 0);
  return { ...st, cwd, cursor };
}

export function nextTheme(st: UiState, ids: string[]): UiState {
  if (ids.length === 0) return st;
  const i = ids.indexOf(st.themeId);
  const next = i === -1 ? ids[0] : ids[(i + 1) % ids.length];
  return { ...st, themeId: next };
}

export function hitTestDoc(doc: RenderedDoc, scrollTop: number, x: number, y: number): LinkSpan | null {
  // absLine = scrollTop + y; find span in doc.lines[absLine].links with x in [startCol, endCol).
  const absLine = scrollTop + y;
  const line = doc.lines[absLine];
  if (!line) return null;
  for (const span of line.links) {
    if (x >= span.startCol && x < span.endCol) return span;
  }
  return null;
}

export function hitTestSidebar(cwd: string, showHidden: boolean, y: number): DirEntry | null {
  // entry at row y (0-based, rows 0..n-1) via listEntries.
  return listEntries(cwd, showHidden)[y] ?? null;
}
