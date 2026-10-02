// Brand palette for figures: canvas presets and the theme colors every template
// draws from, derived from the kit's tokens.
import { darken, mix, normalizeHex } from '../color.mjs';

// Named canvas presets (logical px). Output is rendered at `scale`x for crisp
// text. `size` in a spec may also be an explicit [width, height].
export const SIZES = {
  cover: [1600, 900],   // 16:9 writeup cover / hero
  wide: [1600, 800],    // 2:1 banner
  topo: [1500, 1000],   // 3:2 radial topology — taller frame reads bigger on mobile
  og: [1200, 630],      // Open Graph / Twitter card
  github: [1280, 640],  // GitHub repo social preview
  square: [1200, 1200], // square avatar / icon-ish
};

// Brand defaults, overridden by tokens (the `brand` tool passes the kit's
// tokens.css) or by an explicit `colors` block in the spec. The engine stays
// usable standalone; the brand tool makes it on-brand.
const DEFAULT_TOKENS = {
  accent: '#1E3A8A',
  deep: '#14245C',
  onAccent: '#ffffff',
  ink: '#0b0620',
  paper: '#ffffff',
};

export const rgba = (hex, a) => {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// Resolve the theme palette every template draws from.
export function palette(theme, tokens) {
  const t = { ...DEFAULT_TOKENS, ...tokens };
  const dark = theme === 'dark';
  return {
    dark,
    accent: t.accent,
    deep: t.deep,
    onAccent: t.onAccent,
    paper: t.paper,
    ink: t.ink,
    pageBg: dark
      ? `radial-gradient(125% 115% at 50% 42%, ${mix(t.accent, t.deep, 55)} 0%, ${t.deep} 55%, ${darken(t.deep, 0.72)} 100%)`
      : `radial-gradient(120% 120% at 50% 45%, ${mix(t.accent, t.paper, 8)} 0%, ${t.paper} 72%)`,
    nodeFill: t.paper,
    nodeBorder: dark ? 'transparent' : t.accent,
    nodeBorderW: dark ? 0 : 3,
    nodeText: t.ink,
    nodeShadow: dark ? `0 3px 14px ${rgba('#000000', 0.36)}` : `0 2px 7px ${rgba(t.deep, 0.16)}`,
    line: dark ? mix(t.accent, t.paper, 42) : mix(t.accent, t.paper, 78),
    anchorFill: dark ? t.paper : t.accent,
    anchorText: dark ? t.deep : t.onAccent,
    anchorBorder: dark ? t.paper : t.deep,
    headline: dark ? t.paper : t.ink,
    eyebrow: dark ? mix(t.paper, t.accent, 72) : mix(t.ink, t.paper, 52),
    subline: dark ? mix(t.paper, t.accent, 62) : mix(t.ink, t.paper, 42),
    rule: dark ? mix(t.accent, t.paper, 45) : t.accent,
    muted: dark ? mix(t.paper, t.accent, 45) : mix(t.ink, t.paper, 55),
    // Named colors as strokes and text: on a dark page the brand accent and deep
    // lift toward paper so an accent link or ring stays visible.
    tone: {
      accent: dark ? mix(t.paper, t.accent, 78) : t.accent,
      deep: dark ? mix(t.paper, t.accent, 58) : t.deep,
      ink: dark ? t.paper : t.ink,
      muted: dark ? mix(t.paper, t.accent, 45) : mix(t.ink, t.paper, 55),
    },
    // Named colors as fills: the raw brand values in either theme.
    fills: { accent: t.accent, deep: t.deep, ink: t.ink, muted: dark ? mix(t.paper, t.accent, 45) : mix(t.ink, t.paper, 55) },
    chipBg: t.paper,
    chipText: t.ink,
    groupFill: dark ? rgba(t.paper, 0.05) : rgba(t.accent, 0.035),
    groupBorder: dark ? rgba(t.paper, 0.32) : mix(t.accent, t.paper, 48),
    groupLabel: dark ? mix(t.paper, t.accent, 78) : t.accent,
  };
}

export function resolveSize(size) {
  if (Array.isArray(size) && size.length === 2) return size.map(Number);
  if (typeof size === 'string' && SIZES[size]) return SIZES[size];
  return SIZES.cover;
}
