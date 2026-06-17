// Color helpers shared across the generators, so every kit normalizes and
// validates color the same way, and derives the same "deep" shade.

// Return a validated "#rrggbb" from "rrggbb" or "#rrggbb"; throw otherwise.
export function normalizeHex(hex) {
  const v = '#' + String(hex).replace(/^#/, '');
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
    throw new Error(`Invalid hex color: "${hex}". Expected 6 hex digits, e.g. 1f4d57.`);
  }
  return v;
}

// Blend two colors. `t` is the percentage (0-100) of `a` in the mix, so
// mix(accent, paper, 84) is "84% accent, 16% paper" — the same convention the
// diagram theme uses for its line color, kept consistent across renderers.
export function mix(a, b, t) {
  const f = Math.max(0, Math.min(100, Number(t))) / 100;
  const na = parseInt(normalizeHex(a).slice(1), 16);
  const nb = parseInt(normalizeHex(b).slice(1), 16);
  const ch = (n, s) => (n >> s) & 255;
  const r = Math.round(ch(na, 16) * f + ch(nb, 16) * (1 - f));
  const g = Math.round(ch(na, 8) * f + ch(nb, 8) * (1 - f));
  const bl = Math.round(ch(na, 0) * f + ch(nb, 0) * (1 - f));
  return '#' + [r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Multiply each channel toward black. The default 0.62 is the kits' fallback
// "deep" shade when brand.json doesn't supply a curated one.
export function darken(hex, f = 0.62) {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
