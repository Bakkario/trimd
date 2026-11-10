import { Box, Text } from 'ink';
import type { DirEntry } from '../core/resolve.js';
import type { Theme } from '../core/types.js';
import { paint } from '../core/themes.js';
import { visibleWidth } from '../core/renderer.js';

// 02 §11 / D-4.1 (ADR-031) — Sidebar: Superfile-style rounded box frame,
// role-based icon sets (📁/📂, 📘, 📐, 📋, ● 📝, 📄), git dirty marks (✱),
// mtime sort indicator, and embedded bottom border.
export interface SidebarProps {
  entries: DirEntry[];
  cursor: number;
  width: number;
  showBack: boolean;
  rows?: number;
  activeAbs?: string;
  totalDirs?: number;
  totalNotes?: number;
  gitModAbs?: ReadonlySet<string>;
  theme?: Theme;
  focused?: boolean;
  cwdLabel?: string;
  sortBy?: 'name' | 'mtime';
  outgoingLinks?: { label: string; resolved: boolean }[];
  backlinks?: string[];
}

function truncate(name: string, maxLen = 26): string {
  return name.length > maxLen ? name.slice(0, Math.max(0, maxLen - 1)) + '…' : name;
}

function fit(str: string, maxW: number): string {
  let s = str;
  while (visibleWidth(s) > maxW && s.length > 0) {
    s = s.slice(0, -1);
  }
  if (s.length < str.length && maxW >= 1) {
    s = s.slice(0, Math.max(0, s.length - 1)) + '…';
    while (visibleWidth(s) > maxW && s.length > 0) {
      s = s.slice(0, -1);
    }
  }
  const pad = maxW - visibleWidth(s);
  return pad > 0 ? s + ' '.repeat(pad) : s;
}

export function getEntryIcon(e: DirEntry, isAct: boolean, isCursor: boolean, theme?: Theme): string {
  if (e.isDir) {
    const icon = isCursor ? '📂 ' : '📁 ';
    return theme ? paint(theme, 'info', icon) : icon;
  }
  if (isAct) {
    return theme ? paint(theme, 'activeDoc', '● 📝 ') : '● 📝 ';
  }
  const n = e.name.toLowerCase();
  if (n === 'readme.md' || n === 'index.md') {
    return theme ? paint(theme, 'heading2', '📘 ') : '📘 ';
  }
  if (n.includes('schema') || n.includes('adr') || n.includes('architecture') || n.includes('charter')) {
    return theme ? paint(theme, 'warning', '📐 ') : '📐 ';
  }
  if (n.includes('log') || n.includes('tracker') || n.includes('task') || n.includes('roadmap')) {
    return theme ? paint(theme, 'tag', '📋 ') : '📋 ';
  }
  return theme ? paint(theme, 'sidebar', '📄 ') : '📄 ';
}

export default function Sidebar({
  entries,
  cursor,
  width,
  showBack,
  rows,
  activeAbs,
  totalDirs,
  totalNotes,
  gitModAbs,
  theme,
  focused,
  cwdLabel,
  sortBy,
  outgoingLinks,
  backlinks,
}: SidebarProps) {
  const borderPaint = (s: string): string => {
    if (!theme || theme.id === 'plain') return s;
    const col = focused ? theme.colors.scrollbar : theme.colors.tableBorder;
    return col ? `\x1b[${col}m${s}\x1b[0m` : s;
  };

  const innerW = Math.max(10, width - 2);
  const hasHeader = rows === undefined || rows >= 8;
  const topFrameCount = hasHeader ? 3 : 1;
  const bottomFrameCount = 1;

  // Reserved rows for links mini-panel when rows >= 16 (D-4.2 / R-19)
  const hasLinks = Boolean(
    rows !== undefined &&
      rows >= 16 &&
      ((outgoingLinks && outgoingLinks.length > 0) || (backlinks && backlinks.length > 0))
  );
  const linkLines: string[] = [];
  if (hasLinks) {
    linkLines.push(borderPaint('├' + fit('─ Links ─', innerW) + '┤'));
    if (outgoingLinks) {
      for (const link of outgoingLinks.slice(0, 2)) {
        const icon = link.resolved ? '↗ ' : '⚠ ';
        const text = `  ${icon}${truncate(link.label, innerW - 6)}`;
        linkLines.push(borderPaint('│') + fit(text, innerW) + borderPaint('│'));
      }
    }
    if (backlinks) {
      for (const b of backlinks.slice(0, 2)) {
        const text = `  ↩ ${truncate(b, innerW - 6)}`;
        linkLines.push(borderPaint('│') + fit(text, innerW) + borderPaint('│'));
      }
    }
  }

  const reservedFrame = topFrameCount + bottomFrameCount + linkLines.length;
  const entryRows = rows !== undefined ? Math.max(1, rows - reservedFrame) : undefined;

  // Build top frame lines
  const frameTopLines: string[] = [borderPaint('╭' + '─'.repeat(innerW) + '╮')];
  if (hasHeader) {
    const sortTag = sortBy === 'mtime' ? ' [mtime]' : '';
    const headerTitle = `📁 ${cwdLabel ?? 'files'}${sortTag}`;
    frameTopLines.push(borderPaint('│') + fit(` ${headerTitle}`, innerW) + borderPaint('│'));
    frameTopLines.push(borderPaint('├' + '─'.repeat(innerW) + '┤'));
  }

  // Handle empty entries state
  if (entries.length === 0) {
    const emptyRows: string[] = [...frameTopLines];
    if (showBack) {
      const isCursor = cursor === 0;
      const backPrefix = isCursor ? '❯ ' : '  ';
      const backIcon = theme ? paint(theme, 'info', '📂 ') : '📂 ';
      let rawCell = `${backPrefix}${backIcon}..`;
      const pad = innerW - visibleWidth(rawCell);
      if (pad > 0) rawCell += ' '.repeat(pad);
      const innerCell = isCursor ? `\x1b[7m${rawCell}\x1b[0m` : rawCell;
      emptyRows.push(borderPaint('│') + innerCell + borderPaint('│'));
    }
    const noNotesText = fit('  (no notes)', innerW);
    emptyRows.push(borderPaint('│') + `\x1b[2m${noNotesText}\x1b[0m` + borderPaint('│'));

    // Pad remaining rows if rows provided
    if (rows !== undefined) {
      while (emptyRows.length < rows - 1) {
        emptyRows.push(borderPaint('│') + ' '.repeat(innerW) + borderPaint('│'));
      }
    }
    emptyRows.push(borderPaint('╰' + '─'.repeat(innerW) + '╯'));

    return (
      <Box flexDirection="column" width={width} height={rows}>
        {emptyRows.map((line, idx) => (
          <Text key={idx}>{line}</Text>
        ))}
      </Box>
    );
  }

  // Build all items
  const allItems: Array<{ key: string; line: string }> = [];

  if (showBack) {
    const isCursor = cursor === 0;
    const backPrefix = isCursor ? '❯ ' : '  ';
    const backIcon = theme ? paint(theme, 'info', '📂 ') : '📂 ';
    let rawCell = `${backPrefix}${backIcon}..`;
    const pad = innerW - visibleWidth(rawCell);
    if (pad > 0) rawCell += ' '.repeat(pad);
    const innerCell = isCursor ? `\x1b[7m${rawCell}\x1b[0m` : rawCell;
    allItems.push({
      key: 'back',
      line: borderPaint('│') + innerCell + borderPaint('│'),
    });
  }

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const isAct = Boolean(activeAbs && e.abs === activeAbs);
    const isMod = Boolean(gitModAbs && gitModAbs.has(e.abs));
    const row = showBack ? i + 1 : i;
    const isCursor = row === cursor;

    const icon = getEntryIcon(e, isAct, isCursor, theme);
    const prefix = isCursor ? '❯ ' : '  ';
    const modSuffix = isMod ? ' ✱' : '';

    const maxNameLen = Math.max(8, innerW - (isAct ? 8 : 6) - (isMod ? 2 : 0));
    const nameStr = isAct
      ? `\x1b[1m${truncate(e.name, maxNameLen)}\x1b[22m`
      : truncate(e.name, maxNameLen);

    let rawCell = prefix + icon + nameStr + modSuffix;
    const pad = innerW - visibleWidth(rawCell);
    if (pad > 0) rawCell += ' '.repeat(pad);

    const innerCell = isCursor ? `\x1b[7m${rawCell}\x1b[0m` : rawCell;
    allItems.push({
      key: String(i),
      line: borderPaint('│') + innerCell + borderPaint('│'),
    });
  }

  // Windowing logic
  let visibleItems = allItems;
  if (entryRows !== undefined && allItems.length > entryRows) {
    const maxTop = allItems.length - entryRows;
    const scrollTop = Math.max(0, Math.min(cursor - Math.floor(entryRows / 2), maxTop));
    visibleItems = allItems.slice(scrollTop, scrollTop + entryRows);
  }

  // Format bottom border row with embedded Superfile-style segments
  let bottomBorder = borderPaint('╰' + '─'.repeat(innerW) + '╯');
  if (totalDirs !== undefined && totalNotes !== undefined) {
    const modCount = gitModAbs ? gitModAbs.size : 0;
    const modStr = modCount > 0 ? ` · ${modCount} mod` : '';
    const seg1 = `┤ ${totalDirs} dirs · ${totalNotes} notes${modStr} ├`;
    const curIdx = Math.min(cursor + 1, Math.max(1, allItems.length));
    const seg2 = `┤ ${curIdx}/${Math.max(1, allItems.length)} ├`;

    const w1 = visibleWidth(seg1);
    const w2 = visibleWidth(seg2);

    if (w1 + w2 + 2 <= innerW) {
      const mid = '─'.repeat(Math.max(1, innerW - (w1 + w2 + 2)));
      bottomBorder =
        borderPaint('╰─') + seg1 + borderPaint(mid) + seg2 + borderPaint('─╯');
    } else if (w1 + 2 <= innerW) {
      const rem = innerW - (w1 + 1);
      bottomBorder = borderPaint('╰─') + seg1 + borderPaint('─'.repeat(Math.max(0, rem)) + '╯');
    }
  }

  // Fill empty space if visibleItems is fewer than entryRows
  const fillLines: string[] = [];
  if (entryRows !== undefined && visibleItems.length < entryRows) {
    const deficit = entryRows - visibleItems.length;
    for (let f = 0; f < deficit; f++) {
      fillLines.push(borderPaint('│') + ' '.repeat(innerW) + borderPaint('│'));
    }
  }

  return (
    <Box flexDirection="column" width={width} height={rows}>
      {frameTopLines.map((line, idx) => (
        <Text key={`top-${idx}`}>{line}</Text>
      ))}
      {visibleItems.map((item) => (
        <Text key={item.key}>{item.line}</Text>
      ))}
      {fillLines.map((line, idx) => (
        <Text key={`fill-${idx}`}>{line}</Text>
      ))}
      {linkLines.map((line, idx) => (
        <Text key={`link-${idx}`}>{line}</Text>
      ))}
      <Text>{bottomBorder}</Text>
    </Box>
  );
}
