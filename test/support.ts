import { mkdtempDisposable } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { launchBrowser, type Browser } from '../src/lib/render.ts';

/** A temp directory that removes itself when the test scope ends: `await using dir = await scratch('x')`. */
export const scratch = (prefix: string) => mkdtempDisposable(path.join(os.tmpdir(), `branding-engine-${prefix}-`));

/** Set an environment variable for one test; the previous value, or its absence, is restored afterwards. */
export function setEnv(t: TestContext, name: string, value: string): void {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

/** A launched Chromium that closes with the test, or undefined (the test is skipped) when Playwright is not installed. */
export async function browserOrSkip(t: TestContext): Promise<Browser | undefined> {
  const browser = await launchBrowser().catch(() => undefined);
  if (!browser) {
    t.skip('Playwright not installed');
    return undefined;
  }
  t.after(() => browser.close());
  return browser;
}
