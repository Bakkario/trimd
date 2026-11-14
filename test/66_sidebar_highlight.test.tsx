import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { Readable, Writable } from 'node:stream';
import { render } from 'ink';
import Sidebar, { getEntryIcon } from '../src/ui/Sidebar.js';
import { DEFAULT_THEME, NERD_ICONS, EMOJI_ICONS } from '../src/core/themes.js';
import { stripAnsi, visibleWidth } from '../src/core/renderer.js';

test('ISSUE-024: Sidebar cursor highlight spans entire line and borders stay aligned', async () => {
  const entries = [
    { name: 'README.md', isDir: false, abs: '/tmp/README.md' },
    { name: 'test_spec.md', isDir: false, abs: '/tmp/test_spec.md' },
    { name: 'normal_note.md', isDir: false, abs: '/tmp/normal_note.md' },
  ];

  const chunks: string[] = [];
  const out = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      cb();
    },
  });
  const fakeStdin = new Readable({ read() {} });
  Object.defineProperty(fakeStdin, 'isTTY', { value: true });
  (fakeStdin as unknown as { setRawMode: (e: boolean) => void }).setRawMode = () => {};

  const inst = render(
    <Sidebar
      entries={entries}
      cursor={0}
      width={30}
      showBack={false}
      rows={8}
      activeAbs="/tmp/README.md"
      theme={DEFAULT_THEME}
      iconSet={NERD_ICONS}
    />,
    { stdout: out, stdin: fakeStdin },
  );

  inst.unmount();
  await Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout')), 2000)),
  ]);

  const raw = chunks.join('');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);

  // 1. Verify right border alignment: every box line has exact visible width of 30
  for (const line of lines) {
    const plain = stripAnsi(line);
    assert.equal(visibleWidth(plain), 30, `line visible width must be exactly 30: "${plain}"`);
    assert.ok(plain.startsWith('╭') || plain.startsWith('│') || plain.startsWith('├') || plain.startsWith('╰'), 'valid box line start');
    assert.ok(plain.endsWith('╮') || plain.endsWith('│') || plain.endsWith('┤') || plain.endsWith('╯'), 'valid box line end');
  }

  // 2. Verify no '❯' chevron cursor prefix
  const plainText = stripAnsi(raw);
  assert.ok(!plainText.includes('❯'), 'no redundant ❯ cursor prefix');

  // 3. Verify no '●' dot next to active note
  assert.ok(!plainText.includes('●'), 'no dot next to active note');

  // 4. Verify cursor row (row 3, which is README.md) has inverse video spanning full width
  const cursorLine = lines[3]; // 0: top border, 1: cwd, 2: sep, 3: first item
  assert.ok(cursorLine.includes('\u001b[7m'), 'cursor line begins inverse video');
  assert.ok(cursorLine.includes('\u001b[27m') || cursorLine.includes('\u001b[0m'), 'cursor line resets inverse video at end');
  assert.ok(cursorLine.includes('README.md'), 'cursor line contains file name');

  // 5. Verify active doc color is present
  assert.ok(raw.includes('38;5;51'), 'active doc color present on active item');
});

test('ISSUE-024: getEntryIcon styles active note icon with activeDoc color without prepending a dot', () => {
  const readmeEntry = { name: 'README.md', isDir: false, abs: '/tmp/README.md' };
  const taskEntry = { name: 'task_list.md', isDir: false, abs: '/tmp/task_list.md' };
  const normalEntry = { name: 'note.md', isDir: false, abs: '/tmp/note.md' };

  // When inactive:
  const inactiveReadme = getEntryIcon(readmeEntry, false, false, DEFAULT_THEME, NERD_ICONS);
  assert.ok(!inactiveReadme.includes('●'), 'inactive readme has no dot');
  assert.ok(inactiveReadme.includes('󰂺'), 'inactive readme has readme icon');
  assert.ok(inactiveReadme.includes(DEFAULT_THEME.colors.heading2), 'inactive readme has heading2 color');

  // When active:
  const activeReadme = getEntryIcon(readmeEntry, true, false, DEFAULT_THEME, NERD_ICONS);
  assert.ok(!activeReadme.includes('●'), 'active readme has no dot');
  assert.ok(activeReadme.includes('󰂺'), 'active readme preserves readme icon');
  assert.ok(activeReadme.includes(DEFAULT_THEME.colors.activeDoc), 'active readme has activeDoc color');

  const activeTask = getEntryIcon(taskEntry, true, false, DEFAULT_THEME, NERD_ICONS);
  assert.ok(activeTask.includes(''), 'active task preserves task icon');
  assert.ok(activeTask.includes(DEFAULT_THEME.colors.activeDoc), 'active task has activeDoc color');

  const activeNormal = getEntryIcon(normalEntry, true, false, DEFAULT_THEME, NERD_ICONS);
  assert.ok(activeNormal.includes(''), 'active normal note preserves file icon');
  assert.ok(activeNormal.includes(DEFAULT_THEME.colors.activeDoc), 'active normal note has activeDoc color');
});
