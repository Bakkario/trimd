import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import type { RenderedDoc } from '../src/core/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const note = join(here, 'fixtures', 'obsidian_note.md');
const ctx = { root: join(here, 'fixtures', 'root'), width: 80, theme: DEFAULT_THEME, showFrontmatter: true, metaExpanded: true };

function visible(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;[^\]]*\\/g, '');
}

let doc: RenderedDoc;
test('renderFile on the fixture note', () => {
  doc = renderFile(note, ctx);
  assert.ok(doc.meta !== null);
  assert.equal(doc.meta!.valid, true);
  assert.equal((doc.meta!.data as Record<string, unknown>)['title'], 'Fixture Note');
  assert.deepEqual(doc.meta!.data, { title: 'Fixture Note', tags: ['alpha', 'beta/gamma'] });
  assert.equal(doc.title, 'Fixture Note');
  assert.deepEqual(doc.warnings, ['2 unresolved links']);
  assert.equal(doc.source, note);
});

test('INV-1.2: no raw markdown syntax on any line (ANSI stripped first)', () => {
  const bad = [
    /^\s*#{1,6}\s/,
    /\*\*/,
    /^\s*`{3,}/,
    /^\s*>\s?/,
    /\[[^\]\n]*\]\(/,
    /^\s*\|?\s*-{3,}/,
  ];
  for (const l of doc.lines) {
    const v = visible(l.text);
    for (const re of bad) {
      assert.ok(!re.test(v), 'raw syntax ' + re + ' in: ' + JSON.stringify(v));
    }
  }
});

test('fixture content actually rendered: meta header, callout, embed, ⚠, tag, table row, fence label', () => {
  const vs = doc.lines.map((l) => visible(l.text));
  assert.equal(vs[0], '── metadata ──');
  assert.ok(vs.includes('title: Fixture Note'));
  assert.ok(vs.some((l) => l.includes('#alpha') && l.includes('#beta/gamma')));
  assert.ok(vs.some((l) => l.includes('WARNING — Watch out')));
  assert.ok(vs.includes('┃   body line'));
  assert.ok(vs.includes('▸ note: Present'));
  assert.ok(vs.some((l) => l.includes('⚠')));
  assert.ok(vs.some((l) => l.includes('#alpha')));
  assert.ok(vs.some((l) => l.includes('│ A │ B │')));
  assert.ok(vs.some((l) => l.includes('│ 1 │ 2 │')));
  assert.ok(vs.some((l) => l.startsWith('── js')));
});

test('file:// links render as links, no raw [text](file://… (INV-1.2, ISSUE-004)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-15-'));
  const root = join(tmp, 'root');
  mkdirSync(root);
  const mdFile = join(root, 'a.md');
  writeFileSync(mdFile, 'x');
  const txtFile = join(root, 'b.txt');
  writeFileSync(txtFile, 'x');
  const noteFile = join(root, 'note.md');
  writeFileSync(noteFile, '[t](file://' + mdFile + ') [o](file://' + txtFile + ') [m](file://' + join(root, 'missing.md') + ')\n');
  const d = renderFile(noteFile, { root, width: 200, theme: DEFAULT_THEME, showFrontmatter: false });
  for (const l of d.lines) {
    const v = visible(l.text);
    assert.ok(!/\[[^\]\n]*\]\(/.test(v), 'raw link syntax in: ' + JSON.stringify(v));
  }
  const spans = d.lines.flatMap((l) => l.links);
  assert.equal(spans.length, 2, 'only the two existing targets are clickable');
  assert.ok(spans.some((s) => s.href === mdFile && s.kind === 'file'), '.md target → in-app span');
  assert.ok(spans.some((s) => s.href === 'file://' + txtFile && s.kind === 'http'), 'non-md target → http span with file:// href');
  assert.deepEqual(d.warnings, ['1 unresolved links'], 'missing file:// link counted in warnings');
  rmSync(tmp, { recursive: true, force: true });
});

test('src/core never imports ink (layering, INV-2.7)', () => {
  const files = readdirSync(join(here, '..', 'src', 'core')).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 5);
  for (const f of files) {
    const src = readFileSync(join(here, '..', 'src', 'core', f), 'utf8');
    assert.ok(!/from ['"]ink/.test(src), f + ' imports ink');
  }
});
