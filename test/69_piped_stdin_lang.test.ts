import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from '../src/core/config.js';
import { DEFAULT_THEME, PLAIN_THEME } from '../src/core/themes.js';
import { UsageError } from '../src/core/types.js';

process.env.FORCE_COLOR = '3';
const { resolveInputFormat } = await import('../src/core/highlight.js');
const { renderFile, renderText } = await import('../src/core/pipeline.js');

function stripSgr(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

test('parseArgs accepts --lang flag and rejects empty --lang', () => {
  const p1 = parseArgs(['--lang', 'py']);
  assert.strictEqual(p1.file, null);
  assert.strictEqual(p1.flags.lang, 'py');

  const p2 = parseArgs(['--lang=text', '-']);
  assert.strictEqual(p2.file, '-');
  assert.strictEqual(p2.flags.lang, 'text');

  assert.throws(() => parseArgs(['--lang', '   ']), UsageError);
});

test('resolveInputFormat honors --lang override, O(1) extensions, shebang, markdown, and text fallback', () => {
  // 1. Explicit --lang always wins
  assert.deepStrictEqual(resolveInputFormat('print(1)', '/tmp/a.md', 'py'), { kind: 'code', lang: 'python' });
  assert.deepStrictEqual(resolveInputFormat('# Title', '/tmp/a.py', 'md'), { kind: 'markdown' });
  assert.deepStrictEqual(resolveInputFormat('const x = 1;', '/tmp/a.js', 'text'), { kind: 'text' });

  // 2. File extension lookup (O(1))
  assert.deepStrictEqual(resolveInputFormat('', '/tmp/app.py'), { kind: 'code', lang: 'python' });
  assert.deepStrictEqual(resolveInputFormat('', '/tmp/index.ts'), { kind: 'code', lang: 'typescript' });
  assert.deepStrictEqual(resolveInputFormat('', '/tmp/data.json'), { kind: 'code', lang: 'json' });
  assert.deepStrictEqual(resolveInputFormat('', '/tmp/notes.md'), { kind: 'markdown' });
  assert.deepStrictEqual(resolveInputFormat('', '/tmp/readme.txt'), { kind: 'text' });
  assert.deepStrictEqual(resolveInputFormat('', '/tmp/Dockerfile'), { kind: 'code', lang: 'dockerfile' });

  // 3. Piped stdin (<stdin>) sampled detection
  assert.deepStrictEqual(
    resolveInputFormat('#!/usr/bin/env python3\nprint("hi")\n', '<stdin>'),
    { kind: 'code', lang: 'python' },
  );
  assert.deepStrictEqual(
    resolveInputFormat('# Heading\n\nSee [docs](https://example.com).\n', '<stdin>'),
    { kind: 'markdown' },
  );
  assert.deepStrictEqual(
    resolveInputFormat('import fs from "node:fs";\nconst count = 42;\nfunction greet(name) {\n  return `Hello ${name}`;\n}\n', '<stdin>'),
    { kind: 'code', lang: 'auto' },
  );
  assert.deepStrictEqual(
    resolveInputFormat('hello world', '<stdin>'),
    { kind: 'text' },
  );
});

test('renderFile & renderText syntax-highlight Python/JS without treating # comments as Markdown H1', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-69-'));
  try {
    const pyPath = join(tmp, 'script.py');
    writeFileSync(pyPath, '# Python comment\ndef greet(name):\n    return f"hi {name}"\n');
    const pyDoc = renderFile(pyPath, {
      root: tmp,
      width: 80,
      theme: DEFAULT_THEME,
      showFrontmatter: true,
    });
    const plainLines = pyDoc.lines.map((l) => stripSgr(l.text));
    assert.ok(plainLines[0].includes('1 │ # Python comment'), 'Python # comment preserved literally with line number');
    assert.ok(/\x1b\[[0-9;]*m/.test(pyDoc.lines[1].text), 'Python def line is syntax-highlighted');

    // Plain text fallback emits no syntax highlighting on body
    const txtDoc = renderText('# Not a heading\nplain text line', '<stdin>', {
      root: tmp,
      width: 80,
      theme: DEFAULT_THEME,
      showFrontmatter: true,
      lang: 'text',
    });
    assert.strictEqual(stripSgr(txtDoc.lines[0].text), ' 1 │ # Not a heading');
    assert.ok(txtDoc.lines[0].text.endsWith('# Not a heading'), 'plain text body has no SGR highlighting');

    // PLAIN_THEME emits zero SGR escapes even for Python
    const plainThemeDoc = renderFile(pyPath, {
      root: tmp,
      width: 80,
      theme: PLAIN_THEME,
      showFrontmatter: true,
    });
    for (const l of plainThemeDoc.lines) {
      assert.ok(!/\x1b\[[0-9;]*m/.test(l.text), 'PLAIN_THEME emits zero SGR escapes');
    }

    // Markdown via <stdin> still renders as Markdown
    const mdPipeDoc = renderText('# Piped Heading\n\nParagraph text.\n', '<stdin>', {
      root: tmp,
      width: 80,
      theme: DEFAULT_THEME,
      showFrontmatter: true,
    });
    const mdPlain = mdPipeDoc.lines.map((l) => stripSgr(l.text)).join('\n');
    assert.ok(mdPlain.includes('Piped Heading') && !mdPlain.includes('# Piped Heading'), 'piped Markdown renders without raw #');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI piped stdin without /dev/tty fails cleanly with exit 1 instead of usage error 3', () => {
  const res = spawnSync(
    'setsid',
    ['--wait', process.execPath, '--import', 'tsx', 'src/trimd.tsx', '--lang', 'py'],
    {
      input: 'print("hello")\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
    },
  );
  // In a headless test runner without /dev/tty, exit code is 1 (not 3 usage error);
  // if /dev/tty happens to exist, it wouldn't exit 3 either.
  assert.notStrictEqual(res.status, 3, 'piped stdin is accepted (no usage error exit 3)');
  if (res.status === 1) {
    assert.ok(res.stderr.includes('trimd: cannot open /dev/tty'), 'clean ADR-018 single-line error when /dev/tty unavailable');
  }
});
