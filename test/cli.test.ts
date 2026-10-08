import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { scratch } from './support.ts';

const run = promisify(execFile);
const cli = path.resolve('src/cli.ts');

interface Outcome {
  code: number;
  stdout: string;
  stderr: string;
}

async function branding(cwd: string, ...args: string[]): Promise<Outcome> {
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && 'stdout' in error && 'stderr' in error) {
      return { code: Number(error.code), stdout: String(error.stdout), stderr: String(error.stderr) };
    }
    throw error;
  }
}

test('no command and --help print the usage', async () => {
  await using dir = await scratch('cli-help');
  for (const args of [[], ['--help'], ['-h']]) {
    const { code, stdout } = await branding(dir.path, ...args);
    assert.equal(code, 0);
    assert.match(stdout, /^Usage:/);
  }
});

test('an unknown command and a missing argument exit 1 with the usage', async () => {
  await using dir = await scratch('cli-usage');
  for (const args of [['nope'], ['kit', 'slug', '1f4d57'], ['figure'], ['pictogram', 'shield']]) {
    const { code, stderr } = await branding(dir.path, ...args);
    assert.equal(code, 1, args.join(' '));
    assert.match(stderr, /^Usage:/, args.join(' '));
  }
});

test('a flag that takes a value says so when it has none', async () => {
  await using dir = await scratch('cli-value');
  const out = await branding(dir.path, 'kit', 'a', '1f4d57', 'A', '--out');
  assert.equal(out.code, 1);
  assert.match(out.stderr, /--out needs a value\./);
  const only = await branding(dir.path, 'kit', 'a', '1f4d57', 'A', '--only');
  assert.equal(only.code, 1);
  assert.match(only.stderr, /--only needs a value\./);
  const swallowed = await branding(dir.path, 'kit', 'a', '1f4d57', 'A', '--out', '--only', 'mark');
  assert.equal(swallowed.code, 1);
  assert.match(swallowed.stderr, /--out needs a value\./);
  assert.deepEqual(await readdir(dir.path), [], 'nothing was built');
});

test('a mistyped stage is rejected before anything is written', async () => {
  await using dir = await scratch('cli-stage');
  const { code, stderr } = await branding(dir.path, 'kit', 'a', '1f4d57', 'A', '--only', 'marks', '--out', 'kits');
  assert.equal(code, 1);
  assert.match(stderr, /Unknown stage "marks"/);
  assert.deepEqual(await readdir(dir.path), []);
});

test('numeric flags must be positive numbers', async () => {
  await using dir = await scratch('cli-number');
  const cases: ReadonlyArray<readonly [flag: string, value: string]> = [['--size', 'big'], ['--fit', '0'], ['--size', '-4']];
  for (const [flag, value] of cases) {
    const { code, stderr } = await branding(dir.path, 'pictogram', 'shield', '#1E3A8A', flag, value);
    assert.equal(code, 1, `${flag} ${value}`);
    assert.match(stderr, new RegExp(`${flag} must be a positive number`), `${flag} ${value}`);
  }
});

test('--no-circle-preview is a switch: it does not swallow the glyph after it', async () => {
  await using dir = await scratch('cli-switch');
  const { code, stdout } = await branding(dir.path, 'pictogram', '--no-circle-preview', 'shield', '#1E3A8A', '--out', 'tiles');
  assert.equal(code, 0);
  assert.match(stdout, /wrote .*shield\.svg \+ .*shield-512\.png$/m);
  assert.deepEqual((await readdir(path.join(dir.path, 'tiles'))).sort(), ['shield-512.png', 'shield.svg']);
});

test('pictogram variants and a spec file go through the same writer', async () => {
  await using dir = await scratch('cli-variants');
  const pair = await branding(dir.path, 'pictogram', 'shield', '#1E3A8A', '--variants', 'light,dark', '--out', 'tiles');
  assert.equal(pair.code, 0);
  assert.equal(pair.stdout.trim().split('\n').length, 2);
  const bad = await branding(dir.path, 'pictogram', 'shield', '#1E3A8A', '--variants', 'sepia', '--out', 'tiles');
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /Unknown variant "sepia"/);
});

test('an unknown flag is rejected by name instead of being ignored', async () => {
  await using dir = await scratch('cli-unknown');
  const { code, stderr } = await branding(dir.path, 'kit', 'a', '1f4d57', 'A', '--onyl', 'mark');
  assert.equal(code, 1);
  assert.match(stderr, /Unknown flag --onyl\./);
  assert.deepEqual(await readdir(dir.path), [], 'nothing was built');
});
