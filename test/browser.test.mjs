import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import test from 'node:test';

import { buildBrand } from '../index.mjs';

async function filesUnder(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, absolute));
    else files.push(path.relative(root, absolute));
  }
  return files.sort();
}

test('committed Severino Labs example matches a fresh full build', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'branding-engine-example-'));
  const config = path.resolve('examples/severino-labs/brand.json');
  const expected = path.resolve('examples/severino-labs/generated');

  try {
    await buildBrand({ config, outDir: cwd });

    const expectedFiles = await filesUnder(expected);
    const actualFiles = await filesUnder(cwd);
    assert.deepEqual(actualFiles, expectedFiles);

    for (const file of expectedFiles) {
      const actual = await readFile(path.join(cwd, file));
      const reference = await readFile(path.join(expected, file));
      const extension = path.extname(file);

      if (['.png', '.ico'].includes(extension)) {
        assert.ok(actual.length > 100, file);
        if (extension === '.png') {
          const actualMetadata = await sharp(actual).metadata();
          const referenceMetadata = await sharp(reference).metadata();
          assert.deepEqual(
            {
              format: actualMetadata.format,
              width: actualMetadata.width,
              height: actualMetadata.height,
            },
            {
              format: referenceMetadata.format,
              width: referenceMetadata.width,
              height: referenceMetadata.height,
            },
            file,
          );
        }
      } else {
        assert.deepEqual(actual, reference, file);
      }
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
