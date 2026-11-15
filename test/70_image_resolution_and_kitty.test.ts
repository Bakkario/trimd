import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import { visibleWidth, wrapLines, stripAnsi } from '../src/core/renderer.js';
import { renderInlineImageRows, encodeKittyPng } from '../src/core/media.js';
import { sliceAnsiByCols } from '../src/core/overlay.js';

test('ISSUE-028: relative subpath image resolves against sourceDir', () => {
  const testMd = join(process.cwd(), 'test_markdown.md');
  const doc = renderFile(testMd, {
    root: process.cwd(),
    width: 80,
    theme: DEFAULT_THEME,
    showFrontmatter: false,
    gfx: 'halfblock',
  });
  const text = doc.lines.map((l) => l.text).join('\n');
  // test_markdown.md line 150 has ![Trimd Kitty Pipeline](test/fixtures/sample-diagram.png)
  assert.ok(text.includes('▣ Image: Trimd Kitty Pipeline (test/fixtures/sample-diagram.png)'), 'image label present');
  const imageLabelLine = doc.lines.find((l) => l.text.includes('Trimd Kitty Pipeline'));
  assert.ok(imageLabelLine, 'label line found');
  assert.ok(!stripAnsi(imageLabelLine.text).includes('⚠'), 'relative subpath image must not show unresolved warning ⚠');
  assert.ok(imageLabelLine.links.some((s) => s.resolved && s.href.endsWith('test/fixtures/sample-diagram.png')), 'image link resolved');
});

test('ISSUE-028: halfblock renderInlineImageRows uses proportional dimensions (up to 54 cols, 6-14 rows)', () => {
  const imgPath = join(process.cwd(), 'test/fixtures/sample-diagram.png');
  const rows = renderInlineImageRows(imgPath, 100, 'halfblock', DEFAULT_THEME);
  // Top border + >= 6 pixel rows + bottom border => >= 8 lines
  assert.ok(rows.length >= 8, `expected >= 8 halfblock rows (border + >=6), got ${rows.length}`);
  assert.equal(visibleWidth(rows[0]), 56, 'expected 54 cols + 2 border cols = 56');
});

test('ISSUE-028: wrapLines and sliceAnsiByCols preserve Kitty APC and tmux passthrough sequences intact', () => {
  const buf = readFileSync(join(process.cwd(), 'test/fixtures/sample-diagram.png'));
  const kittyRows = encodeKittyPng(buf, 40, 8, {});
  // Force wrapLines to run by putting extra visible text past width=30
  const lineWithApc = { text: kittyRows[0] + ' hello world extra', links: [] };
  const wrapped = wrapLines([lineWithApc], 30);
  const joined = wrapped.map((l) => l.text).join('\n');
  assert.ok(joined.includes('\x1b_Ga=T,f=100,c=40,r=8,C=1,q=2'), 'Kitty APC header preserved across wrapLines');
  assert.ok(joined.includes('\x1b\\'), 'Kitty APC terminator preserved');

  // Tmux passthrough
  const tmuxRows = encodeKittyPng(buf, 40, 8, { TMUX: '/tmp/tmux-1000/default,1,0' });
  assert.equal(visibleWidth(tmuxRows[0]), 40, 'tmux-wrapped Kitty row visibleWidth must equal cols');
  const sliced = sliceAnsiByCols(tmuxRows[0] + 'abc', 10);
  assert.ok(sliced.includes('\x1bPtmux;\x1b\x1b_G'), 'sliceAnsiByCols preserves tmux passthrough');
  assert.equal(visibleWidth(sliced), 10, 'sliced visibleWidth equals endCols');
});
