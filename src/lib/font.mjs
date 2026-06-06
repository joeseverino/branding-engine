// Resolves the live-text font used by the wordmark/card renderers and the glyph
// extractor. The default is the Inter bundled with this package; BRAND_FONT (or a
// brand config's `font`) overrides it. A relative override is resolved from the
// caller's working directory, since the consumer: not this package: owns it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Absolute path to the bundled default font.
export const DEFAULT_FONT = path.join(pkgRoot, 'assets/fonts/inter/inter-variable-latin.woff2');

export function fontPath() {
  const f = process.env.BRAND_FONT;
  if (!f) return DEFAULT_FONT;
  return path.isAbsolute(f) ? f : path.resolve(process.cwd(), f);
}
