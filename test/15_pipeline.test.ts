import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import type { RenderedDoc } from '../src/core/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const note = join(here, 'fixtures', 'obsidian_note.md');
const ctx = { root: join(here, 'fixtures', 'root'), width: 80, theme: DEFAULT_THEME, showFrontmatter: true };

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
  assert.deepEqual(doc.warnings, ['1 unresolved links']);
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
  assert.ok(vs.includes('│   body line'));
  assert.ok(vs.includes('▸ note: Present'));
  assert.ok(vs.some((l) => l.includes('⚠')));
  assert.ok(vs.some((l) => l.includes('#alpha')));
  assert.ok(vs.includes('A   B') || vs.some((l) => /^A\s+B$/.test(l)));
  assert.ok(vs.includes('1   2') || vs.some((l) => /^1\s+2$/.test(l)));
  assert.ok(vs.some((l) => l.startsWith('── js')));
});

test('src/core never imports ink (layering, INV-2.7)', () => {
  const files = readdirSync(join(here, '..', 'src', 'core')).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 5);
  for (const f of files) {
    const src = readFileSync(join(here, '..', 'src', 'core', f), 'utf8');
    assert.ok(!/from ['"]ink/.test(src), f + ' imports ink');
  }
});
