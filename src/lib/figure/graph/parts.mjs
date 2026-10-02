// HTML fragments for every text-bearing piece of a graph figure. The same
// function renders a piece for measurement and for the final draw, so the box
// the layout reserved is exactly the box that gets painted.
import { esc } from '../../html.mjs';
import { pictogramGlyphSvg } from '../../pictogram.mjs';

const ml = (s) => esc(s).replace(/\n/g, '<br>');

// Base metrics in logical px at textScale 1. Layout works in these units and
// the fit step scales the whole drawing into the canvas.
export const METRICS = {
  d: 150,           // circle node diameter
  labelGap: 14,     // circle rim → its label
  labelMaxW: 340,
  boxTextMaxW: 300,
};

export function colorOf(name, c, fallback) {
  if (!name) return fallback;
  return { accent: c.accent, deep: c.deep, ink: c.ink, muted: c.muted }[name] || name;
}

export function nodeLabelHtml(node, c, ts, align = 'center') {
  const maxW = Math.round((node.labelW || METRICS.labelMaxW) * ts);
  return `<div style="max-width:${maxW}px;text-align:${align};line-height:1.18;color:${c.headline};` +
    `font-weight:700;font-size:${30 * ts}px">${ml(node.label)}` +
    (node.note ? `<div style="font-weight:500;font-size:${24 * ts}px;color:${c.subline};margin-top:${4 * ts}px">${ml(node.note)}</div>` : '') +
    '</div>';
}

// A box node is its own label: rounded rect, optional glyph, text inside.
export function boxStyle(node, c) {
  const filled = node.role === 'anchor' || node.role === 'attacker';
  const tint = colorOf(node.color, c, c.accent);
  const muted = node.role === 'muted';
  return {
    filled,
    fill: filled ? tint : c.nodeFill,
    text: filled ? c.onAccent : c.nodeText,
    sub: filled ? c.onAccent : c.subline,
    glyph: filled ? c.onAccent : muted ? c.muted : tint,
    border: filled ? `2px solid ${c.anchorBorder === c.paper ? c.paper : c.deep}`
      : muted ? `3px dashed ${c.muted}` : c.nodeBorderW ? `${c.nodeBorderW}px solid ${tint}` : 'none',
  };
}

export function boxInnerHtml(node, c, ts) {
  const s = boxStyle(node, c);
  const g = node.icon ? `<div style="flex:none;display:flex">${pictogramGlyphSvg(node.icon, Math.round(40 * ts), s.glyph)}</div>` : '';
  return `<div style="display:flex;align-items:center;gap:${16 * ts}px;padding:${20 * ts}px ${30 * ts}px;` +
    `min-width:${170 * ts}px;min-height:${84 * ts}px;justify-content:center">${g}` +
    `<div style="max-width:${Math.round((node.labelW || METRICS.boxTextMaxW) * ts)}px;text-align:${g ? 'left' : 'center'};line-height:1.18">` +
    `<div style="font-weight:700;font-size:${28 * ts}px;color:${s.text}">${ml(node.label)}</div>` +
    (node.note ? `<div style="font-weight:500;font-size:${22 * ts}px;color:${s.sub};margin-top:${4 * ts}px;opacity:${s.filled ? 0.82 : 1}">${ml(node.note)}</div>` : '') +
    '</div></div>';
}

export function chipHtml(link, c, ts) {
  const accent = link.color === 'accent';
  return `<div style="background:${c.chipBg};color:${accent ? c.accent : c.chipText};font-size:${26 * ts}px;` +
    `font-weight:${accent ? 700 : 600};line-height:1.2;text-align:center;white-space:nowrap;padding:${6 * ts}px ${14 * ts}px;` +
    `border-radius:${9 * ts}px;box-shadow:${c.nodeShadow};border:1.5px solid ${accent ? c.accent : 'transparent'}">${ml(link.label)}</div>`;
}

export function endLabelHtml(text, c, ts) {
  return `<div style="color:${c.subline};font-size:${26 * ts}px;font-weight:600;white-space:nowrap;line-height:1.1">${esc(text)}</div>`;
}

export function groupLabelHtml(group, c, ts) {
  return `<div style="color:${colorOf(group.color, c, c.groupLabel)};font-size:${20 * ts}px;font-weight:700;letter-spacing:${3 * ts}px;` +
    `text-transform:uppercase;white-space:nowrap;line-height:1">${esc(group.label)}</div>`;
}

export function titleHtml(opts, c) {
  if (!opts.title && !opts.subtitle) return '';
  return `<div style="max-width:1300px">` +
    (opts.subtitle ? `<div style="font-size:22px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:${c.eyebrow};margin-bottom:12px">${esc(opts.subtitle)}</div>` : '') +
    (opts.title ? `<div style="font-size:46px;font-weight:800;letter-spacing:-1px;line-height:1.08;color:${c.headline}">${ml(opts.title)}</div>` : '') +
    `<div style="width:64px;height:5px;border-radius:3px;background:${c.rule};margin-top:18px"></div></div>`;
}
