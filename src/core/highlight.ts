import { highlight, supportsLanguage } from 'cli-highlight';   // named exports!

// 02 §8 — highlight.ts contract:
//   lang null/''/unsupported → code unchanged (plain, no color)
//   supported → highlight(code, { language: lang }) (ANSI string)
//   cache: Map<lang + '\0' + code, string>
const cache = new Map<string, string>();

export function highlightCode(code: string, lang: string | null): string {
  const key = (lang ?? '') + '\0' + code;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const out = !lang || !supportsLanguage(lang) ? code : highlight(code, { language: lang });
  cache.set(key, out);
  return out;
}

// ISSUE-005 / ADR-006 (amended) — auto-detect highlighting for `code`/unlabeled
// fences. `highlight(code)` without a language runs highlight.js
// `highlightAuto` inside cli-highlight (no new import or dependency).
// Own cache: Map<code, string>.
const autoCache = new Map<string, string>();

export function highlightAuto(code: string): string {
  const hit = autoCache.get(code);
  if (hit !== undefined) return hit;
  const out = highlight(code);
  autoCache.set(code, out);
  return out;
}

// INV-1.3 / ADR-020 / ADR-027 (Task 7.3) — label language token for a fence info string.
// 'mermaid' returns 'mermaid'; 'math'/'latex' return 'math';
// empty or cli-highlight-unsupported → 'code'; otherwise the language itself.
export function fenceLabelLang(info: string | null | undefined): string {
  const lang = (info ?? '').trim();
  if (!lang) return 'code';
  if (lang.toLowerCase() === 'mermaid') return 'mermaid';
  if (['math', 'latex'].includes(lang.toLowerCase())) return 'math';
  return supportsLanguage(lang) ? lang : 'code';
}
