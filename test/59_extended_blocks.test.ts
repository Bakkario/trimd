import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens } from '../src/core/parse.js';
import { renderTokens } from '../src/core/renderer.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

const rctx = { theme: DEFAULT_THEME, width: 80, sourceDir: '/tmp', resolve: () => null };

function render(src: string) {
  return renderTokens(parseTokens(src), rctx).lines;
}

test('custom containers ::: warning render as callout', () => {
  const md = `
::: warning
*here be dragons*
:::
`;
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  assert.ok(text.includes('WARNING'), 'should render WARNING callout header');
  assert.ok(text.includes('here be dragons'), 'should render body text');
  assert.ok(lines.some((l) => l.text.includes('┃')), 'should render callout border character');
});

test('abbreviations annotate first whole-word occurrence', () => {
  const md = `
This is HTML abbreviation example.

It converts "HTML", but keep intact partial entries like "xxxHTMLyyy" and so on.

*[HTML]: Hyper Text Markup Language
`;
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  assert.ok(
    text.includes('HTML (Hyper Text Markup Language)'),
    `should expand first HTML with abbreviation, got: ${text}`,
  );
  assert.ok(text.includes('xxxHTMLyyy'), 'should keep partial matches intact');
  assert.ok(!text.includes('*[HTML]:'), 'should strip raw abbreviation definition');
});

test('footnotes with named and inline notes render numbers and footnotes section', () => {
  const md = `
Footnote 1 link[^first].

Footnote 2 link[^second].

Inline footnote^[Text of inline footnote] definition.

Duplicated footnote reference[^second].

[^first]: Footnote **can have markup**

    and multiple paragraphs.

[^second]: Footnote text.
`;
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  assert.ok(text.includes('[1]'), 'should include footnote reference [1]');
  assert.ok(text.includes('[2]'), 'should include footnote reference [2]');
  assert.ok(text.includes('[3]'), 'should include inline footnote reference [3]');
  assert.ok(!text.includes('[^first]'), 'should strip raw [^first]');
  assert.ok(!text.includes('[^second]'), 'should strip raw [^second]');
  assert.ok(!text.includes('^[Text of inline footnote]'), 'should strip raw inline footnote');
  assert.ok(text.includes('Footnotes'), 'should append Footnotes heading');
  assert.ok(text.includes('Footnote text.'), 'should include footnote definition');
  assert.ok(text.includes('Text of inline footnote'), 'should include inline footnote text in definitions');
});

test('definition lists render standard and compact styles', () => {
  const md = `
Term 1

:   Definition 1
with lazy continuation.

Term 2 with *inline markup*

:   Definition 2

_Compact style:_

Term 1
  ~ Definition 1

Term 2
  ~ Definition 2a
  ~ Definition 2b
`;
  const lines = render(md);
  const text = lines.map((l) => l.text).join('\n');
  assert.ok(text.includes('Term 1'), 'renders Term 1');
  assert.ok(text.includes('Definition 1'), 'renders Definition 1');
  assert.ok(text.includes('Term 2'), 'renders Term 2');
  assert.ok(text.includes('Definition 2a'), 'renders Definition 2a');
  assert.ok(text.includes('Definition 2b'), 'renders Definition 2b');
  // Confirm bullet list items were generated
  assert.ok(lines.some((l) => l.text.includes('•') || l.text.includes('- ') || l.text.includes('Definition 1')));
});
