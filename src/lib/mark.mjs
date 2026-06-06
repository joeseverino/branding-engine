// Builds a brand mark SVG from real Inter (weight 800) glyph outlines.
// Parameterized: the color and glyph are arguments, so one monogram renders in
// any surface's accent. Self-contained, with no dependency on any other repo.
//
// Outlines come from brand-glyphs.json (A-Z and 0-9 are bundled by default).
import { loadGlyphs } from './glyphs.mjs';
import { normalizeGlyph } from './identity.mjs';

// Read glyphs lazily so a BRAND_GLYPHS set in-process (by the build) is honored.
// Defaults to brand-glyphs.json; point at another extracted set with BRAND_GLYPHS.
let _glyphData;
let _glyphFile;
function glyphData() {
  const file = process.env.BRAND_GLYPHS || 'brand-glyphs.json';
  if (!_glyphData || _glyphFile !== file) {
    _glyphData = loadGlyphs(file);
    _glyphFile = file;
  }
  return _glyphData;
}

const RENDER = {
  letterSpacing: -0.045, // em
  widthRatio: {
    1: 0.46,
    2: 0.63,
    3: 0.76,
  },
  heightRatio: 0.56,     // cap narrow glyphs such as "I" by height
  radiusRatio: 0.22,     // rounded-square corner radius (0 = square)
};

// Lay the glyph string out in font units and measure the combined ink box.
function layout(glyph) {
  const { unitsPerEm, glyphs } = glyphData();
  const ls = RENDER.letterSpacing * unitsPerEm;
  const chars = [...glyph];
  let penX = 0;
  const placed = [];
  chars.forEach((ch, i) => {
    const g = glyphs[ch];
    if (!g) {
      throw new Error(
        `No outline for glyph "${ch}". Available: ${Object.keys(glyphs).join(', ')}. ` +
          `Re-run through buildKit or buildBrand so the Node extractor can cache it.`,
      );
    }
    placed.push({ x: penX, g });
    penX += g.advance + (i < chars.length - 1 ? ls : 0);
  });
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const { x, g } of placed) {
    xMin = Math.min(xMin, x + g.bounds.xMin);
    xMax = Math.max(xMax, x + g.bounds.xMax);
    yMin = Math.min(yMin, g.bounds.yMin);
    yMax = Math.max(yMax, g.bounds.yMax);
  }
  return {
    placed,
    count: chars.length,
    cx: (xMin + xMax) / 2,
    cy: (yMin + yMax) / 2,
    gw: xMax - xMin,
    gh: yMax - yMin,
  };
}

/**
 * Build the mark as a self-contained SVG string.
 * @param {object} opts
 * @param {number}  [opts.size=512]      square canvas size
 * @param {boolean} [opts.rounded=true]  rounded-square (false = full square)
 * @param {string|null} [opts.bg]        tile fill, or null for transparent
 * @param {string}  [opts.fg='#ffffff']  glyph fill
 * @param {string}  [opts.glyph='JS']    1-3 alphanumeric mark characters
 */
export function markSvg({ size = 512, rounded = true, bg, fg = '#ffffff', glyph = 'JS' } = {}) {
  const normalizedGlyph = normalizeGlyph(glyph);
  const { placed, count, cx, cy, gw, gh } = layout(normalizedGlyph);
  const widthScale = (RENDER.widthRatio[count] * size) / gw;
  const heightScale = (RENDER.heightRatio * size) / gh;
  const s = Math.min(widthScale, heightScale);
  const rx = rounded ? +(size * RENDER.radiusRatio).toFixed(2) : 0;
  const bgRect = bg ? `<rect width="${size}" height="${size}" rx="${rx}" fill="${bg}"/>` : '';
  const paths = placed
    .map(({ x, g }) => `<path transform="translate(${x.toFixed(2)} 0)" d="${g.path}"/>`)
    .join('');
  // Glyph outlines are y-up (font space); flip and centre them in the canvas.
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`
    + bgRect
    + `<g fill="${fg}" transform="translate(${size / 2} ${size / 2}) scale(${s.toFixed(5)} ${(-s).toFixed(5)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})">${paths}</g>`
    + `</svg>`;
}
