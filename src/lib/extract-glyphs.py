#!/usr/bin/env python3
"""Extract glyph outlines as SVG path data for the brand mark.

Defaults to the bundled Inter variable woff2, but any font works: pass a path to
a .ttf/.otf/.woff2. Variable fonts are instantiated at the given weight; static
fonts use their single master. Output is JSON the node generators consume, so
they stay pure-node.

Usage:
  python3 bin/lib/extract-glyphs.py "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" 800
  python3 bin/lib/extract-glyphs.py "AB" 700 ~/fonts/SomeFont.ttf
  python3 bin/lib/extract-glyphs.py "AB" 700 ~/fonts/SomeFont.ttf myfont-glyphs.json

The default run writes brand-glyphs.json (the kit's glyph cache). A custom font
writes <font-stem>-glyphs.json unless you name the output, so the brand cache is
never clobbered by accident. Point a generator at a non-default file with
BRAND_GLYPHS=<file> (e.g. BRAND_GLYPHS=somefont-glyphs.json ./kit.sh ...).
"""
import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

here = Path(__file__).resolve().parent
root = here.parents[1]
default_font = root / "assets/fonts/inter/inter-variable-latin.woff2"

chars = sys.argv[1] if len(sys.argv) > 1 else "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
weight = float(sys.argv[2]) if len(sys.argv) > 2 else 800.0
font_path = Path(sys.argv[3]).expanduser() if len(sys.argv) > 3 else default_font

if len(sys.argv) > 4:
    out_path = Path(sys.argv[4])
    if not out_path.is_absolute():
        out_path = here / out_path
elif len(sys.argv) > 3:
    # Custom font, no explicit output: derive a name so Inter is never clobbered.
    out_path = here / f"{font_path.stem}-glyphs.json"
else:
    out_path = here / "brand-glyphs.json"

font = TTFont(str(font_path))
if "fvar" in font:
    instantiateVariableFont(font, {"wght": weight}, inplace=True)

glyph_set = font.getGlyphSet()
cmap = font.getBestCmap()
upem = font["head"].unitsPerEm

glyphs = {}
for ch in dict.fromkeys(chars):
    name = cmap[ord(ch)]
    g = glyph_set[name]
    pen = SVGPathPen(glyph_set)
    g.draw(pen)
    bp = BoundsPen(glyph_set)
    g.draw(bp)
    # Blank glyphs (e.g. the space) have no contours, so BoundsPen leaves
    # bounds None; they still carry an advance width the layout needs.
    xmin, ymin, xmax, ymax = bp.bounds or (0, 0, 0, 0)
    glyphs[ch] = {
        "path": pen.getCommands(),
        "advance": g.width,
        "bounds": {"xMin": xmin, "yMin": ymin, "xMax": xmax, "yMax": ymax},
    }

out_path.write_text(json.dumps(
    {"font": font_path.name, "unitsPerEm": upem, "weight": weight, "glyphs": glyphs},
    indent=2,
))
print(f"wrote {out_path.name} from {font_path.name} — upem={upem} weight={int(weight)} chars={''.join(glyphs)}")
