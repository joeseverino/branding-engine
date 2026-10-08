import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import test from 'node:test';

import { buildBrand } from '../src/index.ts';
import { scratch } from './support.ts';

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.relative(root, path.join(entry.parentPath, entry.name))).sort();
}

async function imageShape(bytes: Buffer): Promise<{ format?: string; width?: number; height?: number }> {
  const { format, width, height } = await sharp(bytes).metadata();
  return { format, width, height };
}

test('committed Severino Labs example matches a fresh full build', async (t) => {
  t.mock.method(console, 'log', () => {});
  await using dir = await scratch('example');
  const config = path.resolve('examples/severino-labs/brand.json');
  const expected = path.resolve('examples/severino-labs/generated');

  await buildBrand({ config, outDir: dir.path });

  const expectedFiles = await filesUnder(expected);
  assert.deepEqual(await filesUnder(dir.path), expectedFiles);

  for (const file of expectedFiles) {
    const actual = await readFile(path.join(dir.path, file));
    const reference = await readFile(path.join(expected, file));
    const extension = path.extname(file);

    if (extension === '.png' || extension === '.ico') {
      assert.ok(actual.length > 100, file);
      if (extension === '.png') assert.deepEqual(await imageShape(actual), await imageShape(reference), file);
    } else {
      assert.deepEqual(actual, reference, file);
    }
  }
});
