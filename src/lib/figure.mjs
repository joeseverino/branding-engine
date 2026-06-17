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
    <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto-start-reverse">
      <path d="M0,0 L7,3 L0,6 Z" fill="context-stroke"/></marker></defs>${inner}</svg>`;
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

// ---- topology --------------------------------------------------------------
// Network / lab topologies: device-glyph nodes in ringed circles with labeled
// links. Unlike `flow` (boxes-and-arrows pipelines) this keeps the topology
// look — an icon per device, a node label + optional address, and links that
// carry a network name / IP. `layout` is 'row' (linear) or 'ring' (star around
// an optional `center` node). Stroke-style glyphs inherit the node's color.
const GLYPHS = {
  laptop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M1.5 19.5h21L20.5 16h-17l-2 3.5Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  server: '<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/><path d="M7.5 6.5h.01M7.5 17.5h.01"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.66 3.1 3 7 3s7-1.34 7-3V6"/><path d="M5 12c0 1.66 3.1 3 7 3s7-1.34 7-3"/>',
  switch: '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M7.5 10l-2.5 2 2.5 2M16.5 10l2.5 2-2.5 2M5.5 12h6M12.5 12h6"/>',
  router: '<rect x="3" y="13" width="18" height="6" rx="1.5"/><path d="M7 16h.01M12 10V5m0 0 3 2.2M12 5 9 7.2"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.6 3.5 3.5 0 0 0 7 18Z"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
};

function glyphSvg(name, size, color) {
  const g = GLYPHS[name] || GLYPHS.server;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${g}</svg>`;
}

// A ringed device node centered on (x, y). `role` 'anchor'/'attacker' fills the
// circle in the brand accent; everything else is a white circle with an accent ring.
function topoNode({ x, y, d, icon, label, addr, role, labelPos = 'below', labelW, labelAt }, c) {
  const filled = role === 'anchor' || role === 'attacker';
  const fill = filled ? c.accent : c.paper;
  const border = filled ? c.deep : (c.dark ? c.paper : c.accent);
  const glyphColor = filled ? c.onAccent : (c.dark ? c.deep : c.accent);
  const gsize = Math.round(d * 0.54);
  const circle = `<div class="fig-topo-node" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px;` +
    `background:${fill};border:3px solid ${border};box-shadow:${c.nodeShadow}">${glyphSvg(icon || 'server', gsize, glyphColor)}</div>`;
  // Label placement: `labelAt: [dx, dy]` (px from node center) for full control,
  // else `labelPos` above/below/left/right.
  let lx = x, ly, tform;
  if (Array.isArray(labelAt)) {
    lx = x + labelAt[0]; ly = y + labelAt[1]; tform = 'translate(-50%,-50%)';
  } else if (labelPos === 'above') {
    ly = y - d / 2 - 14; tform = 'translate(-50%,-100%)';
  } else if (labelPos === 'left') {
    lx = x - d / 2 - 16; ly = y; tform = 'translate(-100%,-50%)';
  } else if (labelPos === 'right') {
    lx = x + d / 2 + 16; ly = y; tform = 'translate(0,-50%)';
  } else {
    ly = y + d / 2 + 14; tform = 'translateX(-50%)';
  }
  const ta = labelPos === 'left' ? 'right' : labelPos === 'right' ? 'left' : 'center';
  const text = `<div style="position:absolute;left:${lx}px;top:${ly}px;transform:${tform};` +
    `text-align:${ta};line-height:1.18;color:${c.ink};font-weight:700;font-size:30px;width:${labelW || Math.round(d * 2.1)}px">` +
    `${ml(label || '')}${addr ? `<div style="font-weight:500;font-size:24px;color:${c.subline};margin-top:4px">${esc(addr)}</div>` : ''}</div>`;
  return circle + text;
}

// Edge between two positioned nodes; trims to the circle rims, carries a center
// label chip, and optional per-endpoint labels (e.g. the IP octet under each
// arrowhead) just past each node, below the line.
function topoLink(a, b, { label, fromLabel, toLabel, style, dir = 'both', color }, c, out) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const gap = 9;
  const x1 = a.x + ux * (a.d / 2 + gap), y1 = a.y + uy * (a.d / 2 + gap);
  const x2 = b.x - ux * (b.d / 2 + gap), y2 = b.y - uy * (b.d / 2 + gap);
  const stroke = color === 'accent' ? c.accent : 'var(--line)';
  const w = color === 'accent' ? 4 : 3;
  out.lines.push(
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"` +
    `${style === 'dashed' ? ' stroke-dasharray="3 9" stroke-linecap="round"' : ''}` +
    `${dir !== 'none' ? ' marker-end="url(#arrow)"' : ''}` +
    `${dir === 'both' ? ' marker-start="url(#arrow)"' : ''}/>`,
  );
  if (label) {
    const accent = color === 'accent';
    out.labels.push(
      `<div style="position:absolute;left:${(x1 + x2) / 2}px;top:${(y1 + y2) / 2}px;transform:translate(-50%,-50%);` +
      `background:${c.paper};color:${accent ? c.accent : c.ink};font-size:23px;font-weight:${accent ? 700 : 600};line-height:1.2;text-align:center;` +
      `padding:6px 13px;border-radius:8px;box-shadow:${c.nodeShadow}${accent ? `;border:1.5px solid ${c.accent}` : ''}">${ml(label)}</div>`,
    );
  }
  const endLabel = (px, py, txt) => out.labels.push(
    `<div style="position:absolute;left:${px}px;top:${py}px;transform:translate(-50%,-50%);` +
    `color:${c.subline};font-size:24px;font-weight:500;white-space:nowrap">${esc(txt)}</div>`,
  );
  const inset = 36, drop = 30;
  if (fromLabel) endLabel(x1 + ux * inset, y1 + uy * inset + drop, fromLabel);
  if (toLabel) endLabel(x2 - ux * inset, y2 - uy * inset + drop, toLabel);
}

function tplTopology(spec, W, H, c) {
  const layout = ['ring', 'free', 'star'].includes(spec.layout) ? spec.layout : 'row';
  const items = spec.nodes || [];
  const pos = {};
  const out = { lines: [], labels: [] };

  if (layout === 'star') {
    // Hub-and-spoke by compass position. Each node sets `pos`: 'center' for the
    // hub, then 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'. The engine snaps e/w to the
    // hub's exact y and n/s to its exact x, so spoke links are dead straight by
    // construction — no hand-tuned coordinates. Easiest way to a clean topology.
    const cx = W / 2, cy = Math.round(H * 0.47);
    const rx = W * 0.34, ry = H * 0.32;
    // Push diagonals to near-corners so they clear the adjacent cardinal nodes
    // (e.g. a NW controller stays well above a W host) and don't crowd labels.
    const dgx = 0.97, dgy = 0.92;
    const slot = {
      center: [cx, cy], n: [cx, cy - ry], s: [cx, cy + ry], e: [cx + rx, cy], w: [cx - rx, cy],
      ne: [cx + rx * dgx, cy - ry * dgy], nw: [cx - rx * dgx, cy - ry * dgy],
      se: [cx + rx * dgx, cy + ry * dgy], sw: [cx - rx * dgx, cy + ry * dgy],
    };
    const baseD = Math.round(Math.min(W, H) * (spec.nodeScale || 0.16));
    const occupied = new Set(items.map((n) => n.pos));
    items.forEach((node) => {
      const p = slot[node.pos] || slot.center;
      const isCenter = node.pos === 'center';
      const d = Math.round(baseD * (node.scale || (isCenter ? 1.12 : 1)));
      let labelAt = node.labelAt;
      if (isCenter && !labelAt && !node.labelPos) {
        // Park the hub label in the first empty diagonal quadrant.
        const q = ['ne', 'se', 'nw', 'sw'].find((k) => !occupied.has(k)) || 'n';
        const fx = q.includes('e') ? 1 : q.includes('w') ? -1 : 0;
        const fy = q.includes('n') ? -1 : 1;
        labelAt = fx === 0 ? [0, fy * d * 1.0] : [fx * d * 0.98, fy * d * 0.82];
      }
      pos[node.id] = {
        x: p[0], y: p[1], d,
        labelPos: node.labelPos || (isCenter ? undefined : 'below'),
        labelW: node.labelW || (isCenter ? Math.round(d * 1.5) : undefined),
        labelAt,
      };
    });
  } else if (layout === 'free') {
    // Placed layout: each node carries `at: [xFraction, yFraction]` (0..1 of the
    // canvas) and an optional `scale`. The fully general topology — express any
    // arrangement (controller in a corner, an attacker between two hosts) while
    // keeping one template, one spec format, and the shared brand palette.
    const baseD = Math.round(Math.min(W, H) * (spec.nodeScale || 0.16));
    items.forEach((node) => {
      const at = node.at || [0.5, 0.5];
      pos[node.id] = {
        x: at[0] * W,
        y: at[1] * H,
        d: Math.round(baseD * (node.scale || 1)),
        labelPos: node.labelPos || (at[1] < 0.5 ? 'above' : 'below'),
        labelW: node.labelW,
      };
    });
  } else if (layout === 'ring') {
    const cx = W / 2, cy = Math.round(H * 0.50);
    const r = Math.min(W, H) * 0.35;
    const d = Math.round(Math.min(W, H) * 0.16);
    const n = Math.max(items.length, 1);
    // Stagger so no node sits straight above/below the center (where the
    // center node's label and the radial links would collide with it).
    const a0 = -Math.PI / 2 + Math.PI / n;
    items.forEach((node, i) => {
      const a = a0 + (2 * Math.PI * i) / n;
      const y = cy + r * Math.sin(a);
      pos[node.id] = { x: cx + r * Math.cos(a), y, d, labelPos: y < cy ? 'above' : 'below' };
    });
    if (spec.center) pos[spec.center.id] = { x: cx, y: cy, d: Math.round(d * 1.06), labelPos: 'below', labelW: Math.round(d * 1.6) };
  } else {
    const cy = Math.round(H * 0.46);
    const n = items.length;
    const padX = W * 0.13, left = padX, right = W - padX;
    const d = rowNodeD(W, n);
    const gap = n > 1 ? (right - left) / (n - 1) : 0;
    items.forEach((node, i) => {
      pos[node.id] = { x: n === 1 ? W / 2 : left + gap * i, y: cy, d };
    });
  }

  const links = spec.links || (layout === 'row'
    ? items.slice(1).map((node, i) => ({ from: items[i].id, to: node.id, dir: 'to' }))
    : []);
  links.forEach((lk) => {
    const a = pos[lk.from], b = pos[lk.to];
    if (a && b) topoLink(a, b, lk, c, out);
  });

  const all = spec.center ? [...items, spec.center] : items;
  const nodes = all.filter((node) => pos[node.id]).map((node) => topoNode({ ...node, ...pos[node.id] }, c));
  return svgLayer(W, H, out.lines.join('')) + out.labels.join('') + nodes.join('');
}

export const TEMPLATES = { title: tplTitle, flow: tplFlow, diamond: tplDiamond, nodes: tplNodes, topology: tplTopology };

export function resolveSize(size) {
  if (Array.isArray(size) && size.length === 2) return size.map(Number);
  if (typeof size === 'string' && SIZES[size]) return SIZES[size];
  return SIZES.cover;
}

// Resolve the canvas size for a spec, applying a layout-aware default when the
// spec gives no explicit `size`. Radial topologies (star/ring) default to the
// 3:2 `topo` frame so they stay legible on mobile, where width is the
// constraint; everything else defaults to 16:9 `cover`. An explicit `size`
// always wins. This is what keeps authoring scalable — pick the layout, the
// aspect ratio follows.
export function figureSize(spec) {
  if (spec.size != null) return resolveSize(spec.size);
  if (spec.template === 'topology') {
    const layout = spec.layout || 'row';
    // Radial diagrams read bigger on mobile in a 3:2 frame.
    if (layout === 'ring' || layout === 'star') return resolveSize('topo');
    // Linear diagrams get a short, wide banner whose height is sized to the node
    // count, so a 2-node lab fills the frame instead of floating in 16:9.
    if (layout === 'row') {
      const W = 1600;
      const n = (spec.nodes || []).length || 1;
      const d = Math.round(Math.min(((W * 0.74) / n) * 0.62, W * 0.155));
      return [W, Math.max(d + 250, 470)];
    }
  }
  return resolveSize(spec.size);
}

// Node diameter for a row of `n` nodes on a width-`W` canvas. Width-driven (not
// height-driven) so the banner height can shrink to fit without shrinking nodes.
function rowNodeD(W, n) {
  return Math.round(Math.min(((W * 0.74) / Math.max(n, 1)) * 0.62, W * 0.155));
}

// Render one figure spec to a PNG on the given (caller-owned) browser.
export async function renderFigure(browser, spec, { outPath, tokens, scale = 2 }) {
  const tpl = TEMPLATES[spec.template];
  if (!tpl) throw new Error(`Unknown figure template: "${spec.template}". Known: ${Object.keys(TEMPLATES).join(', ')}.`);
  const [W, H] = figureSize(spec);
  const c = palette(spec.theme === 'dark' ? 'dark' : 'light', { ...tokens, ...(spec.colors || {}) });
  const body = tpl(spec, W, H, c);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss('Inter')}
*{margin:0;padding:0;box-sizing:border-box}
:root{--line:${c.line}}
html,body{width:${W}px;height:${H}px}
body{font-family:Inter,sans-serif;background:${c.pageBg};-webkit-font-smoothing:antialiased;position:relative;overflow:hidden}
.fig-node{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 22px}
.fig-topo-node{position:absolute;transform:translate(-50%,-50%);border-radius:50%;display:flex;align-items:center;justify-content:center}
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
