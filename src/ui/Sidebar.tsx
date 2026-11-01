import { Box, Text } from 'ink';
import type { DirEntry } from '../core/resolve.js';

// 02 §11 — Sidebar: pure display of one directory level.
// Dirs carry a ▸ prefix; cursor line is reverse video (\x1b[7m);
// names truncated with … beyond 28 chars (ADR-013); 30-col width.
// R-4 (ISSUE-013): an empty directory shows a dim `(no notes)` row
// (hardcoded SGR, same pattern as the cursor row).
// ISSUE-006: `showBack` renders a `..` back row at the top of the entry
// area (hidden at the session root). Cursor row indices are absolute:
// 0 = back row (when shown), i+1 = entry i (when shown), i = entry i (at root).
export interface SidebarProps {
  entries: DirEntry[];
  cursor: number;
  width: number;
  showBack: boolean;
  rows?: number;
}

function truncate(name: string): string {
  return name.length > 28 ? name.slice(0, 27) + '…' : name;
}

export default function Sidebar({ entries, cursor, width, showBack, rows }: SidebarProps) {
  const back = showBack ? (cursor === 0 ? '\x1b[7m  ..\x1b[0m' : '  ..') : null;
  if (entries.length === 0) {
    return (
      <Box flexDirection="column" width={width}>
        {back !== null && <Text>{back}</Text>}
        <Text>{'\x1b[2m(no notes)\x1b[0m'}</Text>
      </Box>
    );
  }

  const allItems: Array<{ key: string; text: string }> = [];
  if (back !== null) {
    allItems.push({ key: 'back', text: back });
  }
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const label = (e.isDir ? '▸ ' : '  ') + truncate(e.name);
    const row = showBack ? i + 1 : i;
    allItems.push({
      key: String(i),
      text: row === cursor ? '\x1b[7m' + label + '\x1b[0m' : label,
    });
  }

  let visibleItems = allItems;
  if (rows !== undefined && allItems.length > rows) {
    const maxTop = allItems.length - rows;
    // Keep cursor visible with 0 <= scrollTop <= maxTop
    const scrollTop = Math.max(0, Math.min(cursor - Math.floor(rows / 2), maxTop));
    visibleItems = allItems.slice(scrollTop, scrollTop + rows);
  }

  return (
    <Box flexDirection="column" width={width}>
      {visibleItems.map((item) => (
        <Text key={item.key}>{item.text}</Text>
      ))}
    </Box>
  );
}
