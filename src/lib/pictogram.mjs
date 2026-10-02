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
  // Concept glyphs. The set above is device-shaped, which covers topology
  // figures but leaves nothing for a tile that stands for access, protection,
  // or a group of applications — the vault and app tiles that are not a box in
  // a rack. Same 24-unit grid and stroke conventions as the devices.
  key: '<circle cx="7.5" cy="12" r="3.75"/><path d="M11.25 12h9.25M17.5 12v3.25M20.5 12v2.5"/>',
  shield: '<path d="M12 2.8 4.6 6v6.1c0 4.4 3.1 7.8 7.4 9.1 4.3-1.3 7.4-4.7 7.4-9.1V6L12 2.8Z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  // Diagram glyphs: people, services and the things between them.
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="2.5"/><path d="M12 8V4.5M9 13v1.5M15 13v1.5M2 13v2.5M22 13v2.5"/><circle cx="12" cy="3.6" r=".9"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 14.5v2.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
  terminal: '<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
  firewall: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.33h18M3 14.67h18M9 4v5.33M15 4v5.33M6 9.33v5.34M12 9.33v5.34M18 9.33v5.34M9 14.67V20M15 14.67V20"/>',
  container: '<path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4Z"/><path d="M4 7.4l8 4.6 8-4.6M12 12v9.2"/>',
  file: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".5"/><path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
  mail: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 6.5 9 6.5 9-6.5"/>',
  code: '<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
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
