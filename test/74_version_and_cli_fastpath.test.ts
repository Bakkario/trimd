import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, VERSION } from '../src/core/config.js';

const repo = process.cwd();

test('parseArgs: -v and --version set flags.version', () => {
  assert.equal(parseArgs(['-v']).flags.version, true);
  assert.equal(parseArgs(['--version']).flags.version, true);
  assert.equal(parseArgs(['README.md']).flags.version, undefined);
});

test('VERSION in config.ts matches package.json version', () => {
  const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as { version: string };
  assert.equal(VERSION, '0.4.0');
  assert.equal(VERSION, pkg.version);
});

test('production bundle size is under 2.5 MB and --version / -v / --help work', () => {
  const distPath = join(repo, 'dist', 'trimd.js');
  const sizeBytes = statSync(distPath).size;
  assert.ok(sizeBytes < 2.5 * 1024 * 1024, `expected dist/trimd.js < 2.5 MB, got ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);

  const vOut = execFileSync(process.execPath, [distPath, '--version'], { encoding: 'utf8' });
  assert.equal(vOut, `trimd v${VERSION}\n`);

  const shortOut = execFileSync(process.execPath, [distPath, '-v'], { encoding: 'utf8' });
  assert.equal(shortOut, `trimd v${VERSION}\n`);

  const helpOut = execFileSync(process.execPath, [distPath, '--help'], { encoding: 'utf8' });
  assert.ok(helpOut.includes('--version'), 'help output must list --version');
});
