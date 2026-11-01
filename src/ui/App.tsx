import { Box, Text, useInput, useStdout } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { basename, relative } from 'node:path';
import type { MouseEvt, RenderedDoc, Theme } from '../core/types.js';
import { paint, allThemeIds, BUILTIN_THEMES, loadUserTheme } from '../core/themes.js';
import { renderFile } from '../core/pipeline.js';
import { listEntries } from '../core/resolve.js';
import { navBack, navForward, navOpen, navUp, nextTheme, hitTestDoc, hitTestSidebar } from '../core/nav.js';
import { MOUSE_ENABLE, MOUSE_DISABLE, createMouseParser } from '../core/mouse.js';
import { openExternal } from '../core/open.js';
import type { DocState, Focus, UiState } from '../core/nav.js';
import { findMatches, applySearch } from '../core/search.js';
import { stripAnsi } from '../core/renderer.js';
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

export interface SearchState {
  query: string;
  idx: number;
  rowOpen: boolean;
}

// ADR-023 (ISSUE-010) — pane-header labels must never wrap: truncate
// manually (Sidebar's `truncate()` pattern), not with ink `wrap="truncate"`.
function fitLabel(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// 02 §11 / D-3.2 (ADR-026) — StatusBar (full-width headerBg, 3 segments).
// Left: search indicator or L<line> <line>/<total>.
// Center: contextual key hints (never disappear when warnings non-empty).
// Right: compact warning badge ( ⚠ <N> ) + scroll percentage + theme pill.
function StatusBar({
  theme,
  path,
  line,
  total,
  scrollTop,
  contentRows,
  themeId,
  warnings,
  focus,
  search,
  searchMatches,
  columns,
}: {
  theme: Theme;
  path: string;
  line: number;
  total: number;
  scrollTop: number;
  contentRows: number;
  themeId: string;
  warnings: string[];
  focus: Focus;
  search: SearchState | null;
  searchMatches: number;
  columns: number;
}) {
  let leftText = `L${line} ${line}/${total}`;
  if (search && search.query) {
    leftText = `/ ${search.query} ${searchMatches > 0 ? search.idx + 1 : 0}/${searchMatches}`;
  }

  // Key hints
  let centerText = '';
  if (focus === 'sidebar') {
    centerText = '↑↓ move · ⏎ open · ←/→ pane · ?';
  } else {
    centerText = columns >= 95
      ? '↑↓ scroll · / find · l links · o outline · y copy · ?'
      : '↑↓ · / · l · o · y · ?';
  }

  // Right group: warning badge, scroll %, theme pill
  const scrollPct = total > 0
    ? Math.max(0, Math.min(100, Math.round(((scrollTop + contentRows) / total) * 100)))
    : 100;
  const pctStr = `${scrollPct}%`;

  const warnBadge = warnings.length > 0 ? ` ⚠ ${warnings.length} ` : '';
  const themePill = ` ${themeId} `;

  // Line is rendered across headerBg
  const leftPainted = ' ' + paint(theme, 'dim', leftText) + ' ';
  const centerPainted = paint(theme, 'dim', centerText);
  const warnPainted = warnBadge ? paint(theme, 'statusWarn', warnBadge) : '';
  const pctPainted = ' ' + paint(theme, 'dim', pctStr) + ' ';
  const themePainted = paint(theme, 'accentPill', themePill) + ' ';

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Text>{leftPainted}</Text>
      <Text>{centerPainted}</Text>
      <Box flexDirection="row">
        {warnBadge !== '' && <Text>{warnPainted}</Text>}
        <Text>{pctPainted}</Text>
        <Text>{themePainted}</Text>
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
  const [search, setSearch] = useState<SearchState | null>(null);
  const cur = state.stack[state.cur];

  // 02 §11 / ADR-023 / ADR-026 — chrome layout: header row (row 0) + content rows +
  // status row. When search row is open, content rows = terminalRows - 3.
  const stdout = useStdout().stdout as NodeJS.WritableStream & { rows?: number; columns?: number };
  const terminalRows = stdout.rows || 24;
  const contentRows = Math.max(1, terminalRows - 2 - (search?.rowOpen ? 1 : 0));
  const width = Math.max((stdout.columns || 80) - (state.sidebarOpen ? 31 : 0) - 5, 40);

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

  const matches = useMemo(
    () => (search ? findMatches(docMemo.lines, search.query) : []),
    [docMemo, search?.query],
  );

  const activeDocMemo = useMemo(() => {
    if (!search || matches.length === 0) return docMemo;
    const clampedIdx = Math.max(0, Math.min(search.idx, matches.length - 1));
    return applySearch(docMemo, matches, clampedIdx, themeObj);
  }, [docMemo, matches, search?.idx, themeObj]);

  const total = activeDocMemo.lines.length;
  const maxTop = Math.max(0, total - contentRows);
  const scrollTop = Math.min(cur.scrollTop, maxTop);

  // ISSUE-017: compute sidebar scrollTop when entries exceed contentRows
  const showBack = state.cwd !== root;
  const sidebarTotalRows = entries.length + (showBack ? 1 : 0);
  const sidebarScrollTop = sidebarTotalRows > contentRows
    ? Math.max(0, Math.min(state.cursor - Math.floor(contentRows / 2), sidebarTotalRows - contentRows))
    : 0;

  // 02 §10 / INV-3.6 — mouse: enable SGR 1006 on mount, parse stdin, act on
  // left-button release. The parser callback reads the latest view through a
  // ref, so the listener (and the enable/disable mode bytes) attach exactly
  // once per mount instead of per state change.
  const view = useRef({
    state,
    doc: activeDocMemo,
    scrollTop,
    render,
    contentRows,
    searchRowOpen: search?.rowOpen,
    sidebarScrollTop,
    docWidth: width,
  });
  view.current = {
    state,
    doc: activeDocMemo,
    scrollTop,
    render,
    contentRows,
    searchRowOpen: search?.rowOpen,
    sidebarScrollTop,
    docWidth: width,
  };

  useEffect(() => {
    process.stdout.write(MOUSE_ENABLE);
    const p = createMouseParser((e: MouseEvt) => {
      if (e.action !== 'release' || e.button !== 0) return;
      const { state: st, doc, scrollTop: top, render: renderNow, contentRows: crows, searchRowOpen } = view.current;
      // ADR-023 (ISSUE-010) — the status row (and anything below it) is not
      // clickable.
      const searchOffset = searchRowOpen ? 1 : 0;
      if (e.y >= crows + searchOffset) return;
      // ADR-023 — content starts below the header row (and search row if open);
      // clicks on header row or search input row are no-ops.
      if (searchRowOpen && e.y === 1) return;
      const rowY = e.y - 1 - searchOffset;
      if (rowY < 0) return;
      if (st.sidebarOpen && e.x < 30) {
        // INV-3.6 (am. ISSUE-003) — mouseup in the sidebar region focuses
        // the sidebar; if the row carries an entry, it is opened.
        // ISSUE-006 — when shown (cwd ≠ root) content row 0 is the `..`
        // back row (one level up); entry rows are offset by 1.
        // ISSUE-017 — apply sidebarScrollTop to rowY.
        const showBack = st.cwd !== root;
        const absRow = rowY + view.current.sidebarScrollTop;
        if (showBack && absRow === 0) {
          setState((s) => ({ ...navUp(s, root, showHidden), focus: 'sidebar' }));
          return;
        }
        const entry = hitTestSidebar(st.cwd, showHidden, absRow - (showBack ? 1 : 0));
        if (!entry) {
          if (st.focus !== 'sidebar') setState((s) => ({ ...s, focus: 'sidebar' }));
          return;
        }
        if (entry.isDir) {
          // ISSUE-006 — cursor lands on the first entry (row 1 while the
          // back row is shown), as before the back row existed.
          setState((s) => ({ ...s, cwd: entry.abs, cursor: entry.abs !== root ? 1 : 0, focus: 'sidebar' }));
        } else {
          setState((s) => ({ ...navOpen(s, entry.abs, renderNow), focus: 'sidebar' }));
        }
        return;
      }
      // ADR-023 (ISSUE-010) — the separator column (x === 30, sidebar open)
      // is a no-op.
      if (st.sidebarOpen && e.x === 30) return;
      // Doc pane starts at terminal column 31 when the sidebar is open
      // (30-col sidebar + 1-col separator). D-3.2 (ADR-026): 2-space left gutter,
      // prose width, 2-space right gutter, 1-col scrollbar.
      // docX = e.x - (sidebarOpen ? 31 : 0) - 2. Clicks inside gutters or scrollbar
      // focus the doc without firing a link.
      const paneX = e.x - (st.sidebarOpen ? 31 : 0);
      const docX = paneX - 2;
      if (docX < 0 || docX >= view.current.docWidth) {
        if (st.focus !== 'doc') setState((s) => ({ ...s, focus: 'doc' }));
        return;
      }
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

    // ISSUE-015: If search row is open, it captures all keys (command-line mode) except q
    if (search?.rowOpen) {
      if (key.escape) {
        if (!search.query) {
          setSearch(null);
        } else {
          setSearch({ ...search, rowOpen: false });
        }
        return;
      }
      if (key.return) {
        setSearch({ ...search, rowOpen: false });
        return;
      }
      if (input === '/' && !search.query) {
        // no-op on initial '/' when opening
        return;
      }
      if (input === 'n' || input === 'N') {
        if (matches.length > 0) {
          const delta = input === 'n' ? 1 : -1;
          const nextIdx = (search.idx + delta + matches.length) % matches.length;
          setSearch({ ...search, idx: nextIdx });
          const m = matches[nextIdx];
          const targetTop = Math.max(0, Math.min(m.line - Math.floor(contentRows / 2), maxTop));
          setState((st) => {
            const stack = st.stack.slice();
            stack[st.cur] = { ...stack[st.cur], scrollTop: targetTop };
            return { ...st, stack };
          });
        }
        return;
      }
      if (key.backspace || key.delete) {
        const nextQ = search.query.slice(0, -1);
        const nextMs = findMatches(docMemo.lines, nextQ);
        const nextIdx = nextMs.length === 0 ? 0 : Math.min(search.idx, nextMs.length - 1);
        setSearch({ query: nextQ, idx: nextIdx, rowOpen: true });
        if (nextMs.length > 0) {
          const m = nextMs[nextIdx];
          const targetTop = Math.max(0, Math.min(m.line - Math.floor(contentRows / 2), maxTop));
          setState((st) => {
            const stack = st.stack.slice();
            stack[st.cur] = { ...stack[st.cur], scrollTop: targetTop };
            return { ...st, stack };
          });
        }
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        const nextQ = search.query + input;
        const nextMs = findMatches(docMemo.lines, nextQ);
        setSearch({ query: nextQ, idx: 0, rowOpen: true });
        if (nextMs.length > 0) {
          const m = nextMs[0];
          const targetTop = Math.max(0, Math.min(m.line - Math.floor(contentRows / 2), maxTop));
          setState((st) => {
            const stack = st.stack.slice();
            stack[st.cur] = { ...stack[st.cur], scrollTop: targetTop };
            return { ...st, stack };
          });
        }
        return;
      }
      return;
    }

    // ISSUE-015: In-doc search navigation keys when doc focused
    if (state.focus === 'doc') {
      if (input === '/') {
        setSearch((s) => ({
          query: s ? s.query : '',
          idx: s ? s.idx : 0,
          rowOpen: true,
        }));
        return;
      }
      if (search && matches.length > 0) {
        if (input === 'n') {
          const nextIdx = (search.idx + 1) % matches.length;
          setSearch({ ...search, idx: nextIdx });
          const m = matches[nextIdx];
          const targetTop = Math.max(0, Math.min(m.line - Math.floor(contentRows / 2), maxTop));
          setState((st) => {
            const stack = st.stack.slice();
            stack[st.cur] = { ...stack[st.cur], scrollTop: targetTop };
            return { ...st, stack };
          });
          return;
        }
        if (input === 'N') {
          const nextIdx = (search.idx - 1 + matches.length) % matches.length;
          setSearch({ ...search, idx: nextIdx });
          const m = matches[nextIdx];
          const targetTop = Math.max(0, Math.min(m.line - Math.floor(contentRows / 2), maxTop));
          setState((st) => {
            const stack = st.stack.slice();
            stack[st.cur] = { ...stack[st.cur], scrollTop: targetTop };
            return { ...st, stack };
          });
          return;
        }
      }
      if (key.escape && search) {
        setSearch(null);
        return;
      }
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
      // ISSUE-006 — when shown (cwd ≠ root) row 0 is the `..` back row:
      // ↑/↓ clamp across it, Enter on it goes up one level.
      const showBack = state.cwd !== root;
      const n = entries.length + (showBack ? 1 : 0);
      if (key.upArrow) {
        setState((st) => ({ ...st, cursor: Math.max(0, st.cursor - 1) }));
      } else if (key.downArrow) {
        setState((st) => ({ ...st, cursor: Math.min(Math.max(0, n - 1), st.cursor + 1) }));
      } else if (key.return) {
        if (showBack && state.cursor === 0) {
          setState((st) => navUp(st, root, showHidden));
          return;
        }
        const entry = entries[state.cursor - (showBack ? 1 : 0)];
        if (!entry) return;
        if (entry.isDir) {
          // ISSUE-006 — cursor lands on the first entry (row 1 while the
          // back row is shown), as before the back row existed.
          setState((st) => ({ ...st, cwd: entry.abs, cursor: entry.abs !== root ? 1 : 0 }));
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

  // ADR-023 (ISSUE-010) / D-3.2 (ADR-026) — pane headers:
  // Row 0 across headerBg.
  // Sidebar: ` FILES ` in accentPill when focused else dim ` ▾ <cwd>`.
  // Doc: ` DOC ` in accentPill when focused + ` ¶ <path>` + < B  F > + reading stat.
  const cwdName = fitLabel(state.cwd === root ? basename(root) : relative(root, state.cwd), 22);
  const sidebarHeader = state.focus === 'sidebar'
    ? paint(themeObj, 'accentPill', ' FILES ') + ' ' + cwdName
    : paint(themeObj, 'dim', ' ▾ ' + cwdName);

  // Doc stats: reading time (~200 wpm)
  const wordCount = useMemo(() => {
    let words = 0;
    for (const l of docMemo.lines) {
      const stripped = stripAnsi(l.text).trim();
      if (stripped.length > 0) {
        words += stripped.split(/\s+/).length;
      }
    }
    return words;
  }, [docMemo]);
  const readingMin = Math.max(1, Math.ceil(wordCount / 200));
  const readingStat = `${readingMin} min · ${wordCount}w`;

  // History state: < B  F >
  const canBack = state.cur > 0;
  const canFwd = state.cur < state.stack.length - 1;
  const bStr = canBack ? 'B' : paint(themeObj, 'dim', 'B');
  const fStr = canFwd ? 'F' : paint(themeObj, 'dim', 'F');
  const histStr = `< ${bStr}  ${fStr} >`;

  const docPill = state.focus === 'doc'
    ? paint(themeObj, 'accentPill', ' DOC ') + ' '
    : '';
  const docTitle = fitLabel('¶ ' + path, Math.max(10, width - 25));
  const docTitleText = state.focus === 'doc'
    ? docPill + docTitle
    : paint(themeObj, 'dim', docTitle);
  const docRightStat = paint(themeObj, 'dim', `${histStr}   ${readingStat}`);

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
                    <Text>{sidebarHeader}</Text>
                  </Box>
                  <Text>{paint(themeObj, 'dim', '│')}</Text>
                  <Box flexGrow={1} flexDirection="row" justifyContent="space-between">
                    <Text>{docTitleText}</Text>
                    <Text>{docRightStat + '  '}</Text>
                  </Box>
                </>
              ) : (
                <Box flexGrow={1} flexDirection="row" justifyContent="space-between">
                  <Text>{docTitleText}</Text>
                  <Text>{docRightStat + '  '}</Text>
                </Box>
              )}
            </Box>
            {search?.rowOpen && (
              <Box flexDirection="row" width="100%" height={1}>
                {state.sidebarOpen ? (
                  <>
                    <Box width={30}>
                      <Text>{' '.repeat(30)}</Text>
                    </Box>
                    <Text>{paint(themeObj, 'dim', '│')}</Text>
                    <Box flexGrow={1}>
                      <Text>{paint(themeObj, 'search', '? ' + search.query + '▌')}</Text>
                    </Box>
                  </>
                ) : (
                  <Text>{paint(themeObj, 'search', '? ' + search.query + '▌')}</Text>
                )}
              </Box>
            )}
            <Box flexDirection="row" height={contentRows}>
              {state.sidebarOpen && <Sidebar entries={entries} cursor={state.cursor} width={30} showBack={state.cwd !== root} rows={contentRows} />}
              {state.sidebarOpen && (
                <Box flexDirection="column" width={1} height={contentRows}>
                  {Array.from({ length: contentRows }, (_, i) => (
                    <Text key={i}>{paint(themeObj, 'dim', '│')}</Text>
                  ))}
                </Box>
              )}
              {activeDocMemo.lines.length === 0 ? (
                // R-4 (ISSUE-013) — an empty doc renders one dim row in
                // place of the (theme-free) DocPane.
                <Box flexDirection="column" width={width + 5}>
                  <Text>{'  ' + paint(themeObj, 'dim', '(empty document)')}</Text>
                </Box>
              ) : (
                <DocPane doc={activeDocMemo} scrollTop={scrollTop} rows={contentRows} width={width} theme={themeObj} />
              )}
            </Box>
          </>
        )}
      <StatusBar
        theme={themeObj}
        path={path}
        line={line}
        total={total}
        scrollTop={scrollTop}
        contentRows={contentRows}
        themeId={state.themeId}
        warnings={
          search && search.query && matches.length === 0
            ? [...docMemo.warnings, 'no matches']
            : docMemo.warnings
        }
        focus={state.focus}
        search={search}
        searchMatches={matches.length}
        columns={stdout.columns || 80}
      />
    </Box>
  );
}
