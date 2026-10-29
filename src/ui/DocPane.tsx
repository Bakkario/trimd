import { Box, Text } from 'ink';
import type { RenderedDoc } from '../core/types.js';

// 02 §11 — DocPane: pure display of lines [scrollTop, scrollTop+rows),
// one <Text> per line, key = line index.
export interface DocPaneProps {
  doc: RenderedDoc;
  scrollTop: number;
  rows: number;
  width: number;
}

export default function DocPane({ doc, scrollTop, rows, width }: DocPaneProps) {
  const start = Math.max(0, Math.min(scrollTop, doc.lines.length));
  const slice = doc.lines.slice(start, start + rows);
  return (
    <Box flexDirection="column" width={width} height={rows}>
      {slice.map((l, i) => (
        <Text key={start + i}>{l.text}</Text>
      ))}
    </Box>
  );
}
