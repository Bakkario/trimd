import type { MarkdownIt, StateInline } from 'markdown-it';

// 01 §2.2 / INV-2.3 — `#tag`: preceded by whitespace or start of text.
const TAG_RE = /(?<=^|\s)#([A-Za-z0-9][A-Za-z0-9/._-]*)/y;

export function tagPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('link', 'tag', (state: StateInline, silent: boolean): boolean => {
    const start = state.pos;
    if (state.src[start] !== '#') return false;
    TAG_RE.lastIndex = start;
    const m = TAG_RE.exec(state.src);
    if (!m || m.index !== start) return false;
    if (!silent) {
      const tok = state.push('tag', '#', 0);
      tok.content = '#' + m[1];
    }
    state.pos = start + m[0].length;
    return true;
  }, { alt: ['link'] });
}
