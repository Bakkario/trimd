import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectGfxMode,
  renderHalfBlockImage,
  encodeKittyPng,
  readPngDimensions,
  createFallbackPng,
} from '../src/core/media.js';
import { parseArgs } from '../src/core/config.js';
import { visibleWidth, stripAnsi } from '../src/core/renderer.js';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

test('detectGfxMode honors environment and overrides', () => {
  assert.equal(detectGfxMode({ NO_COLOR: '1' }), 'none');
  assert.equal(detectGfxMode({ TERM: 'dumb' }), 'none');
  assert.equal(detectGfxMode({}, 'none'), 'none');
  assert.equal(detectGfxMode({}, 'unicode'), 'halfblock');
  assert.equal(detectGfxMode({}, 'halfblock'), 'halfblock');
  assert.equal(detectGfxMode({}, 'kitty'), 'kitty');
  assert.equal(detectGfxMode({ KITTY_WINDOW_ID: '12' }), 'kitty');
  assert.equal(detectGfxMode({ TERM: 'xterm-kitty' }), 'kitty');
  assert.equal(detectGfxMode({ TERM_PROGRAM: 'ghostty' }), 'kitty');
  assert.equal(detectGfxMode({ TERM_PROGRAM: 'WezTerm' }), 'kitty');
  assert.equal(detectGfxMode({ TERM: 'xterm-256color' }), 'halfblock');
});

test('parseArgs accepts --gfx flag and validates options', () => {
  const p1 = parseArgs(['--gfx', 'kitty', 'doc.md']);
  assert.equal(p1.flags.gfx, 'kitty');
  const p2 = parseArgs(['--gfx=halfblock', 'doc.md']);
  assert.equal(p2.flags.gfx, 'halfblock');
  assert.throws(() => parseArgs(['--gfx', 'invalid']), /--gfx requires one of/);
});

test('readPngDimensions correctly reads sample-diagram.png', () => {
  const buf = readFileSync(join(process.cwd(), 'test/fixtures/sample-diagram.png'));
  const dims = readPngDimensions(buf);
  assert.ok(dims !== null, 'dimensions should not be null');
  assert.equal(dims?.width, 640);
  assert.equal(dims?.height, 180);
  assert.equal(readPngDimensions(Buffer.from('not a png')), null);
});

test('renderHalfBlockImage generates framed truecolor half-block rows', () => {
  const buf = readFileSync(join(process.cwd(), 'test/fixtures/sample-diagram.png'));
  const cols = 24;
  const rows = 6;
  const lines = renderHalfBlockImage(buf, cols, rows);
  // rows + top border + bottom border = 8 lines
  assert.equal(lines.length, rows + 2);
  assert.ok(lines[0].includes('╭') && lines[0].includes('╮'), 'top border present');
  assert.ok(lines[lines.length - 1].includes('╰') && lines[lines.length - 1].includes('╯'), 'bottom border present');
  assert.ok(lines[1].includes('▀'), 'contains halfblock character');
  assert.ok(lines[1].includes('\x1b[38;2;'), 'contains 24-bit foreground truecolor SGR');
  assert.ok(lines[1].includes('48;2;'), 'contains 24-bit background truecolor SGR');
  // visible width of frame rows should be cols + 2
  assert.equal(visibleWidth(lines[0]), cols + 2);
  assert.equal(visibleWidth(lines[1]), cols + 2);
});

test('encodeKittyPng generates base64 chunked APC sequences with correct visibleWidth', () => {
  const buf = readFileSync(join(process.cwd(), 'test/fixtures/sample-diagram.png'));
  const cols = 30;
  const rows = 8;
  const lines = encodeKittyPng(buf, cols, rows);
  assert.equal(lines.length, rows);
  // APC escape sequence is in line 0
  assert.ok(lines[0].includes('\x1b_G'), 'contains Kitty APC header');
  assert.ok(lines[0].includes('a=T,f=100'), 'contains Kitty control params');
  assert.ok(lines[0].includes('\x1b\\'), 'contains Kitty string terminator');
  // visibleWidth of each line must be exactly cols (APC control codes stripped)
  for (let r = 0; r < rows; r++) {
    assert.equal(visibleWidth(lines[r]), cols, `line ${r} visibleWidth should be ${cols}`);
  }
});

test('createFallbackPng creates a valid PNG buffer', () => {
  const buf = createFallbackPng('Sample Fallback');
  assert.ok(Buffer.isBuffer(buf), 'output is buffer');
  const dims = readPngDimensions(buf);
  assert.ok(dims !== null, 'dims of fallback png should be valid');
});

test('renderFile renders local and embed images in halfblock and kitty modes', () => {
  const testMdPath = join(process.cwd(), 'test/fixtures/temp_image_test.md');
  const mdContent = `
# Media Document

![Sample Diagram](sample-diagram.png)

![[sample-diagram.png]]
`;
  writeFileSync(testMdPath, mdContent, 'utf8');

  try {
    const root = join(process.cwd(), 'test/fixtures');

    // 1. Half-block mode
    const hbDoc = renderFile(testMdPath, {
      root,
      width: 60,
      theme: DEFAULT_THEME,
      showFrontmatter: false,
      gfx: 'halfblock',
    });
    const hbText = hbDoc.lines.map((l) => l.text).join('\n');
    assert.ok(hbText.includes('▣ Image: Sample Diagram'), 'contains image header');
    assert.ok(hbText.includes('▀'), 'renders halfblock character');
    assert.ok(hbText.includes('38;2;'), 'contains 24-bit fg truecolor code');

    // 2. Kitty mode
    const kittyDoc = renderFile(testMdPath, {
      root,
      width: 60,
      theme: DEFAULT_THEME,
      showFrontmatter: false,
      gfx: 'kitty',
    });
    const kittyText = kittyDoc.lines.map((l) => l.text).join('\n');
    assert.ok(kittyText.includes('\x1b_G'), 'contains Kitty APC escape sequence');
    assert.ok(kittyText.includes('a=T,f=100'), 'contains Kitty control params');

    // 3. None mode
    const noneDoc = renderFile(testMdPath, {
      root,
      width: 60,
      theme: DEFAULT_THEME,
      showFrontmatter: false,
      gfx: 'none',
    });
    const noneText = noneDoc.lines.map((l) => l.text).join('\n');
    assert.ok(!noneText.includes('▀'), 'no halfblocks in none mode');
    assert.ok(!noneText.includes('\x1b_G'), 'no Kitty APC in none mode');
  } finally {
    try {
      unlinkSync(testMdPath);
    } catch {
      // ignore
    }
  }
});
