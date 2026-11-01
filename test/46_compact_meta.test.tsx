import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import App from '../src/ui/App.js';
import { renderFile } from '../src/core/pipeline.js';
import { extractFrontmatter, renderMeta, renderMetaCompact } from '../src/core/frontmatter.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;[^\\]*\\/g, '');
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

const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref?.();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('renderMetaCompact produces 1-line strip with type pill, date, scalar, tags, and [m] yaml', () => {
  const yaml = `---
type: guide
date: 2026-10-31
conf: high
tags: [devops, ssh]
---
`;
  const { meta } = extractFrontmatter(yaml);
  assert.ok(meta);
  const lines = renderMetaCompact(meta, DEFAULT_THEME, 80);
  assert.equal(lines.length, 1);
  const text = strip(lines[0].text);
  assert.ok(text.includes('GUIDE'));
  assert.ok(text.includes('2026-10-31'));
  assert.ok(text.includes('conf: high'));
  assert.ok(text.includes('#devops'));
  assert.ok(text.includes('#ssh'));
  assert.ok(text.endsWith('[m] yaml'));
});

test('renderMetaCompact wraps to 2 lines when width is narrow', () => {
  const yaml = `---
type: very-long-type-name
date: 2026-10-31
conf: extra-high-classification
tags: [devops, production, ssh, kubernetes]
---
`;
  const { meta } = extractFrontmatter(yaml);
  assert.ok(meta);
  const lines = renderMetaCompact(meta, DEFAULT_THEME, 50);
  assert.equal(lines.length, 2);
  assert.ok(strip(lines[1].text).includes('[m] yaml'));
});

test('m key toggles frontmatter in App between compact strip and full YAML', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-46-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  const docFile = join(root, 'note.md');
  writeFileSync(docFile, '---\ntype: guide\ndate: 2026-10-31\nconf: high\ntags: [devops]\n---\nHello world\n');

  // Test 1: initial render (metaExpanded defaults to false)
  const doc1 = renderFile(docFile, { root, width: 80, theme: DEFAULT_THEME, showFrontmatter: true });
  const out1 = captureStdout();
  const stdin1 = fakeTty();
  const inst1 = render(
    <App doc={doc1} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={false} showHidden={false} showFrontmatter={true} />,
    { stdout: out1, stdin: stdin1 },
  );

  await wait(200);
  inst1.unmount();
  await waitExit(inst1);
  releaseStdinFixture();
  const raw1 = (out1 as unknown as { chunks: string[] }).chunks.join('');
  assert.ok(raw1.includes('[m] yaml'), 'initial render included [m] yaml');
  assert.ok(!raw1.includes('── metadata ──'), 'initial render does not include ── metadata ──');

  // Test 2: press 'm' to expand
  const doc2 = renderFile(docFile, { root, width: 80, theme: DEFAULT_THEME, showFrontmatter: true });
  const out2 = captureStdout();
  const stdin2 = fakeTty();
  const inst2 = render(
    <App doc={doc2} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={false} showHidden={false} showFrontmatter={true} />,
    { stdout: out2, stdin: stdin2 },
  );

  await wait(200);
  stdin2.push('m');
  await wait(300);
  inst2.unmount();
  await waitExit(inst2);
  releaseStdinFixture();
  const raw2 = (out2 as unknown as { chunks: string[] }).chunks.join('');
  assert.ok(raw2.includes('── metadata ──'), 'pressing m toggled full YAML view');

  rmSync(tmp, { recursive: true, force: true });
});
