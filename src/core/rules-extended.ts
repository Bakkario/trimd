import type { MarkdownIt, StateInline, StateCore, Token } from 'markdown-it';

// 01 §2.1 / D-4.3 (ADR-032) — Extended Markdown syntax & typographer/emojis.

const SUP_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
  'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'j': 'ʲ', 'k': 'ᵏ',
  'l': 'ˡ', 'm': 'ᵐ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ',
  's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ',
  'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
};

export function toSuperscript(s: string): string {
  return Array.from(s).map((c) => SUP_MAP[c.toLowerCase()] ?? c).join('');
}

const SUB_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
  'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
  'v': 'ᵥ', 'x': 'ₓ',
};

export function toSubscript(s: string): string {
  return Array.from(s).map((c) => SUB_MAP[c.toLowerCase()] ?? c).join('');
}

// Inline rule: ==text== -> mark_open / text / mark_close
function markRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start + 4 > max || state.src[start] !== '=' || state.src[start + 1] !== '=') {
    return false;
  }
  let pos = start + 2;
  let close = -1;
  while (pos + 1 < max) {
    if (state.src[pos] === '\n') return false;
    if (state.src[pos] === '=' && state.src[pos + 1] === '=') {
      close = pos;
      break;
    }
    pos += 1;
  }
  if (close === -1 || close === start + 2) return false;
  if (!silent) {
    state.push('mark_open', 'mark', 1);
    const text = state.push('text', '', 0);
    text.content = state.src.slice(start + 2, close);
    state.push('mark_close', 'mark', -1);
  }
  state.pos = close + 2;
  return true;
}

// Inline rule: ++text++ -> ins_open / text / ins_close
function insRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start + 4 > max || state.src[start] !== '+' || state.src[start + 1] !== '+') {
    return false;
  }
  let pos = start + 2;
  let close = -1;
  while (pos + 1 < max) {
    if (state.src[pos] === '\n') return false;
    if (state.src[pos] === '+' && state.src[pos + 1] === '+') {
      close = pos;
      break;
    }
    pos += 1;
  }
  if (close === -1 || close === start + 2) return false;
  if (!silent) {
    state.push('ins_open', 'ins', 1);
    const text = state.push('text', '', 0);
    text.content = state.src.slice(start + 2, close);
    state.push('ins_close', 'ins', -1);
  }
  state.pos = close + 2;
  return true;
}

// Inline rule: ^text^ -> sup_open / text / sup_close
function supRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start + 2 > max || state.src[start] !== '^') return false;
  if (state.src[start + 1] === '^' || /\s/.test(state.src[start + 1])) return false;
  let pos = start + 1;
  let close = -1;
  while (pos < max) {
    const ch = state.src[pos];
    if (ch === '^') {
      close = pos;
      break;
    }
    if (/\s/.test(ch)) return false;
    pos += 1;
  }
  if (close === -1 || close === start + 1) return false;
  if (!silent) {
    state.push('sup_open', 'sup', 1);
    const text = state.push('text', '', 0);
    text.content = state.src.slice(start + 1, close);
    state.push('sup_close', 'sup', -1);
  }
  state.pos = close + 1;
  return true;
}

// Inline rule: ~text~ (single ~) -> sub_open / text / sub_close
function subRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start + 2 > max || state.src[start] !== '~') return false;
  if (state.src[start + 1] === '~' || /\s/.test(state.src[start + 1])) return false;
  if (start > 0 && state.src[start - 1] === '~') return false;
  let pos = start + 1;
  let close = -1;
  while (pos < max) {
    const ch = state.src[pos];
    if (ch === '~') {
      if (pos + 1 < max && state.src[pos + 1] === '~') return false;
      close = pos;
      break;
    }
    if (/\s/.test(ch)) return false;
    pos += 1;
  }
  if (close === -1 || close === start + 1) return false;
  if (!silent) {
    state.push('sub_open', 'sub', 1);
    const text = state.push('text', '', 0);
    text.content = state.src.slice(start + 1, close);
    state.push('sub_close', 'sub', -1);
  }
  state.pos = close + 1;
  return true;
}

const EMOJI_MAP: Record<string, string> = {
  ':wink:': '😉',
  ':cry:': '😢',
  ':laughing:': '😆',
  ':yum:': '😋',
  ':smile:': '😄',
  ':rocket:': '🚀',
  ':warning:': '⚠',
  ':check:': '✔',
  ':heart:': '❤️',
  ':fire:': '🔥',
  ':star:': '⭐',
  ':thumbsup:': '👍',
};

function replaceTypoAndEmojis(content: string): string {
  let s = content
    .replace(/\(c\)/gi, '©')
    .replace(/\(r\)/gi, '®')
    .replace(/\(tm\)/gi, '™')
    .replace(/\+-/g, '±');

  for (const [code, emoji] of Object.entries(EMOJI_MAP)) {
    s = s.replaceAll(code, emoji);
  }

  s = s
    .replace(/(^|\s)8-\)(?=$|\s|[.,!?:;])/g, '$1😎')
    .replace(/(^|\s):-\)(?=$|\s|[.,!?:;])/g, '$1🙂')
    .replace(/(^|\s):-\((?=$|\s|[.,!?:;])/g, '$1🙁')
    .replace(/(^|\s);\)(?=$|\s|[.,!?:;])/g, '$1😉');

  return s;
}

const BARE_URL_RE = /https?:\/\/[^\s<>()]+/g;

function typographerAndEmojiRule(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'inline' || !t.children) continue;

    let inLink = 0;
    const newChildren: Token[] = [];

    for (let j = 0; j < t.children.length; j++) {
      const child = t.children[j];
      if (child.type === 'link_open') {
        inLink++;
        newChildren.push(child);
        continue;
      }
      if (child.type === 'link_close') {
        inLink = Math.max(0, inLink - 1);
        newChildren.push(child);
        continue;
      }

      if (child.type === 'text') {
        child.content = replaceTypoAndEmojis(child.content);

        // Autoconvert bare URLs outside links
        if (inLink === 0 && BARE_URL_RE.test(child.content)) {
          BARE_URL_RE.lastIndex = 0;
          let lastIndex = 0;
          let match: RegExpExecArray | null;

          while ((match = BARE_URL_RE.exec(child.content)) !== null) {
            const url = match[0];
            const matchStart = match.index;

            if (matchStart > lastIndex) {
              const beforeTok = new state.Token('text', '', 0);
              beforeTok.content = child.content.slice(lastIndex, matchStart);
              newChildren.push(beforeTok);
            }

            const linkOpen = new state.Token('link_open', 'a', 1);
            linkOpen.attrs = [['href', url]];
            newChildren.push(linkOpen);

            const linkText = new state.Token('text', '', 0);
            linkText.content = url;
            newChildren.push(linkText);

            const linkClose = new state.Token('link_close', 'a', -1);
            newChildren.push(linkClose);

            lastIndex = matchStart + url.length;
          }

          if (lastIndex < child.content.length) {
            const afterTok = new state.Token('text', '', 0);
            afterTok.content = child.content.slice(lastIndex);
            newChildren.push(afterTok);
          }
          continue;
        }
      }

      newChildren.push(child);
    }

    t.children = newChildren;
  }
}

export function extendedInlinePlugin(md: MarkdownIt): void {
  md.inline.ruler.after('emphasis', 'mark', markRule);
  md.inline.ruler.after('emphasis', 'ins', insRule);
  md.inline.ruler.after('emphasis', 'sup', supRule);
  md.inline.ruler.after('emphasis', 'sub', subRule);
  md.core.ruler.after('inline', 'trimd-extended-text', typographerAndEmojiRule);
}
