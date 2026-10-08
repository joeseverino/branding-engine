// Ambient types for the two dependencies that ship none. Only the surface the
// glyph extractor reads is declared.

declare module 'opentype.js' {
  interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  interface Path {
    toPathData(options: { decimalPlaces: number; flipY: boolean }): string;
  }

  interface Glyph {
    advanceWidth?: number;
    path: Path;
    getBoundingBox(): BoundingBox;
  }

  interface Variation {
    getDefaultCoordinates(): Record<string, number>;
    process: { getTransform(glyph: Glyph, coords: Record<string, number>): Glyph };
  }

  interface Font {
    unitsPerEm: number;
    tables: { fvar?: { axes: ReadonlyArray<{ tag: string }> } };
    variation?: Variation;
    glyphs: { get(index: number): Glyph };
    charToGlyphIndex(char: string): number;
  }

  const opentype: { parse(buffer: ArrayBuffer): Font };
  export type { Font, Glyph };
  export default opentype;
}

declare module 'wawoff2' {
  const wawoff2: { decompress(data: Uint8Array): Promise<Uint8Array> };
  export default wawoff2;
}
