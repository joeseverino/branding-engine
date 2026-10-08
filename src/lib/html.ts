// Escape text for safe interpolation into the HTML the Chromium renderers build.
export const esc = (s: unknown): string =>
  String(s).replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
