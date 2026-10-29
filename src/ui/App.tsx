import { Box, Text, useInput, useStdout } from 'ink';
import { useState } from 'react';
import { relative } from 'node:path';
import type { RenderedDoc, Theme } from '../core/types.js';
import { paint } from '../core/themes.js';
import DocPane from './DocPane.js';

// 02 §11 — UI state shape (owned by src/core/nav.ts from task 3.4 on).
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

export interface AppProps {
  doc: RenderedDoc;
  root: string;
  theme: Theme;
  themeId: string;
  sidebarOpen: boolean;
  showHidden: boolean;
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

export default function App({ doc, root, theme, themeId, sidebarOpen, showHidden }: AppProps) {
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
  // ink's StdoutContext types the stream as WritableStream; rows/columns are
  // runtime TTY properties.
  const stdout = useStdout().stdout as NodeJS.WritableStream & { rows?: number; columns?: number };
  const paneRows = Math.max(1, (stdout.rows || 24) - 1);
  const width = Math.max((stdout.columns || 80) - (state.sidebarOpen ? 30 : 0) - 2, 40);

  useInput((input, key) => {
    if (input === 'q') process.exit(0);
    if (state.focus !== 'doc') return;
    // INV-3.3 — ↑/↓ scroll 1, PgUp/PgDn scroll paneRows, g/G top/bottom, clamped.
    const total = cur.doc.lines.length;
    const maxTop = Math.max(0, total - paneRows);
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

  const path = relative(state.cwd, cur.abs);
  const total = cur.doc.lines.length;
  const line = cur.scrollTop + 1;

  return (
    <Box flexDirection="column" width="100%" height={paneRows + 1}>
      <DocPane doc={cur.doc} scrollTop={cur.scrollTop} rows={paneRows} width={width} />
      <StatusBar theme={theme} path={path} line={line} total={total} themeId={state.themeId} warnings={cur.doc.warnings} />
    </Box>
  );
}
