import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOUSE_ENABLE, MOUSE_DISABLE, createMouseParser } from '../src/core/mouse.js';
import type { MouseEvt } from '../src/core/types.js';

function collect(): { events: MouseEvt[]; feed: (chunk: string) => void } {
  const events: MouseEvt[] = [];
  const feed = createMouseParser((e) => events.push(e));
  return { events, feed };
}

test('MOUSE_ENABLE / MOUSE_DISABLE exact bytes (02 §10, ADR-012)', () => {
  assert.equal(MOUSE_ENABLE, '\x1b[?1000h\x1b[?1006h');
  assert.equal(MOUSE_DISABLE, '\x1b[?1006l\x1b[?1000l');
});

test('Konsole left click: \\x1b[<0;11;6M → press evt (10,5), coords 1-based→0-based (02 §10, ADR-012 am. ISSUE-001)', () => {
  const { events, feed } = collect();
  feed('\x1b[<0;11;6M');
  assert.deepEqual(events, [{ button: 0, action: 'press', x: 10, y: 5 }]);
});

test('Konsole left release \\x1b[<0;11;6m → release evt (02 §10, ADR-012 am. ISSUE-001)', () => {
  const { events, feed } = collect();
  feed('\x1b[<0;11;6m');
  assert.deepEqual(events, [{ button: 0, action: 'release', x: 10, y: 5 }]);
});

test('xterm-standard left: \\x1b[<32;11;6M → press, \\x1b[<32;11;6m → release (02 §10, ADR-012 am. ISSUE-001)', () => {
  const { events, feed } = collect();
  feed('\x1b[<32;11;6M');
  feed('\x1b[<32;11;6m');
  assert.deepEqual(events, [
    { button: 0, action: 'press', x: 10, y: 5 },
    { button: 0, action: 'release', x: 10, y: 5 },
  ]);
});

test('code 35 is left-release only: \\x1b[<35;11;6m → release; \\x1b[<35;11;6M ignored (02 §10, ADR-012 am. ISSUE-001)', () => {
  const { events, feed } = collect();
  feed('\x1b[<35;11;6M');
  feed('\x1b[<35;11;6m');
  assert.deepEqual(events, [{ button: 0, action: 'release', x: 10, y: 5 }]);
});

test('split across two chunks (escape then rest) still parses (02 §10)', () => {
  const { events, feed } = collect();
  feed('\x1b');
  feed('[<0;11;6M');
  assert.deepEqual(events, [{ button: 0, action: 'press', x: 10, y: 5 }]);
});

test('split mid-coordinates across chunks still parses (02 §10)', () => {
  const { events, feed } = collect();
  feed('\x1b[<32;11;');
  feed('6M');
  assert.deepEqual(events, [{ button: 0, action: 'press', x: 10, y: 5 }]);
});

test('non-left buttons ignored: 1/2 (Konsole mid/right), 33/34 (xterm right/mid), 36 (motion), 64/65/66/67 (wheel), 128+ (ext) (02 §10)', () => {
  const { events, feed } = collect();
  for (const code of ['1', '2', '33', '34', '36', '64', '65', '66', '67', '128', '192']) {
    feed(`\x1b[<${code};11;6M`);
    feed(`\x1b[<${code};11;6m`);
  }
  assert.deepEqual(events, []);
});

test('unterminated sequence emits nothing (02 §10)', () => {
  const { events, feed } = collect();
  feed('\x1b[<0;11;6X'); // missing M/m terminator
  assert.deepEqual(events, []);
});

test('unrelated CSI input (arrow keys) is dropped and does not corrupt the parser (02 §10)', () => {
  const { events, feed } = collect();
  feed('\x1b[B');
  feed('\x1b[A');
  feed('\x1b[<0;3;4M');
  assert.deepEqual(events, [{ button: 0, action: 'press', x: 2, y: 3 }]);
});

test('two complete sequences in one chunk both parse (02 §10)', () => {
  const { events, feed } = collect();
  feed('\x1b[<0;11;6M\x1b[<0;12;7m');
  assert.deepEqual(events, [
    { button: 0, action: 'press', x: 10, y: 5 },
    { button: 0, action: 'release', x: 11, y: 6 },
  ]);
});

test('keyboard Esc + arrow before a mouse event: no swallow, no accumulation (02 §10)', () => {
  const { events, feed } = collect();
  feed('\x1b');      // Esc key alone
  feed('\x1b[B');    // down arrow
  feed('\x1b[<32;9;2M');
  assert.deepEqual(events, [{ button: 0, action: 'press', x: 8, y: 1 }]);
});
