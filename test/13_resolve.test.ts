import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIndex, makeResolver, listEntries } from '../src/core/resolve.js';

const root = mkdtempSync(join(tmpdir(), 'trimd-24-'));
after(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, content = 'x'): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}

put('Note.md');
put('exact.md');
put('Exact.md');
put('Case.md');
put('sub/Deep.md');
put('.obsidian/config.md');
put('.git/HEAD.md');
put('.hidden/secret.md');
put('plain.txt');
put('sub/deep2/deeper/note.md');

const idx = buildIndex(root, false);
const resolve = makeResolver(idx);

test('exact > case-insensitive > stem precedence', () => {
  assert.equal(resolve('exact.md'), join(root, 'exact.md')); // exact beats case fold to Exact.md
  assert.equal(resolve('Exact.md'), join(root, 'Exact.md'));
  assert.equal(resolve('case.MD'), join(root, 'Case.md')); // ci
  assert.equal(resolve('Case'), join(root, 'Case.md')); // stem
  assert.equal(resolve('note'), join(root, 'Note.md')); // stem of basename
});

test('#section stripped before resolution', () => {
  assert.equal(resolve('Note#Section'), join(root, 'Note.md'));
  assert.equal(resolve('Deep#Heading'), join(root, 'sub/Deep.md'));
});

test('.obsidian / .git excluded always; hidden dir excluded unless showHidden', () => {
  assert.equal(resolve('config'), null);
  assert.equal(resolve('HEAD'), null);
  assert.equal(resolve('secret'), null);
  const idxHidden = buildIndex(root, true);
  assert.equal(makeResolver(idxHidden)('secret'), join(root, '.hidden/secret.md'));
});

test('deep files indexed; non-md not indexed', () => {
  assert.equal(resolve('deeper/note') ?? null, null); // target never includes dirs
  assert.equal(resolve('note'), join(root, 'Note.md')); // first writer wins over sub/deep2/deeper/note.md
  assert.equal(resolve('plain'), null);
});

test('listEntries: dirs first, sorted base-insensitive, .md only, full names', () => {
  mkdirSync(join(root, 'b-dir'), { recursive: true });
  mkdirSync(join(root, 'A-dir'), { recursive: true });
  put('zeta.md');
  put('Alpha.md');
  put('notes.markdown');
  const es = listEntries(root, false);
  const names = es.map((e) => e.name);
  assert.deepEqual(names.slice(0, 2), ['A-dir', 'b-dir']);
  const files = es.filter((e) => !e.isDir).map((e) => e.name);
  assert.deepEqual(files, ['Alpha.md', 'Case.md', 'Exact.md', 'exact.md', 'Note.md', 'zeta.md']);
  for (const e of es) {
    assert.equal(e.abs, join(root, e.name));
    if (e.name === 'zeta.md') assert.equal(e.isDir, false);
  }
  assert.ok(!names.includes('.obsidian') && !names.includes('.git') && !names.includes('.hidden'));
  assert.ok(!files.includes('plain.txt') && !files.includes('notes.markdown'));
  assert.ok(names.includes('zeta.md'), 'no truncation: caller truncates, entries carry full names');
});
