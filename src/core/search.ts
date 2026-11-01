import type { RenderedDoc, RenderedLine, Theme } from './types.js';
import { parseLineText, stripAnsi } from './renderer.js';

export interface Match {
  line: number;
  startCol: number;
  endCol: number;
}

/**
 * Find all case-insensitive literal substring occurrences of `query` across
 * the visible (ANSI-stripped) text of doc lines.
 * Overlapping occurrences are included.
 * Empty query => returns [].
 */
export function findMatches(lines: RenderedLine[], query: string): Match[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const qLen = q.length;
  const matches: Match[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const visible = stripAnsi(lines[lineIdx].text).toLowerCase();
    let pos = 0;
    while (pos <= visible.length - qLen) {
      const idx = visible.indexOf(q, pos);
      if (idx === -1) break;
      matches.push({
        line: lineIdx,
        startCol: idx,
        endCol: idx + qLen,
      });
      pos = idx + 1;
    }
  }

  return matches;
}

/**
 * Apply search highlighting to rendered doc lines.
 * For each line with matches, parseLineText tokenizes the line.
 * Slices runs at match boundaries:
 *   - match runs append the search slot SGR
 *   - current match (idx) additionally appends ';7' (reverse video)
 *   - OSC 8 links are re-wrapped properly
 * LinkSpan arrays pass through untouched.
 */
export function applySearch(
  doc: RenderedDoc,
  matches: Match[],
  currentIdx: number,
  theme: Theme,
): RenderedDoc {
  if (matches.length === 0) return doc;

  // Group matches by line
  const lineMatches = new Map<number, { match: Match; isCurrent: boolean }[]>();
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    let arr = lineMatches.get(m.line);
    if (!arr) {
      arr = [];
      lineMatches.set(m.line, arr);
    }
    arr.push({ match: m, isCurrent: i === currentIdx });
  }

  const searchSlot = theme.colors.search || '';

  const newLines = doc.lines.map((origLine, lineIdx) => {
    const ms = lineMatches.get(lineIdx);
    if (!ms || ms.length === 0) return origLine;

    const toks = parseLineText(origLine.text);
    let col = 0;
    let resText = '';

    for (const tok of toks) {
      const tokLen = tok.text.length;
      const tokStart = col;
      const tokEnd = col + tokLen;
      col = tokEnd;

      // Character-by-character or segment splitting within the token
      let charIdx = 0;
      while (charIdx < tokLen) {
        const curCol = tokStart + charIdx;
        // Check if curCol falls in any match
        const activeMatch = ms.find(
          (m) => curCol >= m.match.startCol && curCol < m.match.endCol,
        );

        let runLen = 1;
        while (charIdx + runLen < tokLen) {
          const nextCol = tokStart + charIdx + runLen;
          const nextMatch = ms.find(
            (m) => nextCol >= m.match.startCol && nextCol < m.match.endCol,
          );
          if (
            (activeMatch === undefined && nextMatch === undefined) ||
            (activeMatch !== undefined &&
              nextMatch !== undefined &&
              activeMatch.isCurrent === nextMatch.isCurrent)
          ) {
            runLen++;
          } else {
            break;
          }
        }

        const segText = tok.text.slice(charIdx, charIdx + runLen);
        charIdx += runLen;

        let sgr = tok.sgr;
        if (activeMatch !== undefined) {
          const extraParts: string[] = [];
          if (searchSlot) extraParts.push(searchSlot);
          if (activeMatch.isCurrent) extraParts.push('7');
          if (extraParts.length > 0) {
            sgr = sgr ? sgr + ';' + extraParts.join(';') : extraParts.join(';');
          }
        }

        let body = sgr ? '\x1b[' + sgr + 'm' + segText + '\x1b[0m' : segText;
        if (tok.url !== null) {
          body = '\x1b]8;url=' + tok.url + '\x1b\\' + body + '\x1b]8;;\x1b\\';
        }
        resText += body;
      }
    }

    return {
      text: resText,
      links: origLine.links,
    };
  });

  return {
    ...doc,
    lines: newLines,
  };
}
