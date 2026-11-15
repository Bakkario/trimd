import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  kittyImageId,
  encodeKittyPng,
  encodeKittyPlace,
  renderInlineImageRows,
} from '../src/core/media.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import { visibleWidth } from '../src/core/renderer.js';

test('ISSUE-031: kittyImageId returns deterministic positive 31-bit integer', () => {
  const id1 = kittyImageId('/tmp/a.png');
  const id2 = kittyImageId('/tmp/a.png');
  const id3 = kittyImageId('/tmp/b.png');
  assert.equal(id1, id2);
  assert.notEqual(id1, id3);
  assert.ok(id1 >= 1 && id1 <= 0x7fffffff);
});

test('ISSUE-031: encodeKittyPng with imageId emits i=<id>,p=1 and encodeKittyPlace emits compact a=p', () => {
  const buf = readFileSync(join(process.cwd(), 'test/fixtures/sample-diagram.png'));
  const id = kittyImageId('sample-diagram.png');
  const rows = encodeKittyPng(buf, 40, 8, {}, id);
  assert.equal(rows.length, 8);
  assert.ok(rows[0].includes(`a=T,f=100,i=${id},p=1,c=40,r=8,C=1,q=2`), 'includes image id and placement id');
  assert.equal(visibleWidth(rows[0]), 40);

  const place = encodeKittyPlace(id, 40, 8, {});
  assert.equal(place, `\x1b_Ga=p,i=${id},p=1,c=40,r=8,C=1,q=2\x1b\\`);
  assert.ok(place.length < 64, 'placement-only command is tiny');

  const tmuxPlace = encodeKittyPlace(id, 40, 8, { TMUX: '/tmp/tmux-1000/default,1,0' });
  assert.ok(tmuxPlace.startsWith('\x1bPtmux;\x1b\x1b_Ga=p,'));
  assert.ok(tmuxPlace.endsWith('\x1b\\\x1b\\'));
});

test('ISSUE-031: renderInlineImageRows caps Kitty image dimensions to 54 cols and 6-14 rows', () => {
  const imgPath = join(process.cwd(), 'test/fixtures/sample-diagram.png');
  const rows = renderInlineImageRows(imgPath, 120, 'kitty', DEFAULT_THEME);
  assert.ok(rows.length >= 6 && rows.length <= 14, `expected 6..14 rows, got ${rows.length}`);
  assert.equal(visibleWidth(rows[0]), 54, 'expected max 54 cols');
  assert.ok(rows[0].includes(',i='), 'kitty image rows include deterministic image id');
});
