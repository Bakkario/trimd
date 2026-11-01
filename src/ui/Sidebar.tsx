import { Box, Text } from 'ink';
import type { DirEntry } from '../core/resolve.js';
import type { Theme } from '../core/types.js';
import { paint } from '../core/themes.js';

// 02 §11 / D-3.6 (ADR-030) — Sidebar: pure display of one directory level.
// Dirs carry a ▸ prefix; cursor line is reverse video (\x1b[7m);
// active note renders passive `● ` in `activeDoc` + bold name.
// Bottom summary `<D> dirs · <N> notes` (+ ` · <G> mod` if gitModAbs non-empty) when rows >= 6.
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
}

function truncate(name: string, maxLen = 26): string {
  return name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name;
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
}: SidebarProps) {
  const back = showBack ? (cursor === 0 ? '\x1b[7m  ..\x1b[0m' : '  ..') : null;

  const showFooter = rows !== undefined && rows >= 6 && totalDirs !== undefined && totalNotes !== undefined;
  const entryRows = showFooter && rows !== undefined ? rows - 1 : rows;

  if (entries.length === 0) {
    return (
      <Box flexDirection="column" width={width} height={rows}>
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
    const isAct = Boolean(activeAbs && e.abs === activeAbs);
    const isMod = Boolean(gitModAbs && gitModAbs.has(e.abs));
    const prefix = e.isDir
      ? '▸ '
      : isAct
        ? (theme ? paint(theme, 'activeDoc', '● ') : '● ')
        : '  ';

    const displayName = isAct
      ? `\x1b[1m${truncate(e.name, isMod ? 24 : 26)}\x1b[22m`
      : truncate(e.name, isMod ? 24 : 26);
    const modSuffix = isMod ? ' ✱' : '';

    const label = prefix + displayName + modSuffix;
    const row = showBack ? i + 1 : i;
    allItems.push({
      key: String(i),
      text: row === cursor ? '\x1b[7m' + label + '\x1b[0m' : label,
    });
  }

  let visibleItems = allItems;
  if (entryRows !== undefined && allItems.length > entryRows) {
    const maxTop = allItems.length - entryRows;
    const scrollTop = Math.max(0, Math.min(cursor - Math.floor(entryRows / 2), maxTop));
    visibleItems = allItems.slice(scrollTop, scrollTop + entryRows);
  }

  let footerText = '';
  if (showFooter) {
    const modCount = gitModAbs ? gitModAbs.size : 0;
    const modStr = modCount > 0 ? ` · ${modCount} mod` : '';
    footerText = ` ${totalDirs} dirs · ${totalNotes} notes${modStr}`;
    footerText = theme ? paint(theme, 'dim', footerText) : `\x1b[2m${footerText}\x1b[22m`;
  }

  return (
    <Box flexDirection="column" width={width} height={rows}>
      <Box flexDirection="column" flexGrow={1}>
        {visibleItems.map((item) => (
          <Text key={item.key}>{item.text}</Text>
        ))}
      </Box>
      {showFooter && <Text>{footerText}</Text>}
    </Box>
  );
}
