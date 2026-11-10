import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';

// 01 §2.1 / D-4.4 (ADR-033) — Inline & block LaTeX math plugin for markdown-it.

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (pos + 2 > max) return false;
  if (state.src.charCodeAt(pos) !== 0x24 || state.src.charCodeAt(pos + 1) !== 0x24) return false;

  pos += 2;
  const firstLine = state.src.slice(pos, max);

  // Single-line $$ ... $$
  if (firstLine.trim().endsWith('$$') && firstLine.trim().length >= 2) {
    if (silent) return true;
    const content = firstLine.trim().slice(0, -2).trim();
    const token = state.push('fence', 'code', 0);
    token.info = 'math';
    token.content = content + '\n';
    token.map = [startLine, startLine + 1];
    state.line = startLine + 1;
    return true;
  }

  // Multi-line $$ ... $$
  let nextLine = startLine;
  let foundClose = false;
  while (nextLine < endLine) {
    nextLine++;
    if (nextLine >= endLine) break;
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    const lineEnd = state.eMarks[nextLine];
    const lineStr = state.src.slice(pos, lineEnd).trim();
    if (lineStr.endsWith('$$')) {
      foundClose = true;
      break;
    }
  }

  if (!foundClose) return false;
  if (silent) return true;

  const content = state.getLines(startLine + 1, nextLine, state.tShift[startLine], true);
  const token = state.push('fence', 'code', 0);
  token.info = 'math';
  token.content = (firstLine.trim() ? firstLine + '\n' : '') + content;
  token.map = [startLine, nextLine + 1];
  state.line = nextLine + 1;
  return true;
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (state.src[start] !== '$') return false;
  if (start + 1 < max && state.src[start + 1] === '$') return false;
  if (start + 1 >= max || /\s/.test(state.src[start + 1])) return false;

  const nextDollar = state.src.indexOf('$', start + 1);
  if (nextDollar === -1 || nextDollar > max) return false;
  const candidate = state.src.slice(start + 1, nextDollar);
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(candidate)) return false;

  let pos = start + 1;
  let close = -1;
  while (pos < max) {
    const ch = state.src[pos];
    if (ch === '$' && state.src[pos - 1] !== '\\') {
      if (!/\s/.test(state.src[pos - 1])) {
        close = pos;
        break;
      }
    }
    pos++;
  }
  if (close === -1 || close === start + 1) return false;

  if (!silent) {
    const tok = state.push('math_inline', 'math', 0);
    tok.content = state.src.slice(start + 1, close);
  }
  state.pos = close + 1;
  return true;
}

export function mathPlugin(md: MarkdownIt): void {
  md.block.ruler.before('fence', 'math_block', mathBlockRule);
  md.inline.ruler.before('escape', 'math_inline', mathInlineRule);
}
