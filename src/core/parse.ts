import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { wikilinkPlugin } from './rules-wikilink.js';
import type { StateInline, StateCore, Token } from 'markdown-it';

// ---- custom inline rule: ~~strikethrough~~ -> s_open / text / s_close ----
function strikethroughRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start + 2 > max || state.src[start] !== '~' || state.src[start + 1] !== '~') {
    return false;
  }
  let pos = start + 2;
  let close = -1;
  while (pos + 1 < max) {
    if (state.src[pos] === '~' && state.src[pos + 1] === '~') {
      close = pos;
      break;
    }
    pos += 1;
  }
  if (close === -1) return false;
  if (!silent) {
    const open = state.push('s_open', 's', 1);
    open.markup = '~~';
    const text = state.push('text', '', 0);
    text.content = state.src.slice(start + 2, close);
    state.push('s_close', 's', -1);
  }
  state.pos = close + 2;
  return true;
}

/**
 * Stamp meta.task / meta.checked on the enclosing list_item_open token for GFM
 * task items. Runs before the markdown-it-task-lists core rule rewrites the
 * inline text (which strips the '[x] ' / '[ ] ' prefix and injects a
 * checkbox html_inline token).
 */
function taskMetaRule(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'inline' || !t.children || t.children.length === 0) continue;
    const c0 = t.children[0];
    if (c0.type !== 'text') continue;
    const m = /^\[([ xX])\]\s?/.exec(c0.content);
    if (!m) continue;
    for (let j = i - 1; j >= 0; j--) {
      const p = tokens[j];
      if (p.type === 'list_item_open') {
        p.meta = { ...(p.meta ?? {}), task: true, checked: m[1].toLowerCase() === 'x' };
        break;
      }
    }
  }
}

let md: InstanceType<typeof MarkdownIt> | null = null;

function getMd(): InstanceType<typeof MarkdownIt> {
  if (!md) {
    md = new MarkdownIt('default', { html: false, linkify: false, typographer: false });
    md.inline.ruler.after('emphasis', 'strikethrough', strikethroughRule);
    md.use(taskLists);
    md.core.ruler.after('inline', 'trimd-task-meta', taskMetaRule);
    md.use(wikilinkPlugin);
    // plugins added later by editing this file: tagPlugin (2.3), embedPlugin (2.5)
  }
  return md;
}

export function parseTokens(src: string): Token[] {
  return getMd().parse(src, {});
}
