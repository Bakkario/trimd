import { readdirSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

// 02 §9 — session-root index for wikilink/embed resolution and sidebar listing.

export interface RootIndex {
  exact: Map<string, string>;
  ci: Map<string, string>;
  stem: Map<string, string>;
}

export function stemOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

const MD_RE = /\.mdx?$/i;

function skipDir(name: string, showHidden: boolean): boolean {
  if (name === '.obsidian' || name === '.git') return true;
  return name.startsWith('.') && !showHidden;
}

/** Deterministic DFS (sorted per level, max 10 dirs deep); first writer wins. */
function walk(dir: string, level: number, showHidden: boolean, emit: (abs: string) => void): void {
  if (level > 10) return;
  let dts: Dirent[] = [];
  try {
    dts = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  dts.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  for (const d of dts) {
    if (skipDir(d.name, showHidden)) continue;
    const abs = join(dir, d.name);
    if (d.isDirectory()) {
      walk(abs, level + 1, showHidden, emit);
    } else if (d.isFile() && MD_RE.test(d.name)) {
      emit(abs);
    }
  }
}

export function buildIndex(root: string, showHidden: boolean): RootIndex {
  const exact = new Map<string, string>();
  const ci = new Map<string, string>();
  const stem = new Map<string, string>();
  walk(root, 0, showHidden, (abs: string) => {
    const base = abs.slice(abs.lastIndexOf('/') + 1);
    if (!exact.has(base)) exact.set(base, abs);
    const keyCi = base.toLowerCase();
    if (!ci.has(keyCi)) ci.set(keyCi, abs);
    const keyStem = stemOf(base).toLowerCase();
    if (!stem.has(keyStem)) stem.set(keyStem, abs);
  });
  return { exact, ci, stem };
}

export function makeResolver(idx: RootIndex): (target: string) => string | null {
  return (target: string): string | null => {
    const t = target.split('#')[0];
    if (t === '') return null;
    return idx.exact.get(t) ?? idx.ci.get(t.toLowerCase()) ?? idx.stem.get(stemOf(t).toLowerCase()) ?? null;
  };
}

export interface DirEntry {
  name: string;
  isDir: boolean;
  abs: string;
}

/** One level; dirs first then files, localeCompare(sensitivity 'base'); .md files only. */
export function listEntries(dir: string, showHidden: boolean): DirEntry[] {
  let dts: Dirent[] = [];
  try {
    dts = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: DirEntry[] = [];
  for (const d of dts) {
    const name = d.name;
    if (skipDir(name, showHidden)) continue;
    const abs = join(dir, name);
    if (d.isDirectory()) {
      out.push({ name, isDir: true, abs });
    } else if (MD_RE.test(name)) {
      out.push({ name, isDir: false, abs });
    }
  }
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return out;
}
