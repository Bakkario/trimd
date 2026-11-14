import { readFileSync } from 'node:fs';
import type { Token } from 'markdown-it';
import { basename, dirname } from 'node:path';
import type { FrontmatterMeta, RenderedDoc, Theme } from './types.js';
import { FileError, FileMissingError } from './types.js';
import { extractFrontmatter, renderMeta, renderMetaCompact } from './frontmatter.js';
import { parseTokens } from './parse.js';
import { renderTokens, visibleWidth, wrapLines, type RenderCtx } from './renderer.js';
import { buildBacklinkIndex, buildIndex, makeResolver, type RootIndex } from './resolve.js';
import { paint } from './themes.js';

// 02 §5 — exact pipeline: read → frontmatter → parse → render → wrap → meta → title → warnings.

export interface PipelineCtx {
  root: string; // absolute
  width: number; // effective render width (already minus sidebar)
  theme: Theme;
  showFrontmatter: boolean;
  showHidden?: boolean;
  metaExpanded?: boolean; // Phase 3 (Task 7.4, ADR-027): false (default) = compact strip, true = full YAML
  gfx?: 'kitty' | 'halfblock' | 'unicode' | 'none';
}

let indexRoot: string | null = null;
let indexHidden: boolean = false;
let index: RootIndex | null = null;

function getRootIndex(ctx: PipelineCtx): RootIndex {
  const showHidden = ctx.showHidden ?? false;
  if (index === null || indexRoot !== ctx.root || indexHidden !== showHidden) {
    index = buildIndex(ctx.root, showHidden);
    indexRoot = ctx.root;
    indexHidden = showHidden;
  }
  return index;
}

function getResolver(ctx: PipelineCtx): (t: string) => string | null {
  return makeResolver(getRootIndex(ctx));
}

const SGR_RE = /\x1b\[[0-9;]*m/g;
const OSC_RE = /\x1b\]8;[^\]]*\\/g;

function visible(s: string): string {
  return s.replace(SGR_RE, '').replace(OSC_RE, '');
}

function titleOf(meta: FrontmatterMeta | null, tokens: Token[], abs: string): string {
  if (meta !== null && meta.valid) {
    const t = (meta.data as Record<string, unknown> | null)?.['title'];
    if (typeof t === 'string' && t !== '') return t;
  }
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open' && tokens[i].markup.length === 1) {
      const inline = tokens[i + 1];
      const v = (inline.children ?? [])
        .filter((c) => c.type === 'text' || c.type === 'code_inline')
        .map((c) => c.content)
        .join('');
      if (v.trim() !== '') return v.trim();
      break;
    }
  }
  const b = basename(abs);
  const dot = b.lastIndexOf('.');
  return dot > 0 ? b.slice(0, dot) : b;
}

export function renderFile(abs: string, ctx: PipelineCtx): RenderedDoc {
  let text: string;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FileMissingError('file not found: ' + abs);
    }
    throw new FileError('cannot read ' + abs + ': ' + (err as Error).message);
  }
  const { meta, body } = extractFrontmatter(text);
  const tokens = parseTokens(body);
  const rctx: RenderCtx = {
    theme: ctx.theme,
    width: ctx.width,
    sourceDir: dirname(abs),
    resolve: getResolver(ctx),
    gfx: ctx.gfx,
  };
  const { lines, fences, headings } = renderTokens(tokens, rctx);
  const wrapped = wrapLines(lines, ctx.width);
  const outLines: typeof wrapped = [...wrapped];
  let metaLinesCount = 0;
  if (ctx.showFrontmatter && meta) {
    const metaLines = ctx.metaExpanded
      ? renderMeta(meta, ctx.theme)
      : renderMetaCompact(meta, ctx.theme, ctx.width);
    metaLinesCount = metaLines.length;
    outLines.unshift(...metaLines);
  }

  // Phase 3 (Task 9.2, ADR-030) — Read-only Linked Mentions footer
  const rootIdx = getRootIndex(ctx);
  const backlinkMap = buildBacklinkIndex(ctx.root, rootIdx);
  const incoming = backlinkMap.get(abs) ?? [];
  if (incoming.length > 0) {
    // Blank separator rhythm before Linked Mentions section if document has content
    if (outLines.length > 0) {
      outLines.push({ text: '', links: [] });
    }
    const headerText = `── Linked Mentions (${incoming.length}) ──`;
    outLines.push({
      text: paint(ctx.theme, 'dim', headerText),
      links: [],
    });

    // Form links row(s): "  ↩ Note1  ↩ Note2"
    let currentLine = '  ';
    let currentSpans: typeof outLines[0]['links'] = [];
    const currentLineIdx = outLines.length;

    for (let i = 0; i < incoming.length; i++) {
      const srcAbs = incoming[i];
      const noteBase = basename(srcAbs).replace(/\.mdx?$/i, '');
      const label = `↩ ${noteBase}`;
      const styledLabel = paint(ctx.theme, 'link', label);
      // Check if adding exceeds width
      const labelW = visibleWidth(label);
      if (currentSpans.length > 0 && (visibleWidth(currentLine) + labelW + 2) > ctx.width) {
        outLines.push({ text: currentLine, links: currentSpans });
        currentLine = '  ';
        currentSpans = [];
      } else if (currentSpans.length > 0) {
        currentLine += '  ';
      }

      const startCol = visibleWidth(currentLine);
      const osc8 = `\x1b]8;url=file://${srcAbs}\x1b\\${styledLabel}\x1b]8;;\x1b\\`;
      currentLine += osc8;
      const endCol = startCol + labelW;

      currentSpans.push({
        line: outLines.length,
        startCol,
        endCol,
        href: srcAbs,
        kind: 'wikilink',
        resolved: true,
      });
    }

    if (currentSpans.length > 0) {
      outLines.push({ text: currentLine, links: currentSpans });
    }
  }

  const title = titleOf(meta, tokens, abs);
  let n = 0;
  for (const l of outLines) n += (visible(l.text).match(/ \u26a0/g) ?? []).length;
  const warnings: string[] = [];
  if (n > 0) warnings.push(n + ' unresolved links');

  const remappedFences = fences?.map((f) => ({
    ...f,
    line: f.line + metaLinesCount,
    endLine: f.endLine + metaLinesCount,
  }));

  const remappedHeadings = headings?.map((h) => ({
    ...h,
    line: h.line + metaLinesCount,
  }));

  return { lines: outLines, meta, title, warnings, source: abs, fences: remappedFences, headings: remappedHeadings };
}
