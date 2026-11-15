import { readdirSync, readFileSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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
const ASSET_RE = /\.(?:mdx?|markdown|png|jpe?g|gif|webp|svg|bmp)$/i;

function skipDir(name: string, showHidden: boolean): boolean {
  if (name === '.obsidian' || name === '.git' || name === 'node_modules' || name === 'dist' || name === 'master') return true;
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
    } else if (d.isFile() && ASSET_RE.test(d.name)) {
      emit(abs);
    }
  }
}

const indexCache = new Map<string, RootIndex>();

export function buildIndex(root: string, showHidden: boolean): RootIndex {
  const key = `${root}\0${showHidden}`;
  const cached = indexCache.get(key);
  if (cached) return cached;

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
  const idx = { exact, ci, stem };
  indexCache.set(key, idx);
  return idx;
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
export function listEntries(
  dir: string,
  showHidden: boolean = false,
  sortBy: 'name' | 'mtime' = 'name'
): DirEntry[] {
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

  if (sortBy === 'mtime') {
    const mtimes = new Map<string, number>();
    for (const e of out) {
      try {
        mtimes.set(e.abs, statSync(e.abs).mtimeMs);
      } catch {
        mtimes.set(e.abs, 0);
      }
    }
    out.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      const diff = (mtimes.get(b.abs) ?? 0) - (mtimes.get(a.abs) ?? 0);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  } else {
    out.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }
  return out;
}

// Git status detection cached per session root (read-only per ADR-021, ADR-031 / R-14)
const gitModifiedCache = new Map<string, ReadonlySet<string>>();
const gitBranchCache = new Map<string, string | null>();

export function clearGitCache(root?: string): void {
  if (root) {
    gitModifiedCache.delete(root);
    gitBranchCache.delete(root);
    indexCache.delete(`${root}\0false`);
    indexCache.delete(`${root}\0true`);
    backlinkCache.delete(root);
  } else {
    gitModifiedCache.clear();
    gitBranchCache.clear();
    indexCache.clear();
    backlinkCache.clear();
  }
}

function parseBranchHeader(header: string): string | null {
  // e.g. "## master...origin/master", "## No commits yet on main", "## HEAD (no branch)"
  let rest = header.slice(3).trim();
  if (rest.startsWith('No commits yet on ')) {
    rest = rest.slice('No commits yet on '.length);
  }
  const dots = rest.indexOf('...');
  if (dots !== -1) rest = rest.slice(0, dots);
  const space = rest.indexOf(' ');
  if (space !== -1) rest = rest.slice(0, space);
  if (!rest || rest === 'HEAD') return null;
  return rest;
}

export function detectGitModified(root: string): ReadonlySet<string> {
  const cached = gitModifiedCache.get(root);
  if (cached) return cached;

  const result = new Set<string>();
  let branch: string | null = null;
  try {
    const statusRes = spawnSync('git', ['-C', root, 'status', '--porcelain=v1', '-b', '-uall'], {
      encoding: 'utf8',
      timeout: 500,
    });
    if (statusRes.status !== 0 || !statusRes.stdout) {
      gitModifiedCache.set(root, result);
      gitBranchCache.set(root, null);
      return result;
    }

    const lines = statusRes.stdout.split('\n');
    let gitTop: string | null = null;
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('## ')) {
        branch = parseBranchHeader(line);
        continue;
      }
      if (line.length < 4) continue;
      if (gitTop === null) {
        const topRes = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
          encoding: 'utf8',
          timeout: 500,
        });
        gitTop = topRes.status === 0 && topRes.stdout ? topRes.stdout.trim() : root;
      }
      // status line e.g. " M file.md", "?? untracked.md", "R  old -> new"
      const pathPart = line.slice(3).trim();
      const actualPath = pathPart.includes(' -> ') ? pathPart.split(' -> ')[1].trim() : pathPart;
      const absPath = resolve(gitTop, actualPath);
      result.add(absPath);
    }
  } catch {
    // git failed or unavailable — strictly fail-safe
  }

  gitModifiedCache.set(root, result);
  gitBranchCache.set(root, branch);
  return result;
}

export function detectGitBranch(root: string): string | null {
  const cached = gitBranchCache.get(root);
  if (cached !== undefined) return cached;
  detectGitModified(root);
  return gitBranchCache.get(root) ?? null;
}

// Phase 3 (Task 9.2, ADR-030) — read-only backlink index cached per root.
// targetAbs → sorted unique array of sourceAbs files that link to targetAbs via [[wikilink]].
const backlinkCache = new Map<string, Map<string, string[]>>();

const WIKILINK_RE = /\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g;

export function buildBacklinkIndex(root: string, idx: RootIndex): Map<string, string[]> {
  const cached = backlinkCache.get(root);
  if (cached) return cached;

  const resolve = makeResolver(idx);
  const out = new Map<string, Set<string>>();

  // Find all .md files in the index (from exact values)
  const sourceFiles = new Set<string>(idx.exact.values());

  for (const sourceAbs of sourceFiles) {
    if (!MD_RE.test(sourceAbs)) continue;
    let content = '';
    try {
      content = readFileSync(sourceAbs, 'utf8');
    } catch {
      continue;
    }
    WIKILINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKILINK_RE.exec(content)) !== null) {
      const targetName = m[1].trim();
      const targetAbs = resolve(targetName);
      if (targetAbs && targetAbs !== sourceAbs) {
        let set = out.get(targetAbs);
        if (!set) {
          set = new Set<string>();
          out.set(targetAbs, set);
        }
        set.add(sourceAbs);
      }
    }
  }

  const result = new Map<string, string[]>();
  for (const [targetAbs, sources] of out.entries()) {
    result.set(targetAbs, Array.from(sources).sort((a, b) => a.localeCompare(b)));
  }

  backlinkCache.set(root, result);
  return result;
}
