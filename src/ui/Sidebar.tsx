import { Box, Text } from 'ink';
import type { DirEntry } from '../core/resolve.js';

// 02 §11 — Sidebar: pure display of one directory level.
// Dirs carry a ▸ prefix; cursor line is reverse video (\x1b[7m);
// names truncated with … beyond 28 chars (ADR-013); 30-col width.
export interface SidebarProps {
  entries: DirEntry[];
  cursor: number;
  width: number;
}

function truncate(name: string): string {
  return name.length > 28 ? name.slice(0, 27) + '…' : name;
}

export default function Sidebar({ entries, cursor, width }: SidebarProps) {
  return (
    <Box flexDirection="column" width={width}>
      {entries.map((e, i) => {
        const label = (e.isDir ? '▸ ' : '  ') + truncate(e.name);
        return (
          <Text key={i}>
            {i === cursor ? '\x1b[7m' + label + '\x1b[0m' : label}
          </Text>
        );
      })}
    </Box>
  );
}
