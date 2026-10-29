import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { relative } from 'node:path';
import type { RenderedDoc, Theme } from '../core/types.js';
import { paint } from '../core/themes.js';

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
  const [state] = useState<UiState>(() => ({
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

  useInput((input) => {
    if (input === 'q') process.exit(0);
  });

  const path = relative(state.cwd, cur.abs);
  const total = cur.doc.lines.length;
  const line = cur.scrollTop + 1;

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" flexGrow={1}>
        {cur.doc.lines.map((l, i) => (
          <Text key={i}>{l.text}</Text>
        ))}
      </Box>
      <StatusBar theme={theme} path={path} line={line} total={total} themeId={state.themeId} warnings={cur.doc.warnings} />
    </Box>
  );
}
