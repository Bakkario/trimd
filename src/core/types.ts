export interface LinkSpan {
  line: number; // index into RenderedDoc.lines
  startCol: number; // visible column, 0-based
  endCol: number; // exclusive visible column
  href: string; // absolute path (local) or http(s) URL
  kind: 'file' | 'http' | 'wikilink' | 'embed' | 'copy';
  target?: string; // wikilink/embed target (pre-#)
  resolved?: boolean;
}

export interface RenderedLine {
  text: string; // may contain ANSI escapes; one logical line (no \n inside)
  links: LinkSpan[]; // spans whose line === this line's index
}

export interface FrontmatterMeta {
  raw: string; // exact YAML block text (between the --- lines)
  data: Record<string, unknown> | null; // null when parse failed
  valid: boolean;
}

export interface FenceBlock {
  line: number; // start line index in RenderedDoc.lines
  endLine: number; // inclusive end line index in RenderedDoc.lines
  lang: string; // display label language ('code', 'mermaid', 'bash', ...)
  raw: string; // un-highlighted raw fence text for OSC 52 copy
}

export interface HeadingEntry {
  level: number; // 1..6
  text: string; // visible heading text (ANSI stripped)
  line: number; // line index in RenderedDoc.lines
}

export interface RenderedDoc {
  lines: RenderedLine[];
  meta: FrontmatterMeta | null;
  title: string;
  warnings: string[];
  source: string; // absolute path of the rendered file
  fences?: FenceBlock[];
  headings?: HeadingEntry[];
}

export interface ThemeColors {
  heading1: string;
  heading2: string;
  heading3: string;
  heading4: string;
  heading5: string;
  heading6: string;
  bold: string;
  italic: string;
  strike: string;
  inlineCode: string;
  codeLabel: string;
  link: string;
  tag: string;
  quote: string;
  metaLabel: string;
  metaKey: string;
  metaValue: string;
  tableHead: string;
  tableBorder: string;
  hr: string;
  dim: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  calloutNote: string;
  calloutTip: string;
  calloutInfo: string;
  calloutSuccess: string;
  calloutQuestion: string;
  calloutWarning: string;
  calloutDanger: string;
  sidebar: string;
  statusOk: string;
  statusWarn: string;
  search: string;
  headerBg: string;
  accentPill: string;
  codeBg: string;
  calloutBg: string;
  tagChip: string;
  linkHint: string;
  activeDoc: string;
  scrollbar: string;
}

export type IconMode = 'nerd' | 'emoji' | 'ascii' | 'none' | 'auto';

export interface ThemeIconMap {
  dir?: string;
  dirOpen?: string;
  file?: string;
  active?: string;
  readme?: string;
  spec?: string;
  task?: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
  icons?: IconMode | ThemeIconMap;
}

export interface Config {
  theme: string;
  showFrontmatter: boolean;
  sidebarOpen: boolean;
  showHidden: boolean;
  root?: string;
  width?: number;
  gfx?: 'kitty' | 'halfblock' | 'unicode' | 'none';
  icons?: IconMode;
}

export interface MouseEvt {
  x: number;
  y: number;
  button: 0 | 1 | 2; // 0 = left
  action: 'press' | 'release' | 'move' | 'wheelUp' | 'wheelDown';
}

export class FileMissingError extends Error {
  code = 1;
}

export class FileError extends Error {
  code = 2;
}

export class UsageError extends Error {
  code = 3;
}

export class ConfigError extends Error {
  code = 3;
}
