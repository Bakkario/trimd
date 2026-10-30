import { Box, Text, useInput, useStdout } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { basename, relative } from 'node:path';
import type { MouseEvt, RenderedDoc, Theme } from '../core/types.js';
import { paint, allThemeIds, BUILTIN_THEMES, loadUserTheme } from '../core/themes.js';
import { renderFile } from '../core/pipeline.js';
import { listEntries } from '../core/resolve.js';
import { navBack, navForward, navOpen, nextTheme, hitTestDoc, hitTestSidebar } from '../core/nav.js';
import { MOUSE_ENABLE, MOUSE_DISABLE, createMouseParser } from '../core/mouse.js';
import { openExternal } from '../core/open.js';
import type { DocState, Focus, UiState } from '../core/nav.js';
import DocPane from './DocPane.js';
import Sidebar from './Sidebar.js';
import HelpOverlay from './HelpOverlay.js';

// 02 §11 — UI state types are owned by src/core/nav.ts (task 3.4); re-exported
// for module compatibility.
export type { DocState, Focus, UiState };

export interface AppProps {
  doc: RenderedDoc;
  root: string;
  theme: Theme;
  themeId: string;
  sidebarOpen: boolean;
  showHidden: boolean;
  showFrontmatter: boolean;
}

// ADR-023 (ISSUE-010) — pane-header labels must never wrap: truncate
// manually (Sidebar's `truncate()` pattern), not with ink `wrap="truncate"`.
function fitLabel(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// 02 §11 — StatusBar (inlined here until the layout grows; props per
// contract). R-3 (ISSUE-012): between the center and the right group, a dim
// contextual key hint for the focused pane; omitted while warnings are
// present (they take precedence for the space).
function StatusBar({ theme, path, line, total, themeId, warnings, focus }: {
  theme: Theme;
  path: string;
  line: number;
  total: number;
  themeId: string;
  warnings: string[];
  focus: Focus;
}) {
  const hint = warnings.length === 0
    ? (focus === 'doc' ? '↑↓ scroll · g/G · ?' : '↑↓ move · ⏎ open · ?')
    : null;
  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Text>{path}</Text>
      <Text>L{line} {line}/{total}</Text>
      {hint !== null && <Text>{paint(theme, 'dim', hint)}</Text>}
      <Box flexDirection="row">
        <Text>{themeId}</Text>
        {warnings.length > 0
          ? <Text>{paint(theme, 'statusWarn', ' ⚠ ' + warnings.join(', '))}</Text>
          : <Text>{paint(theme, 'statusOk', '')}</Text>}
      </Box>
    </Box>
  );
}

export default function App({ doc, root, theme, themeId, sidebarOpen, showHidden, showFrontmatter }: AppProps) {
  const [state, setState] = useState<UiState>(() => ({
    stack: [{ abs: doc.source, doc, scrollTop: 0 }],
    cur: 0,
    focus: 'doc',
    sidebarOpen,
    cwd: root,
    cursor: 0,
    themeId,
    help: false,
    reloadTick: 0,
  }));
  const cur = state.stack[state.cur];

  // 02 §11 / ADR-023 — chrome layout: header row (row 0) + content rows +
  // status row. Content rows = terminalRows − 2 (was terminalRows − 1).
  // Effective doc width = terminalCols − (sidebarOpen ? 31 : 0) (sidebar 30
  // + separator 1), min 40.
  const stdout = useStdout().stdout as NodeJS.WritableStream & { rows?: number; columns?: number };
  const terminalRows = stdout.rows || 24;
  const contentRows = Math.max(1, terminalRows - 2);
  const width = Math.max((stdout.columns || 80) - (state.sidebarOpen ? 31 : 0), 40);

  // 02 §11 / INV-3.8 — the theme object follows state.themeId (T cycles it
  // via nextTheme over allThemeIds()). The initial prop's theme is kept
  // verbatim, which covers PLAIN_THEME (NO_COLOR) that is not a builtin/user id.
  const themeObj = useMemo(() => {
    if (state.themeId === theme.id) return theme;
    return BUILTIN_THEMES[state.themeId] ?? loadUserTheme(state.themeId) ?? theme;
  }, [state.themeId]);

  const render = (abs: string) =>
    renderFile(abs, { root, width, theme: themeObj, showFrontmatter, showHidden });

  // 02 §11 — re-render the doc via renderFile on [abs, width, reloadTick, themeId]
  // (INV-3.2: sidebar toggle re-wraps at the new width; INV-3.8: T re-themes).
  const docMemo = useMemo(
    () => renderFile(cur.abs, { root, width, theme: themeObj, showFrontmatter, showHidden }),
    [cur.abs, width, state.reloadTick, state.themeId],
  );
  const entries = useMemo(
    () => listEntries(state.cwd, showHidden),
    [state.cwd, showHidden, state.reloadTick],
  );

  const total = docMemo.lines.length;
  const maxTop = Math.max(0, total - contentRows);
  const scrollTop = Math.min(cur.scrollTop, maxTop);

  // 02 §10 / INV-3.6 — mouse: enable SGR 1006 on mount, parse stdin, act on
  // left-button release. The parser callback reads the latest view through a
  // ref, so the listener (and the enable/disable mode bytes) attach exactly
  // once per mount instead of per state change.
  const view = useRef({ state, doc: docMemo, scrollTop, render, contentRows });
  view.current = { state, doc: docMemo, scrollTop, render, contentRows };

  useEffect(() => {
    process.stdout.write(MOUSE_ENABLE);
    const p = createMouseParser((e: MouseEvt) => {
      if (e.action !== 'release' || e.button !== 0) return;
      const { state: st, doc, scrollTop: top, render: renderNow, contentRows: crows } = view.current;
      // ADR-023 (ISSUE-010) — the status row (and anything below it) is not
      // clickable.
      if (e.y >= crows) return;
      // ADR-023 — content starts below the header row; a click on the header
      // row itself is a no-op.
      const rowY = e.y - 1;
      if (rowY < 0) return;
      if (st.sidebarOpen && e.x < 30) {
        // INV-3.6 (am. ISSUE-003) — mouseup in the sidebar region focuses
        // the sidebar; if the row carries an entry, it is opened.
        const entry = hitTestSidebar(st.cwd, showHidden, rowY);
        if (!entry) {
          if (st.focus !== 'sidebar') setState((s) => ({ ...s, focus: 'sidebar' }));
          return;
        }
        if (entry.isDir) {
          setState((s) => ({ ...s, cwd: entry.abs, cursor: 0, focus: 'sidebar' }));
        } else {
          setState((s) => ({ ...navOpen(s, entry.abs, renderNow), focus: 'sidebar' }));
        }
        return;
      }
      // ADR-023 (ISSUE-010) — the separator column (x === 30, sidebar open)
      // is a no-op.
      if (st.sidebarOpen && e.x === 30) return;
      // Doc pane starts at terminal column 31 when the sidebar is open
      // (30-col sidebar + 1-col separator); LinkSpan columns are pane-relative.
      const docX = e.x - (st.sidebarOpen ? 31 : 0);
      const span = hitTestDoc(doc, top, docX, rowY);
      if (!span) {
        // INV-3.6 (am. ISSUE-003) — doc-region click outside a link
        // (incl. unresolved spans, which register no span) focuses the doc.
        if (st.focus !== 'doc') setState((s) => ({ ...s, focus: 'doc' }));
        return;
      }
      if (span.kind === 'http') {
        openExternal(span.href);
        if (st.focus !== 'doc') setState((s) => ({ ...s, focus: 'doc' }));
        return;
      }
      setState((s) => ({ ...navOpen(s, span.href, renderNow), focus: 'doc' }));
    });
    process.stdin.on('data', p);
    return () => {
      process.stdin.removeListener('data', p);
      process.stdout.write(MOUSE_DISABLE);
    };
  }, []);

  useInput((input, key) => {
    if (input === 'q') process.exit(0);

    // INV-3.7 — while help is open, any key closes it (q still quits).
    if (state.help) {
      setState((st) => ({ ...st, help: false }));
      return;
    }

    // 02 §11 — Esc: help-close (handled above) → leave sidebar focus → navBack.
    if (key.escape) {
      setState((st) => (st.focus === 'sidebar' ? { ...st, focus: 'doc' } : navBack(st)));
      return;
    }
    if (input === 'B') { setState((st) => navBack(st)); return; }
    if (input === 'F') { setState((st) => navForward(st)); return; }
    // INV-3.5 — r = reload (re-render the current doc).
    if (input === 'r') { setState((st) => ({ ...st, reloadTick: st.reloadTick + 1 })); return; }
    // INV-3.8 — T cycles the theme (nextTheme over allThemeIds()).
    if (input === 'T') { setState((st) => nextTheme(st, allThemeIds())); return; }
    // INV-3.7 — ? opens the help overlay.
    if (input === '?') { setState((st) => ({ ...st, help: true })); return; }

    if (key.tab) {
      // INV-3.2 — Tab toggles the sidebar; opening focuses it, closing
      // returns focus to the doc (doc re-wraps via the useMemo above).
      const opening = !state.sidebarOpen;
      setState((st) => ({ ...st, sidebarOpen: opening, focus: opening ? 'sidebar' : 'doc' }));
      return;
    }

    // ADR-017 (amended, ISSUE-002, ISSUE-008) — ←/→ switch focus between
    // panes without toggling, spatially: the arrow points at the pane it
    // focuses (sidebar is on the left). No-op when the target pane is
    // closed (sidebar focus is only reachable while the sidebar is open).
    if (key.leftArrow) {
      if (state.sidebarOpen && state.focus === 'doc') setState((st) => ({ ...st, focus: 'sidebar' }));
      return;
    }
    if (key.rightArrow) {
      if (state.focus === 'sidebar') setState((st) => ({ ...st, focus: 'doc' }));
      return;
    }

    if (state.focus === 'sidebar') {
      // INV-3.4 — ↑/↓ move the sidebar cursor; Enter opens the entry.
      const n = entries.length;
      if (key.upArrow) {
        setState((st) => ({ ...st, cursor: Math.max(0, st.cursor - 1) }));
      } else if (key.downArrow) {
        setState((st) => ({ ...st, cursor: Math.min(Math.max(0, n - 1), st.cursor + 1) }));
      } else if (key.return) {
        const entry = entries[state.cursor];
        if (!entry) return;
        if (entry.isDir) {
          setState((st) => ({ ...st, cwd: entry.abs, cursor: 0 }));
        } else {
          setState((st) => ({ ...navOpen(st, entry.abs, render), focus: 'doc' }));
        }
      }
      return;
    }

    // doc focus — INV-3.3: ↑/↓ scroll 1, PgUp/PgDn scroll content rows
    // (ADR-023), g/G top/bottom, clamped.
    let next: number | null = null;
    if (key.upArrow) next = cur.scrollTop - 1;
    else if (key.downArrow) next = cur.scrollTop + 1;
    else if (key.pageUp) next = cur.scrollTop - contentRows;
    else if (key.pageDown) next = cur.scrollTop + contentRows;
    else if (input === 'g') next = 0;
    else if (input === 'G') next = maxTop;
    if (next === null) return;
    const clamped = Math.max(0, Math.min(next, maxTop));
    if (clamped === cur.scrollTop) return;
    setState((st) => {
      const stack = st.stack.slice();
      stack[st.cur] = { ...stack[st.cur], scrollTop: clamped };
      return { ...st, stack };
    });
  });

  // 02 §11 — breadcrumb = root-relative path of the current doc.
  const path = relative(root, cur.abs);
  const line = scrollTop + 1;

  // ADR-023 (ISSUE-010) — pane headers: sidebar header = the sidebar cwd
  // (basename(root) at root, else root-relative), truncated to 28 chars; doc
  // header = `¶ <root-relative doc path>` (same string as the status bar),
  // truncated to the doc width.
  const sidebarHeader = fitLabel(state.cwd === root ? basename(root) : relative(root, state.cwd), 28);
  const docHeader = fitLabel('¶ ' + path, width);

  // R-2 (ISSUE-011) — focus indicator on the pane headers: the focused
  // pane's header is bright (no dim SGR), the inactive pane's header is dim.
  // The separator column stays dim in all states.
  const sidebarHeaderText = state.focus === 'sidebar'
    ? sidebarHeader
    : paint(themeObj, 'dim', sidebarHeader);
  const docHeaderText = state.focus === 'doc'
    ? docHeader
    : paint(themeObj, 'dim', docHeader);

  return (
    <Box flexDirection="column" width="100%" height={terminalRows}>
      {state.help
        ? <HelpOverlay rows={terminalRows - 1} width={width} />
        : (
          <>
            <Box flexDirection="row" width="100%" height={1}>
              {state.sidebarOpen ? (
                <>
                  <Box width={30}>
                    <Text>{sidebarHeaderText}</Text>
                  </Box>
                  <Text>{paint(themeObj, 'dim', '│')}</Text>
                  <Box flexGrow={1}>
                    <Text>{docHeaderText}</Text>
                  </Box>
                </>
              ) : (
                <Text>{docHeaderText}</Text>
              )}
            </Box>
            <Box flexDirection="row" height={contentRows}>
              {state.sidebarOpen && <Sidebar entries={entries} cursor={state.cursor} width={30} />}
              {state.sidebarOpen && (
                <Box flexDirection="column" width={1} height={contentRows}>
                  {Array.from({ length: contentRows }, (_, i) => (
                    <Text key={i}>{paint(themeObj, 'dim', '│')}</Text>
                  ))}
                </Box>
              )}
              {docMemo.lines.length === 0 ? (
                // R-4 (ISSUE-013) — an empty doc renders one dim row in
                // place of the (theme-free) DocPane.
                <Box flexDirection="column" width={width}>
                  <Text>{paint(themeObj, 'dim', '(empty document)')}</Text>
                </Box>
              ) : (
                <DocPane doc={docMemo} scrollTop={scrollTop} rows={contentRows} width={width} />
              )}
            </Box>
          </>
        )}
      <StatusBar theme={themeObj} path={path} line={line} total={total} themeId={state.themeId} warnings={docMemo.warnings} focus={state.focus} />
    </Box>
  );
}
