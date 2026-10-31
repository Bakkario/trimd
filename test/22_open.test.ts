import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XDG_OPEN, canOpen, openExternal } from '../src/core/open.js';

// 02 §12 — XDG_OPEN, canOpen, openExternal. Tests must NOT spawn a real
// browser: only the false paths and canOpen() are asserted (task spec).

test('XDG_OPEN is the exact contract path (02 §12)', () => {
  assert.equal(XDG_OPEN, '/usr/bin/xdg-open');
});

test('canOpen() is true on this host (/usr/bin/xdg-open exists) (02 §12)', () => {
  assert.equal(canOpen(), true);
});

test("openExternal('not-a-url') → false (no http(s) scheme) (02 §12)", () => {
  assert.equal(openExternal('not-a-url'), false);
});

test("openExternal('ftp://x') → false (non-http scheme) (02 §12)", () => {
  assert.equal(openExternal('ftp://x'), false);
});

test("openExternal('file:///x') → false (decoded path missing, ISSUE-004) (02 §12)", () => {
  assert.equal(openExternal('file:///x'), false);
});

test("openExternal('file://relative/x') → false (not an absolute path, ISSUE-004) (02 §12)", () => {
  assert.equal(openExternal('file://relative/x'), false);
});
