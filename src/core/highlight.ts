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

// INV-1.3 / ADR-020 — label language token for a fence info string.
// math/latex/mermaid (case-insensitive) → 'math' (plain content, never a diagram);
// empty or cli-highlight-unsupported → 'code'; otherwise the language itself.
export function fenceLabelLang(info: string | null | undefined): string {
  const lang = (info ?? '').trim();
  if (!lang) return 'code';
  if (['math', 'latex', 'mermaid'].includes(lang.toLowerCase())) return 'math';
  return supportsLanguage(lang) ? lang : 'code';
}
