import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { stripAnsi, visibleWidth } from '../src/core/renderer.js';

test('stripAnsi and visibleWidth handle plain ASCII, SGR, OSC 8, Kitty APC, tmux DCS, CJK, emojis, and VS16', () => {
  assert.equal(stripAnsi('plain ascii'), 'plain ascii');
  assert.equal(visibleWidth('plain ascii'), 11);

  assert.equal(visibleWidth('\x1b[1;38;5;39mhello\x1b[0m'), 5);
  assert.equal(visibleWidth('\x1b]8;url=https://example.com\x1b\\link\x1b]8;;\x1b\\'), 4);
  assert.equal(visibleWidth('\x1b_Ga=T,f=100,c=10,r=4;AAAA\x1b\\   '), 3);
  assert.equal(visibleWidth('\x1bPtmux;\x1b\x1b_Ga=p,i=1,p=1;\x1b\\\x1b\\ok'), 2);

  assert.equal(visibleWidth('日本語'), 6);
  assert.equal(visibleWidth('😎🚀'), 4);
  assert.equal(visibleWidth('✔ ☐ ⚠'), 5);
  assert.equal(visibleWidth('⚠\ufe0f'), 2);
});

test('visibleWidth: 10,000 mixed ASCII/ANSI calls complete in < 50ms', () => {
  const samples = [
    '  1 │ const x = 42; // plain line',
    '\x1b[38;2;122;162;247m▌ Heading 2\x1b[0m',
    '\x1b]8;url=file:///tmp/a.md\x1b\\\x1b[38;5;39mNote\x1b[0m\x1b]8;;\x1b\\',
    '  ✔ Task item with emoji 🚀',
  ];
  // Warmup
  for (const s of samples) visibleWidth(s);

  const t0 = performance.now();
  let sum = 0;
  for (let i = 0; i < 10_000; i++) {
    sum += visibleWidth(samples[i & 3]);
  }
  const elapsed = performance.now() - t0;
  assert.ok(sum > 0);
  assert.ok(elapsed < 50, `expected 10,000 visibleWidth calls < 50ms, took ${elapsed.toFixed(1)}ms`);
});

test('dist/trimd.js stays under 2.5 MB bundle budget', () => {
  const size = statSync(join(process.cwd(), 'dist', 'trimd.js')).size;
  assert.ok(size < 2.5 * 1024 * 1024, `expected dist/trimd.js < 2.5 MB, got ${(size / 1024 / 1024).toFixed(2)} MB`);
});
