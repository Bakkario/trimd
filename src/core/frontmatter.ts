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
