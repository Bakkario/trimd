/**
 * 02 §12 / D-3.5 (ADR-029) — SSH-First Clipboard (OSC 52) & Mouse Selection (ISSUE-030)
 */

import { charWidth, stripAnsi } from './renderer.js';
import type { RenderedLine } from './types.js';

export interface SelectionPoint {
  line: number;
  col: number;
}

export function isSshSession(env?: NodeJS.ProcessEnv): boolean {
  const e = env ?? process.env;
  return Boolean(e.SSH_CONNECTION || e.SSH_TTY || e.SSH_CLIENT);
}

export function encodeOsc52(text: string, env?: NodeJS.ProcessEnv): string {
  const e = env ?? process.env;
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  const osc = `\x1b]52;c;${b64}\x07`;
  if (e.TMUX) {
    return `\x1bPtmux;\x1b${osc}\x1b\\`;
  }
  return osc;
}

function normalizeSelection(start: SelectionPoint, end: SelectionPoint): [SelectionPoint, SelectionPoint] {
  if (start.line < end.line || (start.line === end.line && start.col <= end.col)) {
    return [start, end];
  }
  return [end, start];
}

function slicePlainByCols(plain: string, startCol: number, endCol: number): string {
  let vis = 0;
  let out = '';
  for (const ch of plain) {
    const cp = ch.codePointAt(0) ?? 0;
    const w = charWidth(cp);
    if (vis + w > endCol) break;
    if (vis >= startCol) {
      out += ch;
    }
    vis += w;
  }
  return out;
}

export function extractSelectionText(
  lines: RenderedLine[],
  start: SelectionPoint,
  end: SelectionPoint,
): string {
  if (lines.length === 0) return '';
  const [a, b] = normalizeSelection(start, end);
  const fromLine = Math.max(0, Math.min(lines.length - 1, a.line));
  const toLine = Math.max(0, Math.min(lines.length - 1, b.line));

  const parts: string[] = [];
  for (let i = fromLine; i <= toLine; i++) {
    const plain = stripAnsi(lines[i].text);
    const sc = i === fromLine ? Math.max(0, a.col) : 0;
    const ec = i === toLine ? Math.max(0, b.col) : Number.MAX_SAFE_INTEGER;
    parts.push(slicePlainByCols(plain, sc, ec));
  }
  return parts.join('\n');
}

function highlightLineRange(text: string, startCol: number, endCol: number): string {
  if (startCol >= endCol) return text;
  let vis = 0;
  let i = 0;
  let out = '';
  let inSel = false;

  while (i < text.length) {
    if (text[i] === '\x1b') {
      if (text[i + 1] === '[') {
        const m = text.indexOf('m', i + 2);
        if (m !== -1) {
          const seq = text.slice(i, m + 1);
          out += seq;
          if (inSel && seq === '\x1b[0m') {
            out += '\x1b[7m';
          }
          i = m + 1;
          continue;
        }
      } else if (text[i + 1] === ']' || text[i + 1] === '_' || text[i + 1] === 'P') {
        let end = text.indexOf('\x1b\\', i + 2);
        if (end !== -1) {
          if (text[i + 1] === 'P' && text.slice(end + 2, end + 4) === '\x1b\\') end += 2;
          out += text.slice(i, end + 2);
          i = end + 2;
          continue;
        }
      }
    }

    const cp = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    const w = charWidth(cp);

    if (!inSel && vis >= startCol && vis < endCol) {
      out += '\x1b[7m';
      inSel = true;
    } else if (inSel && vis >= endCol) {
      out += '\x1b[27m';
      inSel = false;
    }

    out += ch;
    vis += w;
    i += ch.length;
  }

  if (inSel) {
    out += '\x1b[27m';
  }
  return out;
}

export function applySelectionHighlight(
  lines: RenderedLine[],
  start: SelectionPoint,
  end: SelectionPoint,
): RenderedLine[] {
  if (lines.length === 0) return lines;
  const [a, b] = normalizeSelection(start, end);
  return lines.map((line, idx) => {
    if (idx < a.line || idx > b.line) return line;
    const sc = idx === a.line ? Math.max(0, a.col) : 0;
    const ec = idx === b.line ? Math.max(0, b.col) : Number.MAX_SAFE_INTEGER;
    return { ...line, text: highlightLineRange(line.text, sc, ec) };
  });
}
