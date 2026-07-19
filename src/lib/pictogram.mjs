// Stroke pictograms on a 24-unit grid — the single glyph source shared by
// topology figures (device nodes) and standalone pictogram tiles. Names are
// stable API: figure specs and tile consumers reference them by key.
export const PICTOGRAMS = {
  laptop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M1.5 19.5h21L20.5 16h-17l-2 3.5Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  server: '<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/><path d="M7.5 6.5h.01M7.5 17.5h.01"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.66 3.1 3 7 3s7-1.34 7-3V6"/><path d="M5 12c0 1.66 3.1 3 7 3s7-1.34 7-3"/>',
  switch: '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M7.5 10l-2.5 2 2.5 2M16.5 10l2.5 2-2.5 2M5.5 12h6M12.5 12h6"/>',
  router: '<rect x="3" y="13" width="18" height="6" rx="1.5"/><path d="M7 16h.01M12 10V5m0 0 3 2.2M12 5 9 7.2"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.6 3.5 3.5 0 0 0 7 18Z"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  home: '<path d="M3 10l9-7 9 7v10a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 20z"/><path d="M9 21.8V12h6v9.8"/>',
};

// A bare stroke glyph <svg> (no tile) — what topology nodes embed.
export function pictogramGlyphSvg(name, size, color, strokeWidth = 1.7) {
  const g = PICTOGRAMS[name] || PICTOGRAMS.server;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${g}</svg>`;
}

// A rounded tile with a centered stroke glyph — the pictogram counterpart of
// markSvg (which sets letterform glyphs on the same tile geometry). Used for
// app/vault/avatar tiles wherever a picture reads better than a monogram.
export function pictogramSvg({
  glyph,
  hex,
  size = 512,
  radius = size * 0.22,
  color = '#ffffff',
  strokeWidth = 1.7,
  scale = 0.586,
}) {
  if (!PICTOGRAMS[glyph]) {
    throw new Error(
      `Unknown pictogram "${glyph}". Valid: ${Object.keys(PICTOGRAMS).join(', ')}`,
    );
  }
  const box = Math.round(size * scale);
  const inset = Math.round((size - box) / 2);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${hex}"/>` +
    `<svg x="${inset}" y="${inset}" width="${box}" height="${box}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
    `${PICTOGRAMS[glyph]}</svg></svg>`;
}
