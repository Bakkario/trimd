import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens } from '../src/core/renderer.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null };

function render(src: string) {
  return renderTokens(parseTokens(src), rctx).lines;
}

test('inline LaTeX math converts symbols and superscripts', () => {
  const md = "Euler's identity $e^{i\\pi} + 1 = 0$ and implications $\\alpha \\to \\beta \\implies \\gamma \\le \\delta \\neq \\infty$.";
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  assert.ok(text.includes('eⁱπ + 1 = 0'), `expected eⁱπ + 1 = 0, got: ${text}`);
  assert.ok(text.includes('α → β ⇒ γ ≤ δ ≠ ∞'), `expected unicode symbols, got: ${text}`);
  assert.ok(!text.includes('$'), 'zero raw $ delimiters survive');
  assert.ok(!text.includes('\\alpha'), 'zero raw LaTeX commands survive');
});

test('math inside table cells converts cleanly', () => {
  const md = `
| Symbol | Meaning | Identity |
| :--- | :--- | :--- |
| $\\alpha \\rightarrow \\beta$ | Arrow | $\\sum_{k=1}^n k$ |
`;
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
  assert.ok(clean.includes('α → β'), `expected α → β in table cell, got: ${clean}`);
  assert.ok(clean.includes('∑'), `expected summation symbol, got: ${clean}`);
  assert.ok(!clean.includes('\\rightarrow'), 'zero raw \\rightarrow survives');
  assert.ok(!clean.includes('$'), 'zero raw $ survives in table');
});

test('display math block $$ ... $$ converts to math fence with unicode', () => {
  const md = `
$$
\\sum_{i=1}^{n} x_i = \\int_{0}^{1} f(x)\\,dx
$$
`;
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  assert.ok(text.includes('── math ──'), `expected math header, got: ${text}`);
  assert.ok(text.includes('∑'), `expected summation symbol, got: ${text}`);
  assert.ok(text.includes('∫'), `expected integral symbol, got: ${text}`);
  assert.ok(text.includes('xᵢ'), `expected subscript xᵢ, got: ${text}`);
  assert.ok(!text.includes('\\sum'), 'zero raw \\sum survives');
  assert.ok(!text.includes('$$'), 'zero raw $$ survives');
});

test('code fence ```math blocks convert latex to unicode', () => {
  const md = `
\`\`\`math
\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}
\`\`\`
`;
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  assert.ok(text.includes('∇ × 𝐄'), `expected ∇ × 𝐄, got: ${text}`);
  assert.ok(text.includes('∂ 𝐁'), `expected ∂ 𝐁, got: ${text}`);
  assert.ok(!text.includes('\\nabla'), 'zero raw \\nabla survives');
});
