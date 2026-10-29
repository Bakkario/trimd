import { Box, Text, useInput, useStdout } from 'ink';
import { useMemo, useState } from 'react';
import { relative } from 'node:path';
import type { RenderedDoc, Theme } from '../core/types.js';
import { paint } from '../core/themes.js';
import { renderFile } from '../core/pipeline.js';
import { listEntries } from '../core/resolve.js';
import { navBack, navForward, navOpen } from '../core/nav.js';
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

// 02 §11 — StatusBar (inlined here until the layout grows; props per contract).
function StatusBar({ theme, path, line, total, themeId, warnings }: {
  theme: Theme;
  path: string;
  line: number;
  total: number;
  themeId: string;
  warnings: string[];
}) {
  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Text>{path}</Text>
      <Text>L{line} {line}/{total}</Text>
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

  // 02 §11 — pane rows = terminal rows − 1; effective width = terminalCols
  // − (sidebarOpen ? 30 : 0) − 2, min 40.
  const stdout = useStdout().stdout as NodeJS.WritableStream & { rows?: number; columns?: number };
  const paneRows = Math.max(1, (stdout.rows || 24) - 1);
  const width = Math.max((stdout.columns || 80) - (state.sidebarOpen ? 30 : 0) - 2, 40);

  const render = (abs: string) =>
    renderFile(abs, { root, width, theme, showFrontmatter, showHidden });

  // 02 §11 — re-render the doc via renderFile on [abs, width, reloadTick]
  // (INV-3.2: sidebar toggle re-wraps at the new width).
  const docMemo = useMemo(
    () => renderFile(cur.abs, { root, width, theme, showFrontmatter, showHidden }),
    [cur.abs, width, state.reloadTick],
  );
  const entries = useMemo(
    () => listEntries(state.cwd, showHidden),
    [state.cwd, showHidden, state.reloadTick],
  );

  const total = docMemo.lines.length;
  const maxTop = Math.max(0, total - paneRows);
  const scrollTop = Math.min(cur.scrollTop, maxTop);

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
    // INV-3.7 — ? opens the help overlay.
    if (input === '?') { setState((st) => ({ ...st, help: true })); return; }

    if (key.tab) {
      // INV-3.2 — Tab toggles the sidebar; opening focuses it, closing
      // returns focus to the doc (doc re-wraps via the useMemo above).
      const opening = !state.sidebarOpen;
      setState((st) => ({ ...st, sidebarOpen: opening, focus: opening ? 'sidebar' : 'doc' }));
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

    // doc focus — INV-3.3: ↑/↓ scroll 1, PgUp/PgDn scroll paneRows, g/G top/bottom, clamped.
    let next: number | null = null;
    if (key.upArrow) next = cur.scrollTop - 1;
    else if (key.downArrow) next = cur.scrollTop + 1;
    else if (key.pageUp) next = cur.scrollTop - paneRows;
    else if (key.pageDown) next = cur.scrollTop + paneRows;
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

  return (
    <Box flexDirection="column" width="100%" height={paneRows + 1}>
      {state.help
        ? <HelpOverlay rows={paneRows} width={width} />
        : (
          <Box flexDirection="row" height={paneRows}>
            {state.sidebarOpen && <Sidebar entries={entries} cursor={state.cursor} width={30} />}
            <DocPane doc={docMemo} scrollTop={scrollTop} rows={paneRows} width={width} />
          </Box>
        )}
      <StatusBar theme={theme} path={path} line={line} total={total} themeId={state.themeId} warnings={docMemo.warnings} />
    </Box>
  );
}
