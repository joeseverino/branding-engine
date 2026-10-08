// The renderers pick their font and glyph caches from three environment
// variables (see font.ts and glyphs.ts). A build sets them for its own run and
// puts the caller's values back afterwards, so using the engine as a library
// does not leave a font choice behind in the host process.

export interface BrandEnv {
  /** Absolute font path; undefined selects the bundled font. */
  font: string | undefined;
  /** Mark glyph cache file name. */
  glyphs: string;
  /** Wordmark glyph cache file name. */
  wordmarkGlyphs: string;
}

function setVariable(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

export async function withBrandEnv<T>(env: BrandEnv, run: () => Promise<T>): Promise<T> {
  const assignments: ReadonlyArray<readonly [name: string, value: string | undefined]> = [
    ['BRAND_FONT', env.font],
    ['BRAND_GLYPHS', env.glyphs],
    ['BRAND_WORDMARK_GLYPHS', env.wordmarkGlyphs],
  ];
  const previous = assignments.map(([name]) => [name, process.env[name]] as const);
  for (const [name, value] of assignments) setVariable(name, value);
  try {
    return await run();
  } finally {
    for (const [name, value] of previous) setVariable(name, value);
  }
}
