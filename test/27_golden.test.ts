import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFile } from '../src/core/pipeline.js';
import { parseTokens } from '../src/core/parse.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import type { RenderedDoc } from '../src/core/types.js';

// 5.2 — real-vault golden tests (sanitized fixtures, ADR-021 / 06 R5).
// root = test/fixtures/vault so wikilinks/links resolve against the fixtures.
//
// Callout fixture decision (2026-10-30, logged in project.log): the
// task-named source note (20_Knowledge/Guides/prd-llama-cpp-v2.md) cannot
// satisfy INV-1.2 — markdown-it does not parse file://-scheme links (they
// render as literal "[text](file://…)"), it has a table column headed "#",
// and bash "# " comments inside fences. Swapped to
// 40_Projects/Vault_Refactor_And_Skills_Repo/01_Project_PRD.md, the only
// vault callout note without file:// links and no "#" table column.
//
// INV-1.2 is asserted code-aware: code-fence content renders as-is by
// contract (02 §8 — no wrap, code untouched), so bash "# comments" and
// "---" yaml samples inside fences are code, not raw markdown. Code
// regions are located via the dim label lines ("── <lang> ────…", INV-1.3):
// the k-th label line is followed by exactly the k-th fence's code-line
// count (source order = render order). The mapping is verified: every
// fence must find its label, else the check fails loudly. (The fixed meta
// header "── metadata ──" has only 2 trailing dashes and cannot match.)
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'fixtures', 'vault');
const ctx = { root, width: 70, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false };

// Exact INV-1.2 regex set (matches test/15_pipeline.test.ts).
const RAW_MD = [
  /^\s*#{1,6}\s/,
  /\*\*/,
  /^\s*`{3,}/,
  /^\s*>\s?/,
  /\[[^\]\n]*\]\(/,
  /^\s*\|?\s*-{3,}/,
];

function visible(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;[^\]]*\\/g, '');
}

function render(name: string): { doc: RenderedDoc; src: string; raw: string; stripped: string } {
  const src = readFileSync(join(root, name), 'utf8');
  const doc = renderFile(join(root, name), ctx);
  const raw = doc.lines.map((l) => l.text).join('\n');
  const stripped = doc.lines.map((l) => visible(l.text)).join('\n');
  return { doc, src, raw, stripped };
}

function codeLineIndices(src: string, visLines: string[]): { code: Set<number>; ok: boolean } {
  const fenceLens = parseTokens(src)
    .filter((t) => t.type === 'fence')
    .map((t) => {
      const c = t.content.endsWith('\n') ? t.content.slice(0, -1) : t.content;
      return c.split('\n').length;
    });
  const labelRe = /^── \w+ ─+.*─*$/;
  const code = new Set<number>();
  let fi = 0;
  let remaining = 0;
  visLines.forEach((v, i) => {
    if (remaining > 0) {
      code.add(i);
      remaining--;
    } else if (fi < fenceLens.length && labelRe.test(v)) {
      fi++;
      remaining = fenceLens[fi - 1];
    }
  });
  return { code, ok: fi === fenceLens.length };
}

function assertInv12(name: string, src: string, stripped: string): void {
  const visLines = stripped.split('\n');
  const { code, ok } = codeLineIndices(src, visLines);
  assert.ok(ok, name + ': fence-label mapping incomplete (a fence label was not found)');
  visLines.forEach((v, i) => {
    if (code.has(i)) return; // code content: rendered as-is by contract, not markdown
    for (const re of RAW_MD) {
      assert.ok(!re.test(v), name + ': INV-1.2 raw syntax ' + re + ' in: ' + JSON.stringify(v));
    }
  });
}

test('golden: callout fixture — renders, INV-1.2 (code-aware), callout body present, no "> ["', () => {
  const { src, stripped } = render('vault_callout_note.md');
  assertInv12('callout', src, stripped);
  // The fixture's callout is titleless (`> [!IMPORTANT]`); per the renderer
  // contract a titleless callout drops the "TYPE — Title" line, so assert
  // on the callout body text instead.
  assert.ok(
    stripped.includes('The following decisions require explicit user confirmation'),
    'callout: callout body text missing',
  );
  assert.ok(!stripped.includes('> ['), 'callout: raw "> [" survived');
});

test('golden: wiki fixture — renders, INV-1.2, #tag styled (ANSI), no "[["', () => {
  const { src, raw, stripped } = render('vault_wiki_note.md');
  assertInv12('wiki', src, stripped);
  // frontmatter tags render as `#tag` painted with tag / tagChip color
  assert.ok(/\x1b\[[0-9;]*m\s*#(devops|local-inference|agent)/.test(raw), 'wiki: no ANSI-styled #tag found');
  assert.ok(!stripped.includes('[['), 'wiki: raw "[[" survived');
});

test('golden: daily-log fixture — renders, INV-1.2, H1 present', () => {
  const { src, stripped } = render('vault_daily_log.md');
  assertInv12('daily', src, stripped);
  assert.ok(stripped.includes('Daily Log — 29-Oct-2026'), 'daily: H1 text missing');
});

test('golden: vault fixtures dir holds exactly the 3 sanitized notes', () => {
  const files = readdirSync(root).sort();
  assert.deepEqual(files, ['vault_callout_note.md', 'vault_daily_log.md', 'vault_wiki_note.md']);
});
