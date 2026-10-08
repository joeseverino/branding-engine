// The public declarations describe Playwright by hand so a consumer without it
// type-checks; this fails the typecheck if a Playwright `Browser` stops satisfying them.
import type { Browser as PlaywrightBrowser } from '@playwright/test';
import type { Browser } from '../src/lib/render.ts';

export const acceptsPlaywright = (browser: PlaywrightBrowser): Browser => browser;
