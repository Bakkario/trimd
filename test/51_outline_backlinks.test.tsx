import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import React from 'react';
import { renderFile } from '../src/core/pipeline.js';
import { buildIndex, buildBacklinkIndex } from '../src/core/resolve.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import App from '../src/ui/App.js';

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\]8;[^\]]*\\/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function fakeTty(): Readable {
  const stdin = new Readable({ read() {} });
  Object.defineProperty(stdin, 'isTTY', { value: true });
  (stdin as unknown as { setRawMode: (e: boolean) => void }).setRawMode = () => {};
  return stdin;
}

function captureStdout(): Writable {
  const chunks: string[] = [];
  const out = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      cb();
    },
  });
  Object.defineProperty(out, 'rows', { value: 24 });
  Object.defineProperty(out, 'columns', { value: 80 });
  (out as unknown as { chunks: string[] }).chunks = chunks;
  return out;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

test('buildBacklinkIndex finds incoming wikilinks and pipeline renders Linked Mentions', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-backlink-'));
  try {
    const noteA = join(tmp, 'NoteA.md');
    const noteB = join(tmp, 'NoteB.md');
    const noteC = join(tmp, 'NoteC.md');

    writeFileSync(noteA, '# Note A\n\nContent linking to [[NoteB]] and [[NoteC]].\n');
    writeFileSync(noteB, '# Note B\n\nAlso linking to [[NoteC]].\n');
    writeFileSync(noteC, '# Note C\n\nTarget note.\n');

    const idx = buildIndex(tmp, false);
    const backlinks = buildBacklinkIndex(tmp, idx);

    const bIncoming = backlinks.get(noteB) ?? [];
    assert.deepEqual(bIncoming, [noteA]);

    const cIncoming = backlinks.get(noteC) ?? [];
    assert.deepEqual(cIncoming.sort(), [noteA, noteB].sort());

    const docC = renderFile(noteC, {
      root: tmp,
      width: 80,
      theme: DEFAULT_THEME,
      showFrontmatter: false,
    });

    const fullText = docC.lines.map((l) => l.text).join('\n');
    assert.ok(fullText.includes('Linked Mentions (2)'), 'renders header with count');
    assert.ok(fullText.includes('↩ NoteA'), 'includes backlink to NoteA');
    assert.ok(fullText.includes('↩ NoteB'), 'includes backlink to NoteB');

    // Spans exist
    const mentionSpans = docC.lines.flatMap((l) => l.links).filter((s) => s.kind === 'wikilink');
    assert.ok(mentionSpans.some((s) => s.href === noteA), 'has LinkSpan pointing to noteA');
    assert.ok(mentionSpans.some((s) => s.href === noteB), 'has LinkSpan pointing to noteB');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('RenderedDoc records headings with levels and lines', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-headings-'));
  try {
    const note = join(tmp, 'Doc.md');
    writeFileSync(note, '# Level 1\n\nIntro\n\n## Level 2\n\nSection\n\n### Level 3\n\nSub\n');

    const doc = renderFile(note, {
      root: tmp,
      width: 80,
      theme: DEFAULT_THEME,
      showFrontmatter: false,
    });

    assert.ok(doc.headings, 'doc has headings array');
    assert.equal(doc.headings.length, 3);
    assert.equal(doc.headings[0].level, 1);
    assert.equal(doc.headings[0].text, 'Level 1');
    assert.equal(doc.headings[1].level, 2);
    assert.equal(doc.headings[1].text, 'Level 2');
    assert.equal(doc.headings[2].level, 3);
    assert.equal(doc.headings[2].text, 'Level 3');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('App o key toggles Outline view and 1-9 jumps to heading', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-app-outline-'));
  try {
    const note = join(tmp, 'Guide.md');
    const paras = Array.from({ length: 30 }, (_, i) => `Paragraph line ${i}`).join('\n\n');
    writeFileSync(note, `# Title\n\n${paras}\n\n## Section 2\n\nMore content\n`);

    const doc = renderFile(note, {
      root: tmp,
      width: 80,
      theme: DEFAULT_THEME,
      showFrontmatter: false,
    });

    // 1. Verify Outline view appears on 'o'
    {
      const out = captureStdout();
      const stdin = fakeTty();
      const inst = render(
        <App
          doc={doc}
          root={tmp}
          theme={DEFAULT_THEME}
          themeId="default"
          sidebarOpen={false}
          showHidden={false}
          showFrontmatter={false}
        />,
        { stdout: out, stdin }
      );

      await wait(200);
      stdin.push('o');
      await wait(200);

      inst.unmount();
      await waitExit(inst);
      releaseStdinFixture();

      const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
      assert.ok(frame.includes('Outline'), 'frame contains Outline header');
      assert.ok(frame.includes('Title'), 'lists Title heading');
      assert.ok(frame.includes('Section 2'), 'lists Section 2 heading');
    }

    // 2. Verify pressing digit jumps to heading and closes outline
    {
      const out = captureStdout();
      const stdin = fakeTty();
      const inst = render(
        <App
          doc={doc}
          root={tmp}
          theme={DEFAULT_THEME}
          themeId="default"
          sidebarOpen={false}
          showHidden={false}
          showFrontmatter={false}
        />,
        { stdout: out, stdin }
      );

      await wait(200);
      stdin.push('o');
      await wait(200);
      stdin.push('2');
      await wait(200);

      inst.unmount();
      await waitExit(inst);
      releaseStdinFixture();

      const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
      assert.ok(!frame.includes('── Outline ──'), 'outline is closed after jump');
      assert.ok(frame.includes('Section 2'), 'jumped to Section 2 in document view');
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
