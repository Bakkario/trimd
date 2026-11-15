import { highlight, supportsLanguage } from 'cli-highlight';   // named exports!

export type InputFormat =
  | { kind: 'markdown' }
  | { kind: 'text' }
  | { kind: 'code'; lang: string };

const EXT_LANG_MAP: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  pyw: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  json: 'json',
  jsonc: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  rs: 'rust',
  go: 'go',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  sql: 'sql',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  toml: 'ini',
  ini: 'ini',
  conf: 'ini',
  lua: 'lua',
  r: 'r',
  kt: 'kotlin',
  swift: 'swift',
  diff: 'diff',
  patch: 'diff',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
};

const PLAIN_EXTS = new Set(['txt', 'text', 'log', 'csv', 'tsv', 'plain']);
const MD_EXTS = new Set(['md', 'markdown', 'mdx']);

function detectShebangLang(sample: string): string | null {
  if (!sample.startsWith('#!')) return null;
  const firstLine = sample.split(/\r?\n/, 1)[0].toLowerCase();
  if (firstLine.includes('python')) return 'python';
  if (firstLine.includes('node') || firstLine.includes('deno') || firstLine.includes('bun')) return 'javascript';
  if (firstLine.includes('tsx') || firstLine.includes('ts-node')) return 'typescript';
  if (firstLine.includes('bash') || firstLine.includes('/sh') || firstLine.includes('zsh')) return 'bash';
  if (firstLine.includes('ruby')) return 'ruby';
  if (firstLine.includes('perl')) return 'perl';
  if (firstLine.includes('lua')) return 'lua';
  if (firstLine.includes('php')) return 'php';
  return null;
}

function looksLikeMarkdown(sample: string): boolean {
  if (/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(sample)) return true;
  if (/^```/m.test(sample)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(sample)) return true;
  if (/\[\[[^\]]+\]\]/.test(sample)) return true;
  if (/^\s*[-*]\s+\[[ xX]\]\s+/m.test(sample)) return true;
  const hasCodeKeywords = /^(?:import\s+|from\s+\S+\s+import\s+|def\s+\w+|class\s+\w+|function\s+\w+|const\s+\w+|let\s+\w+|var\s+\w+|export\s+|package\s+|#include\s+)/m.test(sample);
  if (!hasCodeKeywords && /^#{1,3}\s+\S/m.test(sample)) return true;
  return false;
}

// ISSUE-027 — 3-step format resolution:
// 1. Explicit `--lang <id>` (always wins)
// 2. O(1) file extension / basename lookup (zero content scan)
// 3. Fast ~2 KB sampled detection (shebang → Markdown signals → highlightAuto → plain text)
export function resolveInputFormat(
  text: string,
  filePath?: string | null,
  explicitLang?: string | null,
): InputFormat {
  if (explicitLang && explicitLang.trim() !== '') {
    const norm = explicitLang.trim().toLowerCase();
    if (MD_EXTS.has(norm)) return { kind: 'markdown' };
    if (PLAIN_EXTS.has(norm) || norm === 'none') return { kind: 'text' };
    const mapped = EXT_LANG_MAP[norm] ?? norm;
    if (supportsLanguage(mapped)) return { kind: 'code', lang: mapped };
    return { kind: 'text' };
  }

  if (filePath && filePath !== '-' && filePath !== '<stdin>') {
    const base = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? '';
    if (base === 'dockerfile') return supportsLanguage('dockerfile') ? { kind: 'code', lang: 'dockerfile' } : { kind: 'text' };
    if (base === 'makefile') return supportsLanguage('makefile') ? { kind: 'code', lang: 'makefile' } : { kind: 'text' };
    const dot = base.lastIndexOf('.');
    if (dot > 0) {
      const ext = base.slice(dot + 1);
      if (MD_EXTS.has(ext)) return { kind: 'markdown' };
      if (PLAIN_EXTS.has(ext)) return { kind: 'text' };
      const mapped = EXT_LANG_MAP[ext];
      if (mapped && supportsLanguage(mapped)) return { kind: 'code', lang: mapped };
      if (supportsLanguage(ext)) return { kind: 'code', lang: ext };
    }
  }

  // Piped stdin or unknown/extensionless file: inspect only a small 2 KB prefix.
  const sample = text.slice(0, 2048);
  if (sample.trim() === '') return { kind: 'text' };

  const shebang = detectShebangLang(sample);
  if (shebang && supportsLanguage(shebang)) return { kind: 'code', lang: shebang };

  if (looksLikeMarkdown(sample)) return { kind: 'markdown' };

  // Run highlightAuto on the 2 KB sample; if no SGR escapes are emitted, fall back to plain text.
  const probe = highlightAuto(sample);
  if (/\x1b\[[0-9;]*m/.test(probe)) return { kind: 'code', lang: 'auto' };

  return { kind: 'text' };
}

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

// ISSUE-005 / ADR-006 (amended) / ADR-038 — auto-detect highlighting for `code`/unlabeled
// fences. Uses shebang shortcut first, then a curated 28-language subset
// (`AUTO_LANGUAGE_SUBSET`) instead of scanning all ~189 highlight.js grammars.
// Own cache: Map<code, string>.
export const AUTO_LANGUAGE_SUBSET: readonly string[] = [
  'bash', 'javascript', 'typescript', 'python', 'json', 'yaml',
  'rust', 'go', 'c', 'cpp', 'java', 'ruby', 'php', 'sql',
  'css', 'scss', 'xml', 'ini', 'lua', 'r', 'kotlin', 'swift',
  'diff', 'dockerfile', 'makefile', 'markdown', 'csharp', 'perl',
];

const autoCache = new Map<string, string>();

export function highlightAuto(code: string): string {
  if (code.trim() === '') return code;
  const hit = autoCache.get(code);
  if (hit !== undefined) return hit;
  const shebang = detectShebangLang(code);
  const out = shebang && supportsLanguage(shebang)
    ? highlight(code, { language: shebang })
    : highlight(code, { languageSubset: [...AUTO_LANGUAGE_SUBSET] });
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
