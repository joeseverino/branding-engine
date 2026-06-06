// Generate the drop-in web wiring for a kit into <outDir>/<slug>/web/:
//   tokens.css        the palette as CSS custom properties
//   site.webmanifest  PWA/icon manifest
//   head.html         the favicon + theme-color <link> block, copy-paste ready
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { darken, normalizeHex } from './lib/color.mjs';
import { normalizeGlyph } from './lib/identity.mjs';

export function makeWeb({ slug, hex, glyph = 'JS', name, deep, onColor, outDir }) {
  const accent = normalizeHex(hex);
  glyph = normalizeGlyph(glyph);
  const deepShade = deep ? normalizeHex(deep) : darken(accent);
  const onAccent = onColor ? normalizeHex(onColor) : '#ffffff';
  const label = name || slug;
  const webDir = path.join(outDir, slug, 'web');
  mkdirSync(webDir, { recursive: true });

  writeFileSync(
    path.join(webDir, 'tokens.css'),
    `:root {\n` +
      `  --brand-accent: ${accent};\n` +
      `  --brand-deep: ${deepShade};\n` +
      `  --brand-on-accent: ${onAccent};\n` +
      `  --brand-ink: #0b0620;\n` +
      `  --brand-paper: #ffffff;\n` +
      `}\n`,
  );

  const manifest = {
    name: label,
    short_name: glyph,
    icons: [
      { src: '/icons/favicon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    theme_color: accent,
    background_color: '#ffffff',
    display: 'standalone',
  };
  writeFileSync(path.join(webDir, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

  writeFileSync(
    path.join(webDir, 'head.html'),
    `<!-- Adjust the paths to wherever you deploy the icons. -->\n` +
      `<link rel="icon" href="/favicon.ico" sizes="any">\n` +
      `<link rel="icon" type="image/svg+xml" href="/icons/favicon.svg">\n` +
      `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">\n` +
      `<link rel="manifest" href="/site.webmanifest">\n` +
      `<meta name="theme-color" content="${accent}">\n`,
  );

  console.log(`  web       ${slug.padEnd(12)} tokens.css, site.webmanifest, head.html`);
}
