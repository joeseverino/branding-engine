import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

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

async function inTempDir(prefix: string, body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `branding-engine-${prefix}-`));
  try {
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('no command and --help print the usage', async () => {
  await inTempDir('cli-help', async (dir) => {
    for (const args of [[], ['--help'], ['-h']]) {
      const { code, stdout } = await branding(dir, ...args);
      assert.equal(code, 0);
      assert.match(stdout, /^Usage:/);
    }
  });
});

test('an unknown command and a missing argument exit 1 with the usage', async () => {
  await inTempDir('cli-usage', async (dir) => {
    for (const args of [['nope'], ['kit', 'slug', '1f4d57'], ['figure'], ['pictogram', 'shield']]) {
      const { code, stderr } = await branding(dir, ...args);
      assert.equal(code, 1, args.join(' '));
      assert.match(stderr, /^Usage:/, args.join(' '));
    }
  });
});

test('a flag that takes a value says so when it has none', async () => {
  await inTempDir('cli-value', async (dir) => {
    const out = await branding(dir, 'kit', 'a', '1f4d57', 'A', '--out');
    assert.equal(out.code, 1);
    assert.match(out.stderr, /--out needs a value\./);
    const only = await branding(dir, 'kit', 'a', '1f4d57', 'A', '--only');
    assert.equal(only.code, 1);
    assert.match(only.stderr, /--only needs a value\./);
    assert.deepEqual(await readdir(dir), [], 'nothing was built');
  });
});

test('a mistyped stage is rejected before anything is written', async () => {
  await inTempDir('cli-stage', async (dir) => {
    const { code, stderr } = await branding(dir, 'kit', 'a', '1f4d57', 'A', '--only', 'marks', '--out', 'kits');
    assert.equal(code, 1);
    assert.match(stderr, /Unknown stage "marks"/);
    assert.deepEqual(await readdir(dir), []);
  });
});

test('numeric flags must be positive numbers', async () => {
  await inTempDir('cli-number', async (dir) => {
    for (const [flag, value] of [['--size', 'big'], ['--fit', '0'], ['--size', '-4']]) {
      const { code, stderr } = await branding(dir, 'pictogram', 'shield', '#1E3A8A', flag, value);
      assert.equal(code, 1, `${flag} ${value}`);
      assert.match(stderr, new RegExp(`${flag} must be a positive number`), `${flag} ${value}`);
    }
  });
});

test('--no-circle-preview is a switch: it does not swallow the glyph after it', async () => {
  await inTempDir('cli-switch', async (dir) => {
    const { code, stdout } = await branding(dir, 'pictogram', '--no-circle-preview', 'shield', '#1E3A8A', '--out', 'tiles');
    assert.equal(code, 0);
    assert.match(stdout, /wrote .*shield\.svg \+ .*shield-512\.png$/m);
    assert.deepEqual((await readdir(path.join(dir, 'tiles'))).sort(), ['shield-512.png', 'shield.svg']);
  });
});

test('pictogram variants and a spec file go through the same writer', async () => {
  await inTempDir('cli-variants', async (dir) => {
    const pair = await branding(dir, 'pictogram', 'shield', '#1E3A8A', '--variants', 'light,dark', '--out', 'tiles');
    assert.equal(pair.code, 0);
    assert.equal(pair.stdout.trim().split('\n').length, 2);
    const bad = await branding(dir, 'pictogram', 'shield', '#1E3A8A', '--variants', 'sepia', '--out', 'tiles');
    assert.equal(bad.code, 1);
    assert.match(bad.stderr, /Unknown variant "sepia"/);
  });
});
