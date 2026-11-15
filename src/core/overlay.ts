// 01 §2.1 / D-4.6 (ADR-035) — ANSI Z-Layer Floating Modal Box and Compositor.

import { charWidth, visibleWidth } from './renderer.js';
import type { Theme } from './types.js';

export function sliceAnsiByCols(s: string, endCols: number): string {
  let vis = 0;
  let out = '';
  let i = 0;

  while (i < s.length && vis < endCols) {
    if (s.charCodeAt(i) === 0x1b) {
      if (s[i + 1] === '[') {
        const end = s.indexOf('m', i + 2);
        if (end !== -1) {
          out += s.slice(i, end + 1);
          i = end + 1;
          continue;
        }
      } else if (s[i + 1] === ']') {
        const end = s.indexOf('\x1b\\', i + 2);
        if (end !== -1) {
          out += s.slice(i, end + 2);
          i = end + 2;
          continue;
        }
      } else if (s[i + 1] === 'P') {
        let end = s.indexOf('\x1b\\', i + 2);
        if (end !== -1) {
          if (s.slice(end + 2, end + 4) === '\x1b\\') {
            end += 2;
          }
          out += s.slice(i, end + 2);
          i = end + 2;
          continue;
        }
      } else if (s[i + 1] === '_') {
        const end = s.indexOf('\x1b\\', i + 2);
        if (end !== -1) {
          out += s.slice(i, end + 2);
          i = end + 2;
          continue;
        }
      }
    }
    const cp = s.codePointAt(i) ?? 0;
    const w = charWidth(cp);
    if (vis + w > endCols) break;
    const ch = String.fromCodePoint(cp);
    out += ch;
    vis += w;
    i += ch.length;
  }

  if (vis < endCols) {
    out += ' '.repeat(endCols - vis);
  }
  out += '\x1b[0m';
  return out;
}

export function buildModalBox(
  title: string,
  bodyLines: string[],
  footerHint: string,
  boxWidth: number,
  theme: Theme,
): string[] {
  const w = Math.max(20, boxWidth);
  const innerW = w - 2;
  const bdrSgr = theme.colors.scrollbar || theme.colors.tableBorder || '38;5;39';
  const bgSgr = theme.colors.headerBg ? ';' + theme.colors.headerBg : '';
  const bdr = (ch: string) => `\x1b[${bdrSgr}${bgSgr}m${ch}\x1b[0m`;
  const bgWrap = (text: string, textVis: number) => {
    const pad = Math.max(0, innerW - textVis);
    const fill = text + ' '.repeat(pad);
    return bgSgr ? `\x1b[${bgSgr.slice(1)}m${fill}\x1b[0m` : fill;
  };

  const rows: string[] = [];

  // Top border: ╭─ ◈ <title> ────╮
  const titleText = `◈ ${title} `;
  const titleVis = visibleWidth(titleText);
  const topDashes = Math.max(1, innerW - 1 - titleVis);
  const topRowInner = `─ ${titleText}${'─'.repeat(topDashes)}`;
  const topRow = bdr('╭') + (bgSgr ? `\x1b[1;${bdrSgr}${bgSgr}m${topRowInner}\x1b[0m` : `\x1b[1;${bdrSgr}m${topRowInner}\x1b[0m`) + bdr('╮');
  rows.push(topRow);

  // Body rows
  for (const line of bodyLines) {
    const lineVis = visibleWidth(line);
    let cellText = line;
    let cellVis = lineVis;
    if (lineVis > innerW - 2) {
      cellText = sliceAnsiByCols(line, innerW - 2);
      cellVis = innerW - 2;
    }
    const innerContent = ' ' + cellText;
    const bodyRow = bdr('│') + bgWrap(innerContent, cellVis + 1) + bdr('│');
    rows.push(bodyRow);
  }

  // Footer row: ╰─ <footerHint> ────╯
  const footerText = footerHint ? ` ${footerHint} ` : '';
  const footerVis = visibleWidth(footerText);
  const botDashes = Math.max(1, innerW - 1 - footerVis);
  const botRowInner = `─${footerText}${'─'.repeat(botDashes)}`;
  const botRow = bdr('╰') + (bgSgr ? `\x1b[${bdrSgr}${bgSgr}m${botRowInner}\x1b[0m` : `\x1b[${bdrSgr}m${botRowInner}\x1b[0m`) + bdr('╯');
  rows.push(botRow);

  return rows;
}

export function composeOverlay(
  baseRows: string[],
  modalRows: string[],
  startRow: number,
  startCol: number,
): string[] {
  const result = [...baseRows];
  for (let r = 0; r < modalRows.length; r++) {
    const rowIdx = startRow + r;
    if (rowIdx < result.length) {
      result[rowIdx] = sliceAnsiByCols(result[rowIdx], startCol) + modalRows[r];
    }
  }
  return result;
}
