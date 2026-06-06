// Normalize the compact mark shown inside favicon and logo tiles.
// The bundled glyph cache covers uppercase A-Z and digits 0-9.
export function normalizeGlyph(glyph = 'JS') {
  const value = String(glyph).trim().toUpperCase();
  if (!/^[A-Z0-9]{1,3}$/.test(value)) {
    throw new Error(
      `Invalid glyph: "${glyph}". Expected 1-3 letters or digits, e.g. A, AC, or A3X.`,
    );
  }
  return value;
}
