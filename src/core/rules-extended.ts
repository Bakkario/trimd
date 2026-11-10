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

// ---- Phase 11.2: Preprocessing for Containers, Abbreviations, Footnotes & Definition Lists ----

function splitCodeFences(src: string): { text: string; isCode: boolean }[] {
  const chunks: { text: string; isCode: boolean }[] = [];
  const lines = src.split('\n');
  let inFence = false;
  let fenceMarker = '';
  let cur: string[] = [];

  for (const line of lines) {
    const fenceMatch = /^([`~]{3,})/.exec(line.trimStart());
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        if (cur.length > 0) {
          chunks.push({ text: cur.join('\n'), isCode: false });
          cur = [];
        }
        inFence = true;
        fenceMarker = marker[0];
        cur.push(line);
      } else if (marker[0] === fenceMarker) {
        cur.push(line);
        chunks.push({ text: cur.join('\n'), isCode: true });
        cur = [];
        inFence = false;
        fenceMarker = '';
      } else {
        cur.push(line);
      }
    } else {
      cur.push(line);
    }
  }
  if (cur.length > 0) {
    chunks.push({ text: cur.join('\n'), isCode: inFence });
  }
  return chunks;
}

export function preprocessExtendedMarkdown(src: string): string {
  const chunks = splitCodeFences(src);
  const abbrs = new Map<string, string>();
  const fnDefs = new Map<string, string>();

  // Pass 1: Parse and transform containers, abbreviations, footnote defs, and definition lists
  for (const chunk of chunks) {
    if (chunk.isCode) continue;

    // Custom containers: ::: <type> [title]\n...\n:::
    chunk.text = chunk.text.replace(/^::: *(\w+)(?: +(.*))?\n([\s\S]*?)\n:::\s*$/gm, (_, type, title, body) => {
      const headerTitle = title && title.trim() ? title.trim() : type;
      const header = `> [!${type}] ${headerTitle}`;
      const bodyLines = body.split('\n').map((line: string) => `> ${line}`).join('\n');
      return `${header}\n${bodyLines}`;
    });

    // Abbreviations: *[ABBR]: Full text
    chunk.text = chunk.text.replace(/^\*\[([^\]]+)\]:[ \t]*(.+)$/gm, (_, abbr, full) => {
      abbrs.set(abbr.trim(), full.trim());
      return '';
    });

    // Footnote block definitions: [^id]: definition text
    const lines = chunk.text.split('\n');
    const outLines: string[] = [];
    let curFnId: string | null = null;
    let curFnLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const defMatch = /^\[\^([^\]]+)\]:[ \t]*(.*)$/.exec(line);
      if (defMatch) {
        if (curFnId) {
          fnDefs.set(curFnId, curFnLines.join('\n').trim());
        }
        curFnId = defMatch[1];
        curFnLines = [defMatch[2]];
      } else if (curFnId) {
        if (/^(?: {4}|\t)(.*)$/.test(line)) {
          curFnLines.push(line.replace(/^(?: {4}|\t)/, ''));
        } else if (line.trim() === '' && i + 1 < lines.length && /^(?: {4}|\t)/.test(lines[i + 1])) {
          curFnLines.push('');
        } else {
          fnDefs.set(curFnId, curFnLines.join('\n').trim());
          curFnId = null;
          curFnLines = [];
          outLines.push(line);
        }
      } else {
        outLines.push(line);
      }
    }
    if (curFnId) {
      fnDefs.set(curFnId, curFnLines.join('\n').trim());
    }
    chunk.text = outLines.join('\n');

    // Definition lists: Term followed by : or ~ definitions
    const dLines = chunk.text.split('\n');
    const dResult: string[] = [];
    let i = 0;
    while (i < dLines.length) {
      const line = dLines[i];
      let nextDefIdx = -1;
      if (i + 1 < dLines.length && /^[ \t]*[:~][ \t]+/.test(dLines[i + 1])) {
        nextDefIdx = i + 1;
      } else if (i + 2 < dLines.length && dLines[i + 1].trim() === '' && /^[ \t]*[:~][ \t]+/.test(dLines[i + 2])) {
        nextDefIdx = i + 2;
      }

      const isTerm = nextDefIdx !== -1 &&
        line.trim() !== '' &&
        !line.startsWith('#') &&
        !line.startsWith('>') &&
        !line.startsWith('- ') &&
        !line.startsWith('* ') &&
        !line.startsWith('::: ') &&
        !line.startsWith('|');

      if (isTerm) {
        const term = line.trim();
        const boldTerm = term.startsWith('**') && term.endsWith('**') ? term : `**${term}**`;
        dResult.push(boldTerm);
        dResult.push('');
        i = nextDefIdx;
        while (i < dLines.length) {
          const dLine = dLines[i];
          const defMatch = /^[ \t]*[:~][ \t]+(.*)/.exec(dLine);
          if (defMatch) {
            dResult.push(`- ${defMatch[1]}`);
            i++;
          } else if (dLine.trim() === '') {
            if (i + 1 < dLines.length && /^[ \t]*[:~][ \t]+/.test(dLines[i + 1])) {
              i++;
            } else if (i + 1 < dLines.length && /^(?: {4}|\t)/.test(dLines[i + 1])) {
              dResult.push('');
              i++;
            } else {
              break;
            }
          } else if (/^(?: {2,4}|\t)/.test(dLine) || (!dLine.startsWith('#') && !dLine.startsWith('-') && !dLine.startsWith('`'))) {
            dResult.push(`  ${dLine.trim()}`);
            i++;
          } else {
            break;
          }
        }
      } else {
        dResult.push(line);
        i++;
      }
    }
    chunk.text = dResult.join('\n');
  }

  // Pass 2: Replace abbreviations and footnote references in non-code chunks
  const idToNum = new Map<string, number>();
  const orderedDefs: { num: number; text: string }[] = [];

  for (const chunk of chunks) {
    if (chunk.isCode) continue;

    // Abbreviations replacement (first whole-word match)
    for (const [abbr, fullText] of abbrs) {
      const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRe = new RegExp(`\\b${escaped}\\b`, 'g');
      let replaced = false;
      chunk.text = chunk.text.replace(wordRe, (match) => {
        if (!replaced) {
          replaced = true;
          return `${match} (${fullText})`;
        }
        return match;
      });
    }

    // Footnote references: [^id] or ^[inline text]
    chunk.text = chunk.text.replace(/(\[\^([^\]]+)\]|\^\[([^\]]+)\])/g, (_, fullMatch, refId, inlineText) => {
      if (refId) {
        let num = idToNum.get(refId);
        if (num === undefined) {
          num = idToNum.size + 1;
          idToNum.set(refId, num);
          const def = fnDefs.get(refId) ?? refId;
          orderedDefs.push({ num, text: def });
        }
        return `[${num}]`;
      } else if (inlineText) {
        const num = idToNum.size + 1;
        idToNum.set(`__inline_${num}`, num);
        orderedDefs.push({ num, text: inlineText.trim() });
        return `[${num}]`;
      }
      return fullMatch;
    });
  }

  let finalMd = chunks.map((c) => c.text).join('\n');
  if (orderedDefs.length > 0) {
    finalMd += '\n\n## Footnotes\n\n' + orderedDefs.map((d) => `${d.num}. ${d.text}`).join('\n\n') + '\n';
  }
  return finalMd;
}
