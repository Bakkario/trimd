import type { LinkSpan, RenderedLine, Theme } from './types.js';
import { paint } from './themes.js';
import { stripAnsi } from './renderer.js';

export interface HintTarget {
  index: number; // 1-based
  line: number; // document line index
  endCol: number; // visible column after the link text
  span: LinkSpan;
}

/**
 * 02 §11 / D-3.4 (ADR-028):
 * Collect all clickable LinkSpans in visible viewport lines [scrollTop, scrollTop + rows),
 * deduplicating adjacent wrapped fragments sharing the same (kind, href).
 * Assigns 1-based indices 1..N.
 */
export function collectVisibleLinks(
  lines: RenderedLine[],
  scrollTop: number,
  rows: number,
): HintTarget[] {
  const visibleLines = lines.slice(scrollTop, scrollTop + rows);
  const targets: HintTarget[] = [];
  let nextIdx = 1;
  let prevLinkKey: string | null = null;
  let prevLineIdx = -1;

  visibleLines.forEach((l, r) => {
    const lineIdx = scrollTop + r;
    // Sort links on the line by startCol
    const sortedLinks = (l.links ?? []).slice().sort((a, b) => a.startCol - b.startCol);

    for (const span of sortedLinks) {
      // Unresolved links or non-actionable spans are not followed
      if (span.resolved === false) continue;

      const linkKey = `${span.kind}:${span.href}`;
      // Deduplicate wrapped link fragments spanning consecutive lines
      if (linkKey === prevLinkKey && lineIdx === prevLineIdx + 1) {
        // Continuation fragment of the same logical link
        prevLineIdx = lineIdx;
        continue;
      }

      targets.push({
        index: nextIdx++,
        line: lineIdx,
        endCol: span.endCol,
        span,
      });

      prevLinkKey = linkKey;
      prevLineIdx = lineIdx;
    }
  });

  return targets;
}

/**
 * Injects `[1]`, `[2]`, ... `[N]` in `linkHint` SGR immediately after each link's visible text.
 * Truncates / clamps to `width`.
 */
export function applyLinkHints(
  linesSlice: RenderedLine[],
  hints: HintTarget[],
  scrollTop: number,
  theme: Theme,
  width: number,
  activePrefix?: string,
): RenderedLine[] {
  // Map of line -> hints on that line
  const byLine = new Map<number, HintTarget[]>();
  for (const h of hints) {
    const arr = byLine.get(h.line) ?? [];
    arr.push(h);
    byLine.set(h.line, arr);
  }

  return linesSlice.map((l, r) => {
    const lineIdx = scrollTop + r;
    const lineHints = byLine.get(lineIdx);
    if (!lineHints || lineHints.length === 0) {
      return l;
    }

    // Sort descending by endCol so insertions don't shift earlier column offsets
    const sorted = lineHints.slice().sort((a, b) => b.endCol - a.endCol);

    let text = l.text;
    for (const h of sorted) {
      const badgeText = `[${h.index}]`;
      const isPending = activePrefix && String(h.index).startsWith(activePrefix);
      const styledBadge = isPending
        ? paint(theme, 'search', badgeText)
        : paint(theme, 'linkHint', badgeText);

      // Find character index in text corresponding to visible column h.endCol
      let visCol = 0;
      let charIdx = 0;
      let inEscape = false;
      let inOsc = false;

      while (charIdx < text.length) {
        if (!inEscape && !inOsc && text.startsWith('\x1b]', charIdx)) {
          inOsc = true;
          charIdx += 2;
          continue;
        }
        if (inOsc) {
          if (text.startsWith('\x1b\\', charIdx)) {
            inOsc = false;
            charIdx += 2;
          } else {
            charIdx++;
          }
          continue;
        }
        if (!inEscape && text.startsWith('\x1b[', charIdx)) {
          inEscape = true;
          charIdx += 2;
          continue;
        }
        if (inEscape) {
          if (/[a-zA-Z]/.test(text[charIdx])) {
            inEscape = false;
          }
          charIdx++;
          continue;
        }

        if (visCol === h.endCol) {
          break;
        }
        visCol++;
        charIdx++;
      }

      text = text.slice(0, charIdx) + styledBadge + text.slice(charIdx);
    }

    return { text, links: l.links };
  });
}

/**
 * 02 §11 / D-3.4 (ADR-028):
 * Digit input resolver.
 * k = Number(buf):
 * - If k >= 1 && k <= total and k * 10 > total: { status: 'activate', index: k }
 * - If k >= 1 && k <= total and k * 10 <= total: { status: 'pending' }
 * - Else: { status: 'invalid' }
 */
export function resolveHintInput(
  buf: string,
  total: number,
): { status: 'activate'; index: number } | { status: 'pending' } | { status: 'invalid' } {
  if (!buf || buf === '0' || !/^\d+$/.test(buf)) {
    return { status: 'invalid' };
  }
  const k = Number(buf);
  if (k < 1 || k > total) {
    return { status: 'invalid' };
  }
  if (k * 10 > total) {
    return { status: 'activate', index: k };
  }
  return { status: 'pending' };
}
