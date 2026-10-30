// 02 §8 — renderer conventions (task 1.6: lists + fences + tables implemented; remaining INTERIM: blockquote prefix (1.7), links (1.7))

import type { Token } from 'markdown-it';
import { existsSync } from 'node:fs';
import type { LinkSpan, RenderedLine, Theme, ThemeColors } from './types.js';
import { parseCallout } from './callouts.js';
import { fenceLabelLang, highlightCode } from './highlight.js';

export interface RenderCtx {
  theme: Theme;
  width: number;
  sourceDir: string;
  resolve: (t: string) => string | null;
}

// One styled run. sgr = SGR parameter string (e.g. '1;38;5;255'), null = no escape.
// br marks a hard-break (new logical line); link marks an OSC 8 span (02 §7).
type LinkKind = 'file' | 'http' | 'wikilink' | 'embed';
interface LinkInfo { href: string; kind: LinkKind; target?: string; resolved?: boolean; }
interface Seg { text: string; sgr: string | null; br?: boolean; link?: LinkInfo | null; }

// INV-2.4 — callout type → theme color key (unknown → NOTE styling).
const CO_KEYS: Record<string, keyof ThemeColors> = {
  NOTE: 'calloutNote',
  TIP: 'calloutTip',
  INFO: 'calloutInfo',
  SUCCESS: 'calloutSuccess',
  QUESTION: 'calloutQuestion',
  WARNING: 'calloutWarning',
  DANGER: 'calloutDanger',
};

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
  return segs
    .map((s) => {
      const body = s.sgr ? '\x1b[' + s.sgr + 'm' + s.text + '\x1b[0m' : s.text;
      if (!s.link) return body;
      // 02 §7 — exact OSC 8 bytes: open before the SGR, close after the reset
      const local = s.link.kind === 'file' || s.link.kind === 'wikilink' || s.link.kind === 'embed';
      const url = local ? 'file://' + s.link.href : s.link.href;
      return '\x1b]8;url=' + url + '\x1b\\' + body + '\x1b]8;;\x1b\\';
    })
    .join('');
}

// 02 §8 — visible width: strip SGR and OSC 8 sequences (exact regexes), then count.
export function visibleWidth(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;[^\]]*\\/g, '').length;
}

function segsVisible(segs: Seg[]): number {
  return segs.reduce((a, s) => a + visibleWidth(s.text), 0);
}

// 02 §8 — wrap styled segs to visible width `w` (greedy word wrap; over-long
// words hard-broken; `br` segs force a new line). Style (SGR + link info)
// stays attached to its characters: a link split across lines keeps its
// LinkInfo on every fragment, so segsToString emits a full OSC 8 pair per
// fragment and lineSpans builds a span per fragment.
function wrapCellSegs(segs: Seg[], width: number): Seg[][] {
  const w = Math.max(1, width);
  type C = { ch: string; seg: Seg };
  // toks: { word: C[] } or { word: null } (forced line break)
  const toks: { word: C[] | null }[] = [];
  let cur: C[] = [];
  const flush = (): void => {
    if (cur.length > 0) toks.push({ word: cur });
    cur = [];
  };
  for (const s of segs) {
    if (s.br) {
      flush();
      toks.push({ word: null });
      continue;
    }
    for (const ch of s.text) {
      if (ch === ' ') flush();
      else cur.push({ ch, seg: s });
    }
  }
  flush();
  const lines: Seg[][] = [];
  let line: Seg[] = [];
  let used = 0;
  const newline = (): void => {
    if (line.length === 0 && lines.length > 0) return;
    lines.push(line);
    line = [];
    used = 0;
  };
  const appendChar = (ch: string, seg: Seg): void => {
    const last = line[line.length - 1];
    if (last && !last.br && last.sgr === seg.sgr && !!last.link === !!seg.link) last.text += ch;
    else line.push({ text: ch, sgr: seg.sgr, link: seg.link ?? null });
  };
  const appendWord = (cs: C[]): void => {
    for (const c of cs) appendChar(c.ch, c.seg);
    used += cs.length;
  };
  const hardBreak = (cs: C[]): void => {
    let rest = cs;
    while (rest.length > 0) {
      if (used > 0) newline();
      appendWord(rest.slice(0, w));
      rest = rest.slice(w);
    }
  };
  for (const tok of toks) {
    if (tok.word === null) {
      newline();
      continue;
    }
    const cs = tok.word;
    if (used === 0 ? cs.length <= w : used + 1 + cs.length <= w) {
      if (used > 0) {
        line.push({ text: ' ', sgr: null });
        used += 1;
      }
      appendWord(cs);
    } else {
      if (line.length > 0) newline();
      if (cs.length <= w) appendWord(cs);
      else hardBreak(cs);
    }
  }
  if (line.length > 0) newline();
  return lines;
}

// 02 §7 / INV-1.7 — classify a markdown link href.
//   http(s):               → link color, span kind 'http', OSC 8 url = href
//   #anchor:               → dim, no span, no warning (anchor-only)
//   local + resolved +     → link color, span kind 'file' (href = abs path),
//     existsSync                 OSC 8 url = 'file://' + abs
//   local + unresolved/missing → dim text + ' ⚠', no span, no OSC 8
function linkInfo(rctx: RenderCtx, href: string): { sgr: string | null; span: LinkInfo | null; warn: boolean } {
  const theme = rctx.theme;
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return { sgr: theme.colors.link || null, span: { href, kind: 'http', resolved: true }, warn: false };
  }
  if (href.startsWith('#')) {
    return { sgr: theme.colors.dim || null, span: null, warn: false };
  }
  const abs = rctx.resolve(href);
  if (abs === null || !existsSync(abs)) {
    return { sgr: theme.colors.dim || null, span: null, warn: true };
  }
  return { sgr: theme.colors.link || null, span: { href: abs, kind: 'file', resolved: true }, warn: false };
}

function renderInline(rctx: RenderCtx, children: Token[], base: string[]): Seg[] {
  const theme = rctx.theme;
  const stack = [...base];
  const out: Seg[] = [];
  let link: LinkInfo | null = null;
  let linkSgr: string | null = null;
  let linkWarn = false;
  for (const c of children) {
    switch (c.type) {
      case 'text':
        if (c.content) out.push({ text: c.content, sgr: join(stack), link });
        break;
      case 'softbreak':
        out.push({ text: ' ', sgr: join(stack), link });
        break;
      case 'hardbreak':
        out.push({ text: '', sgr: null, br: true });
        break;
      case 'code_inline':
        out.push({ text: c.content, sgr: c.content ? theme.colors.inlineCode || null : null, link });
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
      case 'link_open': {
        const href = String((c.attrs ?? []).find((a) => a[0] === 'href')?.[1] ?? '');
        const li = linkInfo(rctx, href);
        link = li.span;
        linkSgr = li.sgr;
        linkWarn = li.warn;
        if (linkSgr !== null) stack.push(linkSgr);
        break;
      }
      case 'link_close': {
        if (linkSgr !== null) stack.pop();
        if (linkWarn) out.push({ text: ' \u26a0', sgr: theme.colors.dim || null });
        link = null;
        linkSgr = null;
        linkWarn = false;
        break;
      }
      case 'tag': {
        // INV-2.3 — content includes the leading #
        out.push({ text: c.content, sgr: theme.colors.tag || null });
        break;
      }
      case 'embed': {
        // INV-2.6 — dim ▸ note: label; resolved → clickable, else dim ⚠
        const meta = c.meta as { target: string; label: string } | undefined;
        const target = (meta?.target ?? c.content ?? '').split('#')[0];
        const label = meta?.label ?? c.content ?? target;
        const abs = target === '' ? null : rctx.resolve(target);
        if (abs !== null && existsSync(abs)) {
          out.push({ text: '\u25b8 note: ' + label, sgr: theme.colors.dim || null, link: { href: abs, kind: 'embed', target, resolved: true } });
        } else {
          out.push({ text: '\u25b8 note: ' + label, sgr: theme.colors.dim || null });
          out.push({ text: ' \u26a0', sgr: theme.colors.dim || null });
        }
        break;
      }
      case 'wikilink': {
        // INV-2.1/2.2 — `#heading` stripped for resolution and display
        const meta = c.meta as { target: string; label: string } | undefined;
        const target = (meta?.target ?? c.content ?? '').split('#')[0];
        const display = (meta?.label ?? c.content ?? '').split('#')[0];
        const abs = target === '' ? null : rctx.resolve(target);
        if (abs !== null && existsSync(abs)) {
          out.push({ text: display, sgr: theme.colors.link || null, link: { href: abs, kind: 'wikilink', target, resolved: true } });
        } else {
          out.push({ text: display, sgr: theme.colors.dim || null });
          out.push({ text: ' \u26a0', sgr: theme.colors.dim || null });
        }
        break;
      }
      case 'image': {
        // INV-1.8 placeholder
        // c.content holds the alt text; the src URL lives in the 'src' attr
        const alt = (c.children ?? []).filter((x) => x.type === 'text').map((x) => x.content).join('');
        const src = (c.attrs ?? []).find((a) => a[0] === 'src')?.[1] ?? '';
        out.push({ text: '[image: ' + alt + ' → ' + src + ']', sgr: theme.colors.dim || null });
        break;
      }
      case 'html_inline':
        // task-lists plugin checkbox — rendered from list_item meta instead
        break;
      default:
        if (c.content) out.push({ text: c.content, sgr: null });
        break;
    }
  }
  return out;
}

// Renders the single non-list block starting at ts[i] (paragraph_open, hr, fence,
// blockquote_open, standalone inline, html_block, or default). Pushes its line(s)
// into out and returns the index after the block.
function renderOneBlock(ts: Token[], i: number, end: number, rctx: RenderCtx, out: Seg[][]): number {
  const t = ts[i];
  switch (t.type) {
    case 'paragraph_open': {
      const inline = ts[i + 1];
      out.push(...splitAtBr(renderInline(rctx, inline.children ?? [], [])));
      let j = i + 2;
      while (j < end && ts[j].type !== 'paragraph_close') j++;
      return j + 1;
    }
    case 'hr':
      out.push([{ text: '─'.repeat(30), sgr: rctx.theme.colors.hr || null }]);
      return i + 1;
    case 'fence': {
      // 02 §8 / INV-1.3 — dim codeLabel line, then highlighted code as-is (no wrap)
      const labelLang = fenceLabelLang(t.info);
      const labelPrefix = '── ' + labelLang + ' ';
      const label = labelPrefix + '─'.repeat(Math.max(0, rctx.width - labelPrefix.length));
      out.push([{ text: label, sgr: rctx.theme.colors.codeLabel || null }]);
      // fence token content carries a trailing newline (markdown-it) — not a code line
      const code = t.content.endsWith('\n') ? t.content.slice(0, -1) : t.content;
      const codeStr = highlightCode(code, labelLang === 'code' || labelLang === 'math' ? null : labelLang);
      for (const line of codeStr.split('\n')) {
        out.push([{ text: line, sgr: null }]);
      }
      return i + 1;
    }
    case 'blockquote_open': {
      // INV-1.6 — '│ ' prefix (quote color) on every inner line; nested
      // blockquotes add their own prefix, so nesting yields '│ │ '
      // INV-2.4 — first child paragraph starting `[!TYPE] Title` → callout:
      // border in type color, bold `TYPE — Title`, body indented 2 spaces
      const inner: Seg[][] = [];
      let depth = 1;
      let j = i + 1;
      while (j < end && depth > 0) {
        if (ts[j].type === 'blockquote_open') depth++;
        else if (ts[j].type === 'blockquote_close') depth--;
        j++;
      }
      const co =
        ts[i + 1].type === 'paragraph_open'
          ? parseCallout((ts[i + 2].content ?? '').split('\n')[0])
          : null;
      if (co !== null) {
        // INV-2.4 — border in type color; first paragraph's first line is the
        // marker (dropped); its remaining children become the first body line(s)
        const key: keyof ThemeColors = CO_KEYS[co.type] ?? 'calloutNote';
        const border = rctx.theme.colors[key] || null;
        const boldBorder = border ? '1;' + border : '1';
        const titleSegs: Seg[] = [
          { text: '│ ', sgr: border },
          { text: co.type, sgr: boldBorder },
          { text: ' — ', sgr: null },
          { text: co.title ?? '', sgr: emphSgr(rctx.theme, 'bold') },
        ];
        const kids = ts[i + 2].children ?? [];
        const m = kids.findIndex((c) => c.type === 'softbreak' || c.type === 'hardbreak');
        const firstBody: Seg[][] = m >= 0 ? splitAtBr(renderInline(rctx, kids.slice(m + 1), [])) : [];
        const inner: Seg[][] = [];
        walk(ts, i + 4, j - 1, rctx, inner, 0);
        inner.unshift(...firstBody);
        if (co.title !== null) inner.unshift(titleSegs);
        else if (inner.length === 0) inner.push([]);
        for (let k = 0; k < inner.length; k++) {
          if (co.title === null || k > 0) {
            inner[k] = [{ text: '│ ', sgr: border }, { text: '  ', sgr: null }, ...inner[k]];
          }
          out.push(inner[k]);
        }
      } else {
        const inner: Seg[][] = [];
        walk(ts, i + 1, j - 1, rctx, inner, 0);
        for (const l of inner) out.push([{ text: '│ ', sgr: rctx.theme.colors.quote || null }, ...l]);
      }
      return j;
    }
    case 'table_open': {
      // 02 §8 / INV-1.5 — bold tableHead header, tableBorder ─ separator,
      // columns sized to the pane (shrink widest until Σw + gaps ≤ width,
      // floor 4), cells wrap within their column, 1-space padding, no pipes
      const headSgr = rctx.theme.colors.tableHead ? '1;' + rctx.theme.colors.tableHead : '1';
      const rows: { header: boolean; cells: Seg[][] }[] = [];
      let j = i + 1;
      let cells: Seg[][] = [];
      let inHead = false;
      while (j < end && ts[j].type !== 'table_close') {
        const tok = ts[j];
        if (tok.type === 'thead_open') {
          inHead = true;
          j++;
        } else if (tok.type === 'thead_close') {
          inHead = false;
          j++;
        } else if (tok.type === 'th_open' || tok.type === 'td_open') {
          const inline = ts[j + 1];
          cells.push(renderInline(rctx, inline.children ?? [], inHead ? [headSgr] : []));
          j += 2;
          if (j < end && (ts[j].type === 'th_close' || ts[j].type === 'td_close')) j++;
        } else if (tok.type === 'tr_close') {
          rows.push({ header: inHead, cells });
          cells = [];
          j++;
        } else {
          j++; // tbody_open and anything else
        }
      }
      const cols = rows.reduce((m, r) => Math.max(m, r.cells.length), 0);
      const widths: number[] = new Array(cols).fill(0);
      for (const r of rows) {
        for (let c = 0; c < r.cells.length; c++) {
          widths[c] = Math.max(widths[c], segsVisible(r.cells[c]));
        }
      }
      // Fit the table to the pane: shrink the widest columns (floor 4)
      // until Σ widths + (cols − 1) inter-column gaps ≤ rctx.width.
      const MIN_W = 4;
      let total = widths.reduce((a, w) => a + w, 0) + Math.max(0, cols - 1);
      while (total > rctx.width) {
        let mi = -1;
        for (let c = 0; c < cols; c++) {
          if (widths[c] > MIN_W && (mi === -1 || widths[c] > widths[mi])) mi = c;
        }
        if (mi === -1) break;
        widths[mi]--;
        total--;
      }
      const wrapped = rows.map((r) =>
        r.cells.map((cell, c) => wrapCellSegs(cell, c < cols ? widths[c] : 0)),
      );
      for (let ri = 0; ri < rows.length; ri++) {
        const r = rows[ri];
        const h = Math.max(1, ...wrapped[ri].map((cl) => cl.length));
        for (let k = 0; k < h; k++) {
          const line: Seg[] = [];
          for (let c = 0; c < cols; c++) {
            if (c > 0) line.push({ text: ' ', sgr: null });
            const cellSegs = wrapped[ri][c] ? (wrapped[ri][c][k] ?? []) : [];
            line.push(...cellSegs);
            if (c < cols - 1) {
              const pad = widths[c] - segsVisible(cellSegs);
              if (pad > 0) line.push({ text: ' '.repeat(pad), sgr: null });
            }
          }
          out.push(line);
        }
        if (r.header) {
          out.push([{ text: widths.map((w) => '─'.repeat(w)).join(' '), sgr: rctx.theme.colors.tableBorder || null }]);
        }
      }
      return j + 1;
    }
    case 'inline': {
      // standalone block-level inline (e.g. inside list items)
      out.push(...splitAtBr(renderInline(rctx, t.children ?? [], [])));
      return i + 1;
    }
    case 'html_block':
      return i + 1;
    default: {
      // closes, unknown; list_item_open/list_item_close pass through
      if (t.content) {
        for (const line of t.content.split('\n')) {
          out.push([{ text: line, sgr: null }]);
        }
      }
      return i + 1;
    }
  }
}

function walk(ts: Token[], i: number, end: number, rctx: RenderCtx, out: Seg[][], listLevel: number): void {
  while (i < end) {
    const t = ts[i];
    switch (t.type) {
      case 'heading_open': {
        const level = t.markup.length;
        const inline = ts[i + 1];
        const hs = headingSgr(rctx.theme, level);
        const base = hs !== null ? [hs] : [];
        out.push(renderInline(rctx, inline.children ?? [], base));
        // advance past heading_close
        let j = i + 2;
        while (j < end && ts[j].type !== 'heading_close') j++;
        i = j + 1;
        break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const closeType = t.type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close';
        let depth = 1;
        let j = i + 1;
        while (j < end && depth > 0) {
          if (ts[j].type === t.type) depth++;
          else if (ts[j].type === closeType) depth--;
          j++;
        }
        walkList(ts, i + 1, j, rctx, out, listLevel + 1, t.type === 'bullet_list_open' ? 'bullet' : 'ordered');
        i = j + 1;
        break;
      }
      default:
        i = renderOneBlock(ts, i, end, rctx, out);
        break;
    }
  }
}

function listVisibleLen(marker: Seg[]): number {
  return marker.reduce((sum, s) => sum + s.text.length, 0);
}

function listMarkerSegs(rctx: RenderCtx, kind: 'bullet' | 'ordered', n: number, meta: { task?: boolean; checked?: boolean } | null | undefined): Seg[] {
  const dim = rctx.theme.colors.dim || null;
  if (meta?.task) {
    if (meta.checked) {
      const success = rctx.theme.colors.success || null;
      return [
        { text: '[', sgr: dim },
        { text: 'x', sgr: success },
        { text: ']', sgr: dim },
      ];
    }
    return [
      { text: '[', sgr: dim },
      { text: ' ', sgr: dim },
      { text: ']', sgr: dim },
    ];
  }
  if (kind === 'ordered') return [{ text: String(n) + '.', sgr: dim }];
  return [{ text: '•', sgr: dim }];
}

// Renders the blocks of one list item (ts[i..end), end = matching list_item_close).
// firstPrefix/continuation alignment: continuation lines get spaces equal to the
// visible length of the marker plus one trailing space.
//
// Nested lists (the markdown-it task-lists style where a more-indented
// list_item_open sits inside a list block) are rendered "loose": the item's
// first line carries only its own marker, and the inner items follow with the
// inner list's own per-item markers (no bullet prefixing on those lines).
function renderItem(
  ts: Token[],
  i: number,
  end: number,
  rctx: RenderCtx,
  out: Seg[][],
  level: number,
  marker: Seg[],
  taskItem: boolean,
): number {
  const indent = '  '.repeat(level - 1); // level is 1-based: top-level items at column 0
  const firstPrefix: Seg[] = (indent ? [{ text: indent, sgr: null }] : [] as Seg[])
    .concat(marker)
    .concat([{ text: ' ', sgr: null }]);
  const contPrefix: Seg[] = [{ text: ' '.repeat(indent.length + listVisibleLen(marker) + 1), sgr: null }];

  const firstLineIdx = out.length;
  let j = i;
  let first = true;
  while (j < end) {
    const t = ts[j];
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      // nested list inside this item
      const closeType = t.type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close';
      const kind: 'bullet' | 'ordered' = t.type === 'bullet_list_open' ? 'bullet' : 'ordered';
      let depth = 1;
      let k = j + 1;
      while (k < end && depth > 0) {
        if (ts[k].type === t.type) depth++;
        else if (ts[k].type === closeType) depth--;
        k++;
      }
      if (first) {
        out.push([...firstPrefix]); // marker-only line so the item is not blank
        first = false;
      }
      walkList(ts, j + 1, k, rctx, out, level + 1, kind);
      j = k + 1;
    } else {
      const before = out.length;
      j = renderOneBlock(ts, j, end, rctx, out);
      for (let idx = before; idx < out.length; idx++) {
        out[idx] = (idx === before && first ? firstPrefix : contPrefix).concat(out[idx]);
      }
      first = false;
    }
  }

  if (taskItem && out.length > firstLineIdx) {
    // T4: the task-lists plugin leaves one leading space on the item's first text
    // token; strip exactly one so the box's trailing space is the only gap.
    const line = out[firstLineIdx];
    for (let s = firstPrefix.length; s < line.length; s++) {
      const seg = line[s];
      if (seg.text.length === 0) continue;
      if (seg.text.startsWith(' ')) {
        seg.text = seg.text.slice(1);
        if (seg.text.length === 0) line.splice(s, 1);
      }
      break;
    }
  }

  return j;
}

// Walks one list's direct children in [i, end) (end = index of matching *_list_close).
// n = 1-based position within this list (ordered numbering is positional; markdown-it
// leaves it to us).
//
// Nested lists: markdown-it nests a more-indented item inside the outer list block.
// We render "loose": the inner items are rendered at their own level with their own
// per-item markers (the outer item already emitted a marker-only line for itself).
function walkList(
  ts: Token[],
  i: number,
  end: number,
  rctx: RenderCtx,
  out: Seg[][],
  level: number,
  kind: 'bullet' | 'ordered',
): number {
  let n = 0;
  let j = i;
  while (j < end) {
    const t = ts[j];
    if (t.type === 'list_item_open') {
      n++;
      // Find the matching list_item_close (nesting-aware) so renderItem's
      // boundary is this item, not the whole list.
      let d = 1;
      let k = j + 1;
      while (k < end && d > 0) {
        if (ts[k].type === 'list_item_open') d++;
        else if (ts[k].type === 'list_item_close') d--;
        k++;
      }
      const marker = listMarkerSegs(rctx, kind, n, t.meta as { task?: boolean; checked?: boolean } | null | undefined);
      j = renderItem(ts, j + 1, k - 1, rctx, out, level, marker, t.meta?.task === true) + 1;
    } else if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      // nested list block inside this item: render loose at level + 1
      const closeType = t.type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close';
      let depth = 1;
      let k = j + 1;
      while (k < end && depth > 0) {
        if (ts[k].type === t.type) depth++;
        else if (ts[k].type === closeType) depth--;
        k++;
      }
      walkList(ts, j + 1, k, rctx, out, level + 1, t.type === 'bullet_list_open' ? 'bullet' : 'ordered');
      j = k + 1;
    } else {
      j++;
    }
  }
  return j;
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

// INV-1.7 — columns exactly cover the visible link text (ANSI stripped);
// consecutive segs of one link group into one span.
function lineSpans(segs: Seg[], line: number): LinkSpan[] {
  const spans: LinkSpan[] = [];
  let col = 0;
  let start: number | null = null;
  let cur: LinkInfo | null = null;
  const flush = (end: number): void => {
    if (cur === null || start === null) return;
    const span: LinkSpan = { line, startCol: start, endCol: end, href: cur.href, kind: cur.kind };
    if (cur.target !== undefined) span.target = cur.target;
    if (cur.resolved !== undefined) span.resolved = cur.resolved;
    spans.push(span);
    cur = null;
    start = null;
  };
  for (const s of segs) {
    if (s.link) {
      if (cur === null) {
        cur = s.link;
        start = col;
      }
    } else {
      flush(col);
    }
    col += visibleWidth(s.text);
  }
  flush(col);
  return spans;
}

export function renderTokens(tokens: Token[], rctx: RenderCtx): { lines: RenderedLine[] } {
  const out: Seg[][] = [];
  walk(tokens, 0, tokens.length, rctx, out, 0);
  const lines: RenderedLine[] = out.map((segs, line) => ({ text: segsToString(segs), links: lineSpans(segs, line) }));
  return { lines };
}

// ── Wrap (task 1.8) — 02 §8 / INV-1.10 ────────────────────────────────────
// Greedy word wrap on visible text. ANSI segments stay attached to their
// characters: the SGR (and OSC 8 span) is re-emitted on every physical
// fragment. A LinkSpan crossing a wrap is split — each physical fragment
// gets its own span (same href/kind, remapped line/startCol/endCol).

interface WTok { text: string; sgr: string | null; url: string | null; }

// SGR parameter bookkeeping for parseLineText. Only the codes chalk (the
// cli-highlight backend) and paint() actually emit are modelled:
// 0/22/23/24/29 turn attributes off, 39/49 reset fg/bg color, 3x/9x/38;…
// and 4x/10x/48;… set color, everything else is tracked as a bare on-code.
const SGR_FG = /^(3[0-7]|9[0-7])$/;
const SGR_BG = /^(4[0-7]|10[0-7])$/;
function applySgr(open: string[], p: string): void {
  const isFg = (o: string): boolean => SGR_FG.test(o) || o.startsWith('38;');
  const isBg = (o: string): boolean => SGR_BG.test(o) || o.startsWith('48;');
  const drop = (pred: (o: string) => boolean): void => {
    for (let j = open.length - 1; j >= 0; j--) if (pred(open[j])) open.splice(j, 1);
  };
  if (p === '0') open.length = 0;
  else if (p === '22') drop((o) => o === '1' || o === '2');
  else if (p === '23') drop((o) => o === '3');
  else if (p === '24') drop((o) => o === '4');
  else if (p === '29') drop((o) => o === '9');
  else if (p === '39') drop(isFg);
  else if (p === '49') drop(isBg);
  else if (SGR_FG.test(p)) { drop(isFg); open.push(p); }
  else if (SGR_BG.test(p)) { drop(isBg); open.push(p); }
  else open.push(p);
}

// Inverse of segsToString: tokenizes a rendered line's text into
// (content, sgr, osc-url) segments. Plain runs, SGR-styled runs, and OSC 8
// spans (optionally wrapping a styled run) are the only forms produced.
// An SGR opens a style for the content that follows; the run ends at the
// next escape. The close form is NOT assumed to be \x1b[0m:
// cli-highlight/chalk emits per-code resets (\x1b[39m, \x1b[22m, …) and
// compound opens (\x1b[2m\x1b[36m) merge into one run. wrapLines re-emits
// every run in the normalized \x1b[…m…\x1b[0m form, so the reset code is
// irrelevant here.
function parseLineText(text: string): WTok[] {
  const out: WTok[] = [];
  const open: string[] = [];
  let i = 0;
  let runStart = 0;
  const flush = (at: number): void => {
    if (at > runStart) out.push({ text: text.slice(runStart, at), sgr: open.length > 0 ? open.join(';') : null, url: null });
    runStart = at;
  };
  while (i < text.length) {
    if (text[i] !== '\x1b') { i++; continue; }
    flush(i);
    if (text[i + 1] === '[') {
      const m = text.indexOf('m', i + 2);
      if (m === -1) { i++; continue; } // malformed SGR (no 'm'); treat as plain
      const params = text.slice(i + 2, m).split(';');
      for (let k = 0; k < params.length; k++) {
        const p = params[k];
        if (p === '38' || p === '48') {
          const ext = p + ';' + (params[k + 1] ?? '') + ';' + (params[k + 2] ?? '');
          k += 2;
          if (p === '38') { for (let j = open.length - 1; j >= 0; j--) if (open[j].startsWith('38;')) open.splice(j, 1); }
          else { for (let j = open.length - 1; j >= 0; j--) if (open[j].startsWith('48;')) open.splice(j, 1); }
          open.push(ext);
        } else applySgr(open, p);
      }
      i = m + 1;
      runStart = m + 1;
    } else {
      const c1 = text.indexOf('\x1b\\', i);
      const c2 = text.indexOf('\x1b]8;;\x1b\\', c1 + 2);
      const content = text.slice(c1 + 2, c2);
      let sgr: string | null = null;
      let body = content;
      if (content.startsWith('\x1b[') && content.endsWith('\x1b[0m')) {
        const m2 = content.indexOf('m', 2);
        sgr = content.slice(2, m2);
        body = content.slice(m2 + 1, content.length - 4); // reset is 4 chars
      }
      out.push({ text: body, sgr, url: text.slice(i + 8, c1) });
      i = c2 + 7;
      runStart = i;
    }
  }
  flush(text.length);
  return out;
}
export function wrapLines(lines: RenderedLine[], width: number): RenderedLine[] {
  const out: RenderedLine[] = [];
  for (const line of lines) {
    // 02 §8 — a line that fits passes through unchanged (text and spans,
    // leading/trailing whitespace included) — e.g. table continuation lines
    // and indented fence lines.
    if (visibleWidth(line.text) <= width) {
      out.push(line);
      continue;
    }
    const toks = parseLineText(line.text);
    const spanAt = (col: number): LinkSpan | undefined =>
      line.links.find((s) => s.startCol <= col && col < s.endCol);
    const units: { text: string; tok: WTok; oldCol: number }[] = [];
    {
      let col = 0;
      for (const tok of toks) {
        let k = 0;
        while (k < tok.text.length) {
          const space = tok.text[k] === ' ';
          let e = k;
          while (e < tok.text.length && (tok.text[e] === ' ') === space) e++;
          units.push({ text: tok.text.slice(k, e), tok, oldCol: col + k });
          k = e;
        }
        col += tok.text.length;
      }
    }
    const entries: { word: string; tok: WTok; oldCol: number; trail: string; trailTok: WTok | null }[] = [];
    let u = 0;
    while (u < units.length) {
      while (u < units.length && units[u].text.trim() === '') u++;
      if (u >= units.length) break;
      const wu = units[u];
      const ent: { word: string; tok: WTok; oldCol: number; trail: string; trailTok: WTok | null } = { word: wu.text, tok: wu.tok, oldCol: wu.oldCol, trail: '', trailTok: null };
      entries.push(ent);
      u++;
      while (u < units.length && units[u].text.trim() === '') {
        ent.trail += units[u].text;
        ent.trailTok = units[u].tok;
        u++;
      }
    }
    interface Frag { text: string; tok: WTok; oldCol: number; newCol: number; }
    const physLines: Frag[][] = [];
    let cur: Frag[] = [];
    let curW = 0;
    const pushLine = (): void => {
      if (cur.length) { physLines.push(cur); cur = []; curW = 0; }
    };
    const emitWord = (ent: { word: string; tok: WTok; oldCol: number }): void => {
      let pos = 0;
      while (pos < ent.word.length) {
        if (curW >= width) pushLine();
        const take = Math.min(width - curW, ent.word.length - pos);
        cur.push({ text: ent.word.slice(pos, pos + take), tok: ent.tok, oldCol: ent.oldCol + pos, newCol: curW });
        curW += take;
        pos += take;
      }
    };
    for (let e = 0; e < entries.length; e++) {
      const ent = entries[e];
      let sp = '';
      let spTok: WTok | null = null;
      if (e > 0) { sp = entries[e - 1].trail; spTok = entries[e - 1].trailTok; }
      if (cur.length === 0 || curW + sp.length + ent.word.length > width) {
        pushLine();
        emitWord(ent);
      } else {
        if (sp.length) cur.push({ text: sp, tok: spTok ?? ent.tok, oldCol: ent.oldCol - sp.length, newCol: curW });
        curW += sp.length;
        emitWord(ent);
      }
    }
    pushLine();
    if (physLines.length === 0) physLines.push([]);
    for (let pi = 0; pi < physLines.length; pi++) {
      const frs = physLines[pi];
      let text = '';
      const links: LinkSpan[] = [];
      let col = 0;
      let runStart = -1;
      let runEnd = 0;
      let runSpan: LinkSpan | null = null;
      const flushRun = (): void => {
        if (runSpan !== null) {
          const s: LinkSpan = { line: pi, startCol: runStart, endCol: runEnd, href: runSpan.href, kind: runSpan.kind };
          if (runSpan.target !== undefined) s.target = runSpan.target;
          if (runSpan.resolved !== undefined) s.resolved = runSpan.resolved;
          links.push(s);
        }
        runSpan = null;
        runStart = -1;
      };
      for (const f of frs) {
        if (f.tok.url !== null) {
          text +=
            '\x1b]8;url=' + f.tok.url + '\x1b\\' +
            (f.tok.sgr ? '\x1b[' + f.tok.sgr + 'm' : '') +
            f.text +
            (f.tok.sgr ? '\x1b[0m' : '') +
            '\x1b]8;;\x1b\\';
          const s = spanAt(f.oldCol);
          if (runSpan !== null && s === runSpan) {
            runEnd = col + f.text.length;
          } else {
            flushRun();
            if (s !== undefined) {
              runSpan = s;
              runStart = col;
              runEnd = col + f.text.length;
            }
          }
        } else {
          text += f.tok.sgr ? '\x1b[' + f.tok.sgr + 'm' + f.text + '\x1b[0m' : f.text;
          flushRun();
        }
        col += f.text.length;
      }
      flushRun();
      out.push({ text, links });
    }
  }
  return out;
}
