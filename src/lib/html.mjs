// Escape text for safe interpolation into the HTML the Chromium renderers build.
export const esc = (s) =>
  String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
