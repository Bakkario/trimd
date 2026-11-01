import { parse as parseYaml, YAMLError } from 'yaml';
import type { FrontmatterMeta, RenderedLine, Theme } from './types.js';
import { paint } from './themes.js';

/** 02 §6: strip a leading `---`/`---` YAML block; meta = null when absent. */
export function extractFrontmatter(text: string): { meta: FrontmatterMeta | null; body: string } {
  if (!text.startsWith('---\n')) return { meta: null, body: text };
  const close = text.indexOf('\n---\n');
  if (close < 0) return { meta: null, body: text };
  const raw = text.slice(4, close + 1);
  let data: unknown = null;
  let valid = true;
  try {
    data = parseYaml(raw);
  } catch (err) {
    if (err instanceof YAMLError) {
      valid = false;
    } else {
      throw err;
    }
  }
  if (valid && (typeof data !== 'object' || data === null || Array.isArray(data))) {
    valid = false;
    data = null;
  }
  return { meta: { raw, data: data as Record<string, unknown> | null, valid }, body: text.slice(close + 5) };
}

function fmtValue(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x))).join(', ');
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}

/**
 * 02 §6 (ISSUE-009): meta block per slot — label line → `metaLabel`,
 * key + `: ` separator → `metaKey`, value → `metaValue`; tags → `tag`.
 * Invalid YAML → single `metaValue` line of the raw text.
 */
export function renderMeta(meta: FrontmatterMeta, theme: Theme): RenderedLine[] {
  if (!meta.valid) return [{ text: paint(theme, 'metaValue', meta.raw), links: [] }];
  const out: RenderedLine[] = [{ text: paint(theme, 'metaLabel', '── metadata ──'), links: [] }];
  const data = meta.data as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    out.push({ text: paint(theme, 'metaKey', key + ': ') + paint(theme, 'metaValue', fmtValue(data[key])), links: [] });
  }
  const tags = data['tags'];
  if (Array.isArray(tags)) {
    out.push({ text: tags.map((t) => paint(theme, 'tag', '#' + String(t))).join(' '), links: [] });
  }
  return out;
}

/**
 * 02 §6 / D-3.3 (Task 7.4, ADR-027): compact 1-2 line summary header
 * Badge pill ` <TYPE> `, date, up to 2 scalar keys, `#tag` chips, and right-aligned dim `[m] yaml`.
 */
export function renderMetaCompact(meta: FrontmatterMeta, theme: Theme, width: number): RenderedLine[] {
  if (!meta.valid || !meta.data) return renderMeta(meta, theme);

  const data = meta.data as Record<string, unknown>;
  const parts: string[] = [];
  let visLen = 0;

  // 1. Type / Status badge pill
  const rawType = data['type'] ?? data['status'];
  if (rawType !== undefined && rawType !== null && rawType !== '') {
    const typeStr = ' ' + String(rawType).toUpperCase() + ' ';
    parts.push(paint(theme, 'accentPill', typeStr));
    visLen += typeStr.length;
  }

  // 2. Date
  const rawDate = data['updated'] ?? data['date'] ?? data['created'];
  if (rawDate !== undefined && rawDate !== null && rawDate !== '') {
    const dateStr = String(rawDate);
    if (parts.length > 0) {
      parts.push(' ');
      visLen += 1;
    }
    parts.push(paint(theme, 'metaValue', dateStr));
    visLen += dateStr.length;
  }

  // 3. Up to 2 remaining scalar keys
  const skipKeys = new Set(['title', 'type', 'status', 'updated', 'date', 'created', 'tags']);
  let scalarCount = 0;
  for (const key of Object.keys(data)) {
    if (skipKeys.has(key)) continue;
    const v = data[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue; // only scalars
    if (scalarCount >= 2) break;

    const sep = parts.length > 0 ? ' · ' : '';
    if (sep) {
      parts.push(paint(theme, 'dim', sep));
      visLen += sep.length;
    }
    const kStr = key + ': ';
    const vStr = String(v);
    parts.push(paint(theme, 'metaKey', kStr) + paint(theme, 'metaValue', vStr));
    visLen += kStr.length + vStr.length;
    scalarCount++;
  }

  // 4. #tag chips in tagChip
  const tags = data['tags'];
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (t === null || t === undefined || t === '') continue;
      const tagStr = ' #' + String(t) + ' ';
      if (parts.length > 0) {
        parts.push(' ');
        visLen += 1;
      }
      parts.push(paint(theme, 'tagChip', tagStr));
      visLen += tagStr.length;
    }
  }

  // 5. Right-aligned dim `[m] yaml`
  const hintStr = '[m] yaml';
  const hintStyled = paint(theme, 'dim', hintStr);
  const gap = width - visLen - hintStr.length;

  if (gap >= 2) {
    // Fits on one line
    const lineText = parts.join('') + ' '.repeat(gap) + hintStyled;
    return [{ text: lineText, links: [] }];
  }

  // Otherwise 2 lines: content on line 0, right-aligned hint on line 1
  const line0 = parts.join('');
  const line1Gap = Math.max(0, width - hintStr.length);
  const line1 = ' '.repeat(line1Gap) + hintStyled;
  return [
    { text: line0, links: [] },
    { text: line1, links: [] },
  ];
}
