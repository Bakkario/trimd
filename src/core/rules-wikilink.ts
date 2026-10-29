import type { MarkdownIt, StateInline } from 'markdown-it';

// 01 §2.2 / INV-2.1 — `[[target]]` / `[[target|label]]` → wikilink token.
const WL_RE = /\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/y;

export function wikilinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('link', 'wikilink', (state: StateInline, silent: boolean): boolean => {
    const start = state.pos;
    if (state.src[start] !== '[' || state.src[start + 1] !== '[') return false;
    WL_RE.lastIndex = start;
    const m = WL_RE.exec(state.src);
    if (!m || m.index !== start) return false;
    const target = m[1];
    const label = m[2] !== undefined && m[2] !== '' ? m[2] : target;
    if (!silent) {
      const tok = state.push('wikilink', '[[', 0);
      tok.content = label;
      tok.meta = { target, label };
    }
    state.pos = start + m[0].length;
    return true;
  }, { alt: ['link', 'image'] });
}
