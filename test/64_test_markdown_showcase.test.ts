import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { renderFile } from '../src/core/pipeline.js';
import { TOKYO_NIGHT_THEME } from '../src/core/themes.js';
import { stripAnsi } from '../src/core/renderer.js';

test('Comprehensive test_markdown.md showcase verification (Task 13.3, D-4.7)', async (t) => {
  const root = process.cwd();
  const filePath = resolve(root, 'test_markdown.md');

  await t.test('Frontmatter & Title rendering', () => {
    const doc = renderFile(filePath, {
      root,
      width: 80,
      theme: TOKYO_NIGHT_THEME,
      showFrontmatter: true,
      gfx: 'unicode',
    });

    assert.equal(doc.meta?.valid, true, 'frontmatter meta valid');
    assert.equal(doc.title, 'Trimd Production Go/No-Go Showcase', 'extracted doc title');

    const fullText = doc.lines.map((l) => l.text).join('\n');
    const plain = stripAnsi(fullText);

    assert.ok(plain.includes('SHOWCASE'), 'renders compact SHOWCASE pill');
    assert.ok(plain.includes('#markdown'), 'renders #markdown tag chip');
    assert.ok(plain.includes('#latex'), 'renders #latex tag chip');
    assert.ok(plain.includes('#kitty'), 'renders #kitty tag chip');
  });

  await t.test('Headings & Typographic replacements', () => {
    const doc = renderFile(filePath, {
      root,
      width: 80,
      theme: TOKYO_NIGHT_THEME,
      showFrontmatter: false,
      gfx: 'unicode',
    });

    const plain = stripAnsi(doc.lines.map((l) => l.text).join('\n'));
    assert.ok(plain.includes('Heading 😎'), 'typographer converts 8-) to 😎 in h1 heading');
    assert.ok(plain.includes('©') && plain.includes('®') && plain.includes('™') && plain.includes('±'), 'converts (c), (r), (tm), +- symbols');
  });

  await t.test('Tables: rounded borders, alignments, and zero raw pipes in table rows (INV-1.2)', () => {
    const doc = renderFile(filePath, {
      root,
      width: 80,
      theme: TOKYO_NIGHT_THEME,
      showFrontmatter: false,
      gfx: 'unicode',
    });

    const plainLines = doc.lines.map((l) => stripAnsi(l.text));
    const tblStart = plainLines.findIndex((l) => l.includes('Tables'));
    assert.ok(tblStart >= 0, 'found Tables section');
    const linksStart = plainLines.findIndex((l) => l.includes('Links'));
    const tableSectionLines = plainLines.slice(tblStart, linksStart);

    // Filter to lines that belong to table drawing
    const tableLines = tableSectionLines.filter(
      (l) => l.includes('╭') || l.includes('├') || l.includes('╰') || l.includes('Option') || l.includes('data'),
    );

    assert.ok(tableLines.some((l) => l.includes('╭────────┬─────────')), 'renders rounded top border');
    assert.ok(tableLines.some((l) => l.includes('├────────┼─────────')), 'renders rounded middle separator');
    assert.ok(tableLines.some((l) => l.includes('╰────────┴─────────')), 'renders rounded bottom border');

    // Right-aligned column check: 'data' should be right-padded/aligned inside cell
    assert.ok(tableLines.some((l) => l.includes('│   data │')), 'right-aligned cell is right-aligned');

    // None of the table border lines should contain raw '|' pipes
    for (const tl of tableLines) {
      assert.ok(!tl.includes('|'), `table line must not contain raw pipe: ${tl}`);
    }
  });

  await t.test('Extended Markdown plugins: emojis, sup, sub, ins, mark, footnotes, deflists, abbr, containers', () => {
    const doc = renderFile(filePath, {
      root,
      width: 80,
      theme: TOKYO_NIGHT_THEME,
      showFrontmatter: false,
      gfx: 'unicode',
    });

    const plain = stripAnsi(doc.lines.map((l) => l.text).join('\n'));

    // Emojis
    assert.ok(plain.includes('😉') && plain.includes('😢') && plain.includes('😆') && plain.includes('😋'), 'emojis rendered');

    // Superscript & Subscript
    assert.ok(plain.includes('19ᵗʰ'), 'superscript 19ᵗʰ rendered');
    assert.ok(plain.includes('H₂O'), 'subscript H₂O rendered');

    // Ins and Mark
    assert.ok(plain.includes('Inserted text'), 'inserted text rendered');
    assert.ok(plain.includes('Marked text'), 'marked text rendered');

    // Footnotes
    assert.ok(plain.includes('[1]'), 'footnote [1] reference rendered');
    assert.ok(plain.includes('Footnotes'), 'Footnotes section header rendered');
    assert.ok(!plain.includes('[^first]'), 'no raw [^first] footnote markers');

    // Definition lists
    assert.ok(plain.includes('Term 1') && plain.includes('Definition 1'), 'definition list rendered');

    // Abbreviations
    assert.ok(plain.includes('HTML'), 'abbreviations rendered');

    // Custom containers ::: warning
    assert.ok(plain.includes('! WARNING') && plain.includes('here be dragons'), 'custom container rendered as callout surface');
  });

  await t.test('LaTeX Math: inline and block expressions with Unicode symbols and zero raw $ delimiters', () => {
    const doc = renderFile(filePath, {
      root,
      width: 80,
      theme: TOKYO_NIGHT_THEME,
      showFrontmatter: false,
      gfx: 'unicode',
    });

    const plainLines = doc.lines.map((l) => stripAnsi(l.text));
    const mathIdx = plainLines.findIndex((l) => l.includes('LaTeX & Mathematical Expressions'));
    assert.ok(mathIdx >= 0, 'found LaTeX section');
    const mermaidIdx = plainLines.findIndex((l) => l.includes('Mermaid Diagrams'));
    const mathText = plainLines.slice(mathIdx, mermaidIdx).join('\n');

    // Unicode math symbols rendered
    assert.ok(mathText.includes('α → β ⇒ γ ≤ δ ≠ ∞'), 'renders Greek and arrow symbols');
    assert.ok(mathText.includes('eⁱπ + 1 = 0') || mathText.includes('e^{iπ}'), 'renders Euler identity');
    assert.ok(mathText.includes('∑'), 'renders summation symbol');
    assert.ok(mathText.includes('∫'), 'renders integral symbol');
    assert.ok(mathText.includes('∇'), 'renders nabla gradient symbol');

    // Display math lines must not contain raw '$' delimiters
    const displayMathLine = plainLines.find((l) => l.includes('∑') && l.includes('∫'));
    assert.ok(displayMathLine, 'found display math line');
    assert.ok(!displayMathLine.includes('$'), 'no raw $ delimiter in display math');
  });

  await t.test('Mermaid & Images in kitty mode: emits Kitty APC graphics payload', () => {
    const doc = renderFile(filePath, {
      root,
      width: 80,
      theme: TOKYO_NIGHT_THEME,
      showFrontmatter: false,
      gfx: 'kitty',
    });

    const fullRaw = doc.lines.map((l) => l.text).join('\n');

    // Kitty PNG graphics sequence
    assert.ok(fullRaw.includes('\x1b_Ga=T,f=100'), 'emitted Kitty APC graphics sequence');

    // Must have multiple graphic payloads (one for sample-diagram.png, one for mermaid flowchart)
    const kittyOccurrences = fullRaw.split('\x1b_Ga=T,f=100').length - 1;
    assert.ok(kittyOccurrences >= 2, `expected at least 2 Kitty graphics payloads, got ${kittyOccurrences}`);
  });

  await t.test('Obsidian Dialect: resolved/unresolved wikilinks, embeds, tags, checkboxes', () => {
    const doc = renderFile(filePath, {
      root,
      width: 80,
      theme: TOKYO_NIGHT_THEME,
      showFrontmatter: false,
      gfx: 'unicode',
    });

    const plain = stripAnsi(doc.lines.map((l) => l.text).join('\n'));

    // Resolved link
    assert.ok(plain.includes('README'), 'contains resolved link README');

    // Unresolved link with dim warning icon
    assert.ok(plain.includes('NonExistent_Future_Spec') && plain.includes('⚠'), 'unresolved link has ⚠ warning');

    // Note embed
    assert.ok(plain.includes('00_Project_Charter'), 'embeds 00_Project_Charter note');

    // Image embed
    assert.ok(plain.includes('sample-diagram.png'), 'embeds sample-diagram.png');

    // Tag chip
    assert.ok(plain.includes('#obsidian/vault'), 'renders #obsidian/vault tag');

    // Task list checkboxes
    assert.ok(plain.includes('✔') && plain.includes('☐'), 'renders ✔ and ☐ task checkboxes');
  });
});
