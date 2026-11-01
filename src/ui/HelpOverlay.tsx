import { Box, Text } from 'ink';

// ADR-017 keymap — static dim table (INV-3.7: `?` opens, any key closes).
const ROWS: Array<[string, string]> = [
  ['q', 'quit'],
  ['Tab', 'toggle sidebar + focus'],
  ['← →', 'focus doc ↔ sidebar (no-op when target pane closed)'],
  ['↑ ↓ PgUp PgDn g G', 'scroll doc (sidebar cursor when sidebar focused)'],
  ['Enter', 'open sidebar entry'],
  ['Esc', 'back / leave sidebar focus'],
  ['B', 'back'],
  ['F', 'forward'],
  ['r', 'reload'],
  ['T', 'cycle theme'],
  ['/', 'find within document (doc focus)'],
  ['n N', 'next / previous search match'],
  ['l', 'keyboard link-hints mode (doc focus)'],
  ['o', 'document outline / jump to heading (doc focus)'],
  ['m', 'toggle frontmatter YAML / compact (doc focus)'],
  ['?', 'help (any key closes)'],
];

export interface HelpOverlayProps {
  rows: number;
  width: number;
}

export default function HelpOverlay({ rows, width }: HelpOverlayProps) {
  const dim = (s: string) => '\x1b[2m' + s + '\x1b[22m';
  const lines = ['trimd — keys', ''];
  for (const [k, d] of ROWS) lines.push(k.padEnd(20) + ' ' + d);
  return (
    <Box flexDirection="column" width={width} height={rows}>
      {lines.slice(0, rows).map((l, i) => (
        <Text key={i}>{dim(l)}</Text>
      ))}
    </Box>
  );
}
