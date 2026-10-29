// 02 §8 — renderer conventions (task 1.3: headings, paragraphs, emphasis, hr, images; fences/tables/lists/quotes/links are INTERIM branches extended by tasks 1.4–1.7)

import type { Token } from 'markdown-it';
import type { RenderedLine, Theme } from './types.js';

export interface RenderCtx {
  theme: Theme;
  width: number;
  sourceDir: string;
  resolve: (t: string) => string | null;
}

// One styled run. sgr = SGR parameter string (e.g. '1;38;5;255'), null = no escape.
// br marks a hard-break (new logical line).
interface Seg { text: string; sgr: string | null; br?: boolean; }

function join(stack: string[]): string | null {
  return stack.length ? stack.join(';') : null;
}

function emphSgr(theme: Theme, kind: 'bold' | 'italic' | 'strike'): string {
  const attr = kind === 'bold' ? '1' : kind === 'italic' ? '3' : '9';
  const value = theme.colors[kind];
  return value ? attr + ';' + value : attr;
}

function headingSgr(theme: Theme, level: number): string | null {
  const key = level === 1 ? 'heading1' : level === 2 ? 'heading2' : level === 3 ? 'heading3' : level === 4 ? 'heading4' : 'heading5';
  const value = theme.colors[key];
  if (level === 1) return value ? '1;' + value : '1';
  return value || null;
}

function segsToString(segs: Seg[]): string {
  return segs.map((s) => (s.sgr ? '\x1b[' + s.sgr + 'm' + s.text + '\x1b[0m' : s.text)).join('');
}

function renderInline(theme: Theme, children: Token[], base: string[]): Seg[] {
  const stack = [...base];
  const out: Seg[] = [];
  for (const c of children) {
    switch (c.type) {
      case 'text':
        if (c.content) out.push({ text: c.content, sgr: join(stack) });
        break;
      case 'softbreak':
        out.push({ text: ' ', sgr: join(stack) });
        break;
      case 'hardbreak':
        out.push({ text: '', sgr: null, br: true });
        break;
      case 'code_inline':
        out.push({ text: c.content, sgr: c.content ? theme.colors.inlineCode || null : null });
        break;
      case 'em_open':
        stack.push(emphSgr(theme, 'italic'));
        break;
      case 'em_close':
        stack.pop();
        break;
      case 'strong_open':
        stack.push(emphSgr(theme, 'bold'));
        break;
      case 'strong_close':
        stack.pop();
        break;
      case 's_open':
        stack.push(emphSgr(theme, 'strike'));
        break;
      case 's_close':
        stack.pop();
        break;
      case 'link_open':
      case 'link_close':
        // INTERIM (task 1.7) — OSC 8 spans added later
        break;
      case 'image': {
        // INV-1.8 placeholder
        // c.content holds the alt text; the src URL lives in the 'src' attr
        const alt = (c.children ?? []).filter((x) => x.type === 'text').map((x) => x.content).join('');
        const src = (c.attrs ?? []).find((a) => a[0] === 'src')?.[1] ?? '';
        out.push({ text: '[image: ' + alt + ' → ' + src + ']', sgr: theme.colors.dim || null });
        break;
      }
      case 'html_inline':
        // INTERIM (task 1.4) — task-lists plugin checkbox; rendered from list_item meta
        break;
      default:
        if (c.content) out.push({ text: c.content, sgr: null });
        break;
    }
  }
  return out;
}

function walk(ts: Token[], i: number, end: number, rctx: RenderCtx, out: Seg[][]): void {
  while (i < end) {
    const t = ts[i];
    switch (t.type) {
      case 'heading_open': {
        const level = t.markup.length;
        const inline = ts[i + 1];
        const hs = headingSgr(rctx.theme, level);
        const base = hs !== null ? [hs] : [];
        out.push(renderInline(rctx.theme, inline.children ?? [], base));
        // advance past heading_close
        let j = i + 2;
        while (j < end && ts[j].type !== 'heading_close') j++;
        i = j + 1;
        break;
      }
      case 'paragraph_open': {
        const inline = ts[i + 1];
        out.push(...splitAtBr(renderInline(rctx.theme, inline.children ?? [], [])));
        let j = i + 2;
        while (j < end && ts[j].type !== 'paragraph_close') j++;
        i = j + 1;
        break;
      }
      case 'hr':
        out.push([{ text: '─'.repeat(30), sgr: rctx.theme.colors.hr || null }]);
        i++;
        break;
      case 'fence':
        // INTERIM (task 1.5 replaces with label + highlightCode)
        for (const line of t.content.split('\n')) {
          out.push([{ text: line, sgr: null }]);
        }
        i++;
        break;
      case 'blockquote_open': {
        // INTERIM (task 1.7 adds '│ ' prefix)
        let depth = 1;
        let j = i + 1;
        while (j < end && depth > 0) {
          if (ts[j].type === 'blockquote_open') depth++;
          else if (ts[j].type === 'blockquote_close') depth--;
          j++;
        }
        walk(ts, i + 1, j - 1, rctx, out);
        i = j;
        break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        // INTERIM (task 1.4 adds markers + 2-space indent)
        const closeType = t.type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close';
        let depth = 1;
        let j = i + 1;
        while (j < end && depth > 0) {
          if (ts[j].type === t.type) depth++;
          else if (ts[j].type === closeType) depth--;
          j++;
        }
        walk(ts, i + 1, j - 1, rctx, out);
        i = j;
        break;
      }
      case 'table_open': {
        // INTERIM (task 1.6 replaces)
        let j = i + 1;
        let row: string[] = [];
        while (j < end && ts[j].type !== 'table_close') {
          const tok = ts[j];
          if (tok.type === 'th_open' || tok.type === 'td_open') {
            const inline = ts[j + 1];
            row.push(segsToString(renderInline(rctx.theme, inline.children ?? [], [])));
            j += 2;
            if (j < end && (ts[j].type === 'th_close' || ts[j].type === 'td_close')) j++;
          } else if (tok.type === 'tr_close') {
            out.push(row.map((cell) => ({ text: cell, sgr: null })));
            row = [];
            j++;
          } else {
            j++; // thead_open/tbody_open and anything else
          }
        }
        i = j + 1;
        break;
      }
      case 'inline': {
        // standalone block-level inline (e.g. inside list items)
        out.push(...splitAtBr(renderInline(rctx.theme, t.children ?? [], [])));
        i++;
        break;
      }
      case 'html_block':
        i++;
        break;
      default: {
        // closes, unknown; list_item_open/list_item_close pass through
        if (t.content) {
          for (const line of t.content.split('\n')) {
            out.push([{ text: line, sgr: null }]);
          }
        }
        i++;
        break;
      }
    }
  }
}

function splitAtBr(segs: Seg[]): Seg[][] {
  const chunks: Seg[][] = [];
  let cur: Seg[] = [];
  for (const s of segs) {
    if (s.br) {
      chunks.push(cur);
      cur = [];
    } else {
      cur.push(s);
    }
  }
  chunks.push(cur);
  return chunks;
}

export function renderTokens(tokens: Token[], rctx: RenderCtx): { lines: RenderedLine[] } {
  const out: Seg[][] = [];
  walk(tokens, 0, tokens.length, rctx, out);
  return { lines: out.map((segs) => ({ text: segsToString(segs), links: [] })) };
}
