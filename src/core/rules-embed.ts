import type { MarkdownIt, StateInline } from 'markdown-it';

// 01 §2.2 / INV-2.6 — `![[target]]` / `![[target|label]]` → embed token.
const EM_RE = /!\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/y;

export function embedPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('link', 'embed', (state: StateInline, silent: boolean): boolean => {
    const start = state.pos;
    if (state.src[start] !== '!' || state.src[start + 1] !== '[' || state.src[start + 2] !== '[') return false;
    EM_RE.lastIndex = start;
    const m = EM_RE.exec(state.src);
    if (!m || m.index !== start) return false;
    const target = m[1];
    const label = m[2] !== undefined && m[2] !== '' ? m[2] : target;
    if (!silent) {
      const tok = state.push('embed', '![[', 0);
      tok.content = label;
      tok.meta = { target, label };
    }
    state.pos = start + m[0].length;
    return true;
  }, { alt: ['link', 'image'] });
}
