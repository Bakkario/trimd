import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { render } from 'ink';
import DocPane from '../src/ui/DocPane.js';
import type { RenderedDoc } from '../src/core/types.js';

// strips SGR, OSC 8 and generic terminal control sequences
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\]8;[^\]]*\\/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

// 100-line doc, line i+1 text = 'line-<i+1 zero-padded>'
function makeDoc(n: number): RenderedDoc {
  return {
    lines: Array.from({ length: n }, (_, i) => ({
      text: 'line-' + String(i + 1).padStart(2, '0'),
      links: [],
    })),
    meta: null,
    title: 'doc',
    warnings: [],
    source: '/tmp/trimd-17/doc.md',
  };
}

test('DocPane shows lines [scrollTop, scrollTop+rows) (02 §11, INV-3.3)', async () => {
  const doc = makeDoc(100);

  const chunks: string[] = [];
  const out = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      cb();
    },
  });

  const fakeStdin = new Readable({ read() {} });
  Object.defineProperty(fakeStdin, 'isTTY', { value: true });
  (fakeStdin as unknown as { setRawMode: (e: boolean) => void }).setRawMode = () => {};

  const inst = render(
    <DocPane doc={doc} scrollTop={5} rows={10} width={80} />,
    { stdout: out, stdin: fakeStdin },
  );
  inst.unmount();
  await Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

  const frame = stripAnsi(chunks.join(''));
  assert.ok(frame.includes('line-06'), 'frame contains line 6 (scrollTop+1)');
  assert.ok(!frame.includes('line-01'), 'frame does not contain line 1');
  assert.ok(!frame.includes('line-99'), 'frame does not contain line 99');
});
