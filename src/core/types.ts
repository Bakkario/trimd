export interface LinkSpan {
  line: number; // index into RenderedDoc.lines
  startCol: number; // visible column, 0-based
  endCol: number; // exclusive visible column
  href: string; // absolute path (local) or http(s) URL
  kind: 'file' | 'http' | 'wikilink' | 'embed';
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

export interface RenderedDoc {
  lines: RenderedLine[];
  meta: FrontmatterMeta | null;
  title: string;
  warnings: string[];
  source: string; // absolute path of the rendered file
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
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
}

export interface Config {
  theme: string;
  showFrontmatter: boolean;
  sidebarOpen: boolean;
  showHidden: boolean;
  root?: string;
  width?: number;
}

export interface MouseEvt {
  x: number;
  y: number;
  button: 0 | 1 | 2; // 0 = left
  action: 'press' | 'release' | 'move';
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
