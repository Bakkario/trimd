import { Box, Text } from 'ink';
import type { RenderedDoc, Theme } from '../core/types.js';
import { paint } from '../core/themes.js';
import { visibleWidth } from '../core/renderer.js';

// 02 §11 / D-3.2 (ADR-026) — DocPane: pure display of lines [scrollTop, scrollTop+rows).
// Each row is formatted as: 2 left spaces + text padded to `width` + 2 right spaces + 1-col scrollbar.
// Total rendered columns = width + 5.
export interface DocPaneProps {
  doc: RenderedDoc;
  scrollTop: number;
  rows: number;
  width: number;
  theme?: Theme;
}

export default function DocPane({ doc, scrollTop, rows, width, theme }: DocPaneProps) {
  const total = doc.lines.length;
  const maxTop = Math.max(0, total - rows);
  const start = Math.max(0, Math.min(scrollTop, total));
  const slice = doc.lines.slice(start, start + rows);

  // Proportional scrollbar calculation per D-3.2
  const hasScroll = total > rows && maxTop > 0;
  const thumbH = hasScroll ? Math.max(1, Math.round((rows / total) * rows)) : rows;
  const thumbTop = hasScroll ? Math.round((start / maxTop) * (rows - thumbH)) : 0;

  return (
    <Box flexDirection="column" width={width + 5} height={rows}>
      {slice.map((l, i) => {
        const isThumb = hasScroll && i >= thumbTop && i < thumbTop + thumbH;
        let barChar = '│';
        let barColorKey: 'scrollbar' | 'dim' = 'dim';
        if (isThumb) {
          barChar = '┃';
          barColorKey = 'scrollbar';
        }
        const barStr = theme ? paint(theme, barColorKey, barChar) : barChar;

        const visLen = visibleWidth(l.text);
        const padLen = Math.max(0, width - visLen);
        const pad = ' '.repeat(padLen);

        return (
          <Text key={start + i}>
            {'  '}{l.text}{pad}{'  '}{barStr}
          </Text>
        );
      })}
    </Box>
  );
}
