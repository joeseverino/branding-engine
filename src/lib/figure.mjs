// Designed-graphic renderer: brand-themed covers and figures for writeups,
// READMEs, and social/OG cards. Same headless-Chromium + bundled-Inter pipeline
// as the social cards (lib/card.mjs), but driven by a small JSON "figure spec"
// and a registry of layout templates, so a new graphic is data, not code.
//
// A template owns its <body>; the renderer supplies the page frame (sized
// canvas, brand background, embedded font) and a palette derived from the brand
// tokens. Templates compute pixel geometry in JS and emit absolutely-positioned
// nodes plus an SVG connector layer — Chromium only does text layout inside the
// nodes, which is the one thing it is better at than hand-rolled SVG.
import sharp from 'sharp';
import { esc } from './html.mjs';
import { fontFaceCss, withPage } from './render.mjs';
import { darken, mix, normalizeHex } from './color.mjs';

// Named canvas presets (logical px). Output is rendered at `scale`x for crisp
// text. `size` in a spec may also be an explicit [width, height].
export const SIZES = {
  cover: [1600, 900],   // 16:9 writeup cover / hero
  wide: [1600, 800],    // 2:1 banner
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

const rgba = (hex, a) => {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// Resolve the theme palette every template draws from.
export function palette(theme, tokens) {
  const t = { ...DEFAULT_TOKENS, ...tokens };
  const dark = theme === 'dark';
  return {
    dark,
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
  };
}

const ml = (s) => esc(s).replace(/\n/g, '<br>'); // multiline label

// An absolutely-positioned node centered on (x, y).
function nodeBox({ x, y, w, h, label, variant, fontSize = 40 }, c) {
  const anchor = variant === 'anchor';
  const diamond = variant === 'diamond';
  const fill = anchor ? c.anchorFill : c.nodeFill;
  const color = anchor ? c.anchorText : c.nodeText;
  const border = anchor ? `2px solid ${c.anchorBorder}` : c.nodeBorderW ? `${c.nodeBorderW}px solid ${c.nodeBorder}` : 'none';
  const shape = diamond
    ? `width:${w}px;height:${w}px;transform:translate(-50%,-50%) rotate(45deg);border-radius:14px;`
    : `width:${w}px;height:${h}px;transform:translate(-50%,-50%);border-radius:18px;`;
  const inner = diamond
    ? `<span style="display:block;transform:rotate(-45deg);line-height:1.05">${ml(label)}</span>`
    : ml(label);
  return `<div class="fig-node" style="left:${x}px;top:${y}px;${shape}` +
    `background:${fill};color:${color};border:${border};box-shadow:${c.nodeShadow};` +
    `font-size:${fontSize}px;font-weight:${anchor ? 700 : 600}">${inner}</div>`;
}

// Full-canvas SVG layer for connectors, behind the nodes.
function svgLayer(W, H, inner) {
  return `<svg class="fig-lines" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
      <path d="M0,0 L7,3 L0,6 Z" fill="var(--line)"/></marker></defs>${inner}</svg>`;
}
const seg = (x1, y1, x2, y2, { dashed, arrow } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--line)" stroke-width="3"` +
  `${dashed ? ' stroke-dasharray="3 9" stroke-linecap="round"' : ''}` +
  `${arrow ? ' marker-end="url(#arrow)"' : ''}/>`;

// ---- templates -------------------------------------------------------------
// Each returns the inner HTML of <body>. Geometry uses the logical W×H.

function tplTitle(spec, W, H, c) {
  const align = spec.align === 'left' ? 'flex-start' : 'center';
  const ta = spec.align === 'left' ? 'left' : 'center';
  const pad = Math.round(W * 0.085);
  return `<div style="width:${W}px;height:${H}px;display:flex;flex-direction:column;
    justify-content:center;align-items:${align};text-align:${ta};padding:0 ${pad}px;gap:0">
    ${spec.eyebrow ? `<div style="font-size:30px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:${c.eyebrow}">${esc(spec.eyebrow)}</div>` : ''}
    <div style="font-size:${spec.headlineSize || 92}px;font-weight:800;letter-spacing:-2px;line-height:1.04;color:${c.headline};margin-top:22px">${ml(spec.headline || '')}</div>
    <div style="width:88px;height:6px;border-radius:3px;background:${c.rule};margin-top:34px"></div>
    ${spec.subline ? `<div style="font-size:34px;font-weight:400;line-height:1.35;color:${c.subline};margin-top:34px;max-width:${Math.round(W * 0.78)}px">${ml(spec.subline)}</div>` : ''}
    ${spec.footer ? `<div style="font-size:26px;font-weight:600;letter-spacing:.5px;color:${c.eyebrow};margin-top:40px">${esc(spec.footer)}</div>` : ''}
  </div>`;
}

function tplFlow(spec, W, H, c) {
  const rows = spec.rows || [];
  const padX = Math.round(W * 0.07);
  const padY = Math.round(H * 0.16);
  const bh = Math.min(92, Math.round((H - padY * 2) / (rows.length * 2.4)));
  // Cluster the rows around the vertical center with a bounded gap, so a
  // two-row before/after doesn't leave a dead band down the middle.
  const rowGap = Math.min((H - padY * 2) / Math.max(rows.length - 1, 1), bh * 3.4);
  const startY = H / 2 - (rowGap * (rows.length - 1)) / 2;
  const rowY = (i) => (rows.length === 1 ? H / 2 : startY + rowGap * i);
  const lines = [];
  const nodes = [];
  const labels = [];
  rows.forEach((row, ri) => {
    const steps = row.steps || [];
    const y = rowY(ri);
    // Inset the first/last box centers by half a box so nothing bleeds off-canvas.
    const bw = Math.min(260, Math.round(((W - padX * 2) / steps.length) * 0.78));
    const left = padX + bw / 2;
    const right = W - padX - bw / 2;
    const gap = steps.length > 1 ? (right - left) / (steps.length - 1) : 0;
    const xs = steps.map((_, si) => (steps.length === 1 ? W / 2 : left + gap * si));
    if (row.label) labels.push(`<div style="position:absolute;left:${padX}px;top:${y - bh / 2 - 44}px;font-size:26px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:${c.eyebrow}">${esc(row.label)}</div>`);
    steps.forEach((label, si) => {
      const variant = row.anchor && row.anchor === label ? 'anchor' : undefined;
      nodes.push(nodeBox({ x: xs[si], y, w: bw, h: bh, label, variant, fontSize: 30 }, c));
      if (si > 0) lines.push(seg(xs[si - 1] + bw / 2, y, xs[si] - bw / 2 - 4, y, { arrow: true }));
    });
    if (ri > 0) lines.push(seg(W / 2, rowY(ri - 1) + bh / 2 + 14, W / 2, y - bh / 2 - 14, { dashed: true }));
  });
  return svgLayer(W, H, lines.join('')) + labels.join('') + nodes.join('');
}

function tplDiamond(spec, W, H, c) {
  const n = spec.nodes || {};
  const cx = W / 2, cy = H / 2;
  const bw = Math.round(W * 0.21), bh = Math.round(H * 0.13);
  const dh = Math.round(H * 0.1); // diamond half-size
  const pos = {
    top: { x: cx, y: Math.round(H * 0.18) },
    bottom: { x: cx, y: Math.round(H * 0.82) },
    left: { x: Math.round(W * 0.225), y: cy },
    right: { x: Math.round(W * 0.775), y: cy },
  };
  const lines = [
    seg(pos.top.x, pos.top.y + bh / 2, cx, cy - dh),
    seg(pos.bottom.x, pos.bottom.y - bh / 2, cx, cy + dh),
    seg(pos.left.x + bw / 2, pos.left.y, cx - dh, cy),
    seg(pos.right.x - bw / 2, pos.right.y, cx + dh, cy),
  ];
  const nodes = ['top', 'left', 'right', 'bottom']
    .filter((k) => n[k])
    .map((k) => nodeBox({ x: pos[k].x, y: pos[k].y, w: bw, h: bh, label: n[k], fontSize: 40 }, c));
  const center = nodeBox({ x: cx, y: cy, w: dh * 2, h: dh * 2, label: spec.center || '', variant: 'diamond', fontSize: 36 }, c);
  return svgLayer(W, H, lines.join('')) + nodes.join('') + center;
}

function tplNodes(spec, W, H, c) {
  const layout = spec.layout || 'row';
  const items = spec.nodes || [];
  const cx = W / 2, cy = H / 2;
  const bw = Math.round(W * 0.2), bh = Math.round(H * 0.13);
  if (layout === 'row') {
    return tplFlow({ rows: [{ steps: items, anchor: spec.anchor, label: spec.label }] }, W, H, c);
  }
  if (layout === 'ring') {
    const r = Math.min(W, H) * 0.34;
    const lines = [], nodes = [];
    items.forEach((label, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / items.length;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      lines.push(seg(cx + (bw * 0.32) * Math.cos(a), cy + (bh * 0.6) * Math.sin(a), x - (bw * 0.5) * Math.cos(a), y - (bh * 0.6) * Math.sin(a)));
      nodes.push(nodeBox({ x, y, w: bw, h: bh, label, fontSize: 32 }, c));
    });
    const center = spec.center ? nodeBox({ x: cx, y: cy, w: Math.round(H * 0.2), h: Math.round(H * 0.2), label: spec.center, variant: 'diamond', fontSize: 34 }, c) : '';
    return svgLayer(W, H, lines.join('')) + nodes.join('') + center;
  }
  // grid (2 columns) connected to an optional center
  const cols = 2, rows = Math.ceil(items.length / cols);
  const lines = [], nodes = [];
  const gx = [W * 0.26, W * 0.74], padY = H * 0.2, usableH = H - padY * 2;
  items.forEach((label, i) => {
    const r = Math.floor(i / cols), col = i % cols;
    const x = gx[col], y = rows === 1 ? cy : padY + (usableH * r) / (rows - 1);
    if (spec.center) lines.push(seg(x + (col === 0 ? bw / 2 : -bw / 2), y, cx, cy));
    nodes.push(nodeBox({ x, y, w: bw, h: bh, label, fontSize: 34 }, c));
  });
  const center = spec.center ? nodeBox({ x: cx, y: cy, w: Math.round(H * 0.2), h: Math.round(H * 0.2), label: spec.center, variant: 'diamond', fontSize: 34 }, c) : '';
  return svgLayer(W, H, lines.join('')) + nodes.join('') + center;
}

export const TEMPLATES = { title: tplTitle, flow: tplFlow, diamond: tplDiamond, nodes: tplNodes };

export function resolveSize(size) {
  if (Array.isArray(size) && size.length === 2) return size.map(Number);
  if (typeof size === 'string' && SIZES[size]) return SIZES[size];
  return SIZES.cover;
}

// Render one figure spec to a PNG on the given (caller-owned) browser.
export async function renderFigure(browser, spec, { outPath, tokens, scale = 2 }) {
  const tpl = TEMPLATES[spec.template];
  if (!tpl) throw new Error(`Unknown figure template: "${spec.template}". Known: ${Object.keys(TEMPLATES).join(', ')}.`);
  const [W, H] = resolveSize(spec.size);
  const c = palette(spec.theme === 'dark' ? 'dark' : 'light', { ...tokens, ...(spec.colors || {}) });
  const body = tpl(spec, W, H, c);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss('Inter')}
*{margin:0;padding:0;box-sizing:border-box}
:root{--line:${c.line}}
html,body{width:${W}px;height:${H}px}
body{font-family:Inter,sans-serif;background:${c.pageBg};-webkit-font-smoothing:antialiased;position:relative;overflow:hidden}
.fig-node{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 22px}
.fig-lines{position:absolute;inset:0}
</style></head><body>${body}</body></html>`;

  const shot = await withPage(
    browser,
    { html, viewport: { width: W, height: H }, deviceScaleFactor: scale },
    (page) => page.screenshot({ type: 'png' }),
  );
  if (outPath) await sharp(shot).png().toFile(outPath);
  return { width: W * scale, height: H * scale, buffer: shot };
}
