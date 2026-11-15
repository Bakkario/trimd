import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

process.env.FORCE_COLOR = '1';

const { AUTO_LANGUAGE_SUBSET, highlightAuto } = await import('../src/core/highlight.js');

test('AUTO_LANGUAGE_SUBSET includes >= 20 common languages', () => {
  assert.ok(AUTO_LANGUAGE_SUBSET.length >= 20, `expected >= 20 languages, got ${AUTO_LANGUAGE_SUBSET.length}`);
  for (const lang of ['bash', 'javascript', 'typescript', 'python', 'json', 'rust', 'go', 'sql']) {
    assert.ok(AUTO_LANGUAGE_SUBSET.includes(lang), `missing ${lang} in AUTO_LANGUAGE_SUBSET`);
  }
});

test('highlightAuto: shebang shortcut highlights bash in < 25ms', () => {
  const snippet = '#!/usr/bin/env bash\ncat SAMPLE.md | trimd --theme tokyo-night';
  const t0 = performance.now();
  const out = highlightAuto(snippet);
  const elapsed = performance.now() - t0;
  assert.ok(out.includes('\x1b['), 'shebang bash must emit SGR escapes');
  assert.ok(elapsed < 25, `expected shebang highlight < 25ms, took ${elapsed.toFixed(1)}ms`);
});

test('highlightAuto: cold subset auto-detect < 80ms and warm cache < 2ms', () => {
  const pyCode = 'def compute(x):\n    return x * 2\n';
  const t0 = performance.now();
  const cold = highlightAuto(pyCode);
  const coldMs = performance.now() - t0;
  assert.ok(cold.includes('\x1b['), 'python snippet must emit SGR escapes');
  assert.ok(coldMs < 120, `expected cold subset highlightAuto < 120ms, took ${coldMs.toFixed(1)}ms`);

  const t1 = performance.now();
  const warm = highlightAuto(pyCode);
  const warmMs = performance.now() - t1;
  assert.equal(warm, cold, 'warm cache must return identical output');
  assert.ok(warmMs < 2, `expected warm cache hit < 2ms, took ${warmMs.toFixed(3)}ms`);
});

test('highlightAuto: prose stays plain and empty/whitespace short-circuits', () => {
  assert.equal(highlightAuto('hello world'), 'hello world');
  assert.equal(highlightAuto(''), '');
  assert.equal(highlightAuto('   \n  '), '   \n  ');
});
