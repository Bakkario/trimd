import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMermaidBlock } from '../src/core/media.js';
import { DEFAULT_THEME, PLAIN_THEME, TOKYO_NIGHT_THEME } from '../src/core/themes.js';
import { stripAnsi } from '../src/core/renderer.js';

test('ISSUE-029: flowchart LR renders Unicode box-and-arrow diagram in halfblock and kitty modes', () => {
  const src = `flowchart LR
  A[Markdown] -->|parse| B(Tokens) --> C{Render}`;
  for (const gfx of ['halfblock', 'kitty', 'unicode'] as const) {
    const rows = renderMermaidBlock(src, 80, gfx, TOKYO_NIGHT_THEME);
    assert.ok(rows.length >= 3, `${gfx}: expected >= 3 rows`);
    const plain = stripAnsi(rows.join('\n'));
    assert.ok(plain.includes('╭') && plain.includes('╰'), `${gfx}: rounded Unicode boxes present`);
    assert.ok(plain.includes('Markdown') && plain.includes('Tokens') && plain.includes('Render'), `${gfx}: all node labels present`);
    assert.ok(plain.includes('parse') && plain.includes('▶'), `${gfx}: edge label and arrow present`);
  }
});

test('ISSUE-029: flowchart TD renders vertical boxes and downward arrows', () => {
  const src = `graph TD
  Start[Input] -- read --> Mid[AST] --> Out[Terminal]`;
  const rows = renderMermaidBlock(src, 60, 'halfblock', DEFAULT_THEME);
  const plain = stripAnsi(rows.join('\n'));
  assert.ok(plain.includes('Input') && plain.includes('AST') && plain.includes('Terminal'), 'all TD nodes present');
  assert.ok(plain.includes('read'), 'edge label present');
  assert.ok(plain.includes('▼'), 'downward arrow present');
});

test('ISSUE-029: sequenceDiagram renders participant boxes, lifelines, and message arrows', () => {
  const src = `sequenceDiagram
  participant U as User
  participant T as Trimd
  U->>T: Open note
  T-->>U: Render ANSI`;
  const rows = renderMermaidBlock(src, 80, 'halfblock', TOKYO_NIGHT_THEME);
  const plain = stripAnsi(rows.join('\n'));
  assert.ok(plain.includes('User') && plain.includes('Trimd'), 'participants rendered');
  assert.ok(plain.includes('│'), 'lifelines rendered');
  assert.ok(plain.includes('Open note') && plain.includes('▶'), 'forward message arrow rendered');
  assert.ok(plain.includes('Render ANSI') && plain.includes('◀'), 'return message arrow rendered');
});

test('ISSUE-029: mermaid returns empty when gfx is none or theme is plain', () => {
  const src = 'graph LR\n  A --> B';
  assert.deepEqual(renderMermaidBlock(src, 80, 'none', DEFAULT_THEME), []);
  assert.deepEqual(renderMermaidBlock(src, 80, 'halfblock', PLAIN_THEME), []);
});
