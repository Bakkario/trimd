import { Box, Text } from 'ink';
import type { RenderedDoc, Theme } from '../core/types.js';
import { paint } from '../core/themes.js';
import { visibleWidth } from '../core/renderer.js';
import { composeOverlay } from '../core/overlay.js';

// 02 §11 / D-3.2 (ADR-026) — DocPane: pure display of lines [scrollTop, scrollTop+rows).
// Each row is formatted as: 2 left spaces + text padded to `width` + 2 right spaces + 1-col scrollbar.
// Total rendered columns = width + 5.
export interface DocPaneProps {
  doc: RenderedDoc;
  scrollTop: number;
  rows: number;
  width: number;
  theme?: Theme;
  overlay?: {
    rows: string[];
    startRow?: number;
    startCol?: number;
  };
}

const stripKittyApc = (s: string): string =>
  s
    .replace(/\x1bPtmux;[\s\S]*?\x1b\\(?:\x1b\\)?/g, '')
    .replace(/\x1b_G[\s\S]*?\x1b\\/g, '');

export default function DocPane({ doc, scrollTop, rows, width, theme, overlay }: DocPaneProps) {
  const total = doc.lines.length;
  const maxTop = Math.max(0, total - rows);
  const start = Math.max(0, Math.min(scrollTop, total));
  const slice = doc.lines.slice(start, start + rows);

  // Proportional scrollbar calculation per D-3.2
  const hasScroll = total > rows && maxTop > 0;
  const thumbH = hasScroll ? Math.max(1, Math.round((rows / total) * rows)) : rows;
  const thumbTop = hasScroll ? Math.round((start / maxTop) * (rows - thumbH)) : 0;

  const count = overlay
    ? Math.max(slice.length, Math.min(rows, (overlay.startRow ?? 1) + overlay.rows.length))
    : slice.length;

  const baseRows: string[] = [];
  for (let i = 0; i < count; i++) {
    const l = slice[i];
    const text = l ? l.text : '';
    const isThumb = hasScroll && i >= thumbTop && i < thumbTop + thumbH;
    let barChar = '│';
    let barColorKey: 'scrollbar' | 'dim' = 'dim';
    if (isThumb) {
      barChar = '┃';
      barColorKey = 'scrollbar';
    }
    const barStr = theme ? paint(theme, barColorKey, barChar) : barChar;

    const visLen = visibleWidth(text);
    const padLen = Math.max(0, width - visLen);
    const pad = ' '.repeat(padLen);

    baseRows.push('  ' + text + pad + '  ' + barStr);
  }

  const finalRows = overlay
    ? composeOverlay(
        baseRows,
        overlay.rows,
        overlay.startRow ?? 1,
        overlay.startCol ?? Math.max(2, width + 5 - (visibleWidth(overlay.rows[0] ?? '') + 2)),
      )
    : baseRows;

  return (
    <Box flexDirection="column" width={width + 5} height={rows}>
      {finalRows.map((line, i) => (
        <Text key={start + i}>{stripKittyApc(line)}</Text>
      ))}
    </Box>
  );
}
