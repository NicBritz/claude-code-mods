# Generates hooks/fantasy-font.ts: Cinzel Decorative Bold (SIL Open Font
# Licence 1.1, Natanael Gama; see CREDITS.md) as SVG outlines per character,
# so headings can be drawn in it: the app takes no font from a mod, but it
# draws an SVG. Usage: python3 -I tools/make-font.py <font.ttf> hooks/fantasy-font.ts
import json, pathlib, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

font = TTFont(sys.argv[1])
OUT = pathlib.Path(sys.argv[2])
upm = font['head'].unitsPerEm
cmap = font.getBestCmap()
glyphs = font.getGlyphSet()
hhea = font['hhea']
ascent, descent = hhea.ascent, hhea.descent

CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;'’-!?&/()·#%+"
data = {}
for ch in CHARS:
    name = cmap.get(ord(ch))
    if name is None:
        continue
    pen = SVGPathPen(glyphs)
    # Font units are y-up from the baseline; SVG is y-down from the top.
    glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, 0, ascent)))
    d = pen.getCommands()
    # Two decimals are plenty at heading sizes.
    import re
    d = re.sub(r'-?\d+\.\d+', lambda m: f'{float(m.group()):.0f}', d)
    data[ch] = [glyphs[name].width, d]

ts = (
    "// \"Fantasy\": glyph outlines converted by tools/make-font.py from Cinzel\n"
    "// Decorative Bold, Copyright (c) 2012 Natanael Gama, with Reserved Font Name\n"
    "// 'Cinzel'. This converted font data is a Modified Version under the SIL Open\n"
    "// Font License 1.1 and is itself licensed under it (licences/CinzelDecorative-OFL.txt);\n"
    "// as the licence asks, it does not use the reserved name. Do not edit by hand.\n\n"
    f"const EM = {upm}\nconst HEIGHT = {ascent - descent}\n\n"
    f"const GLYPHS: Record<string, readonly [number, string]> = {json.dumps(data, ensure_ascii=False)}\n\n"
    "// A heading in the fantasy font: one SVG, `height` px tall, as wide as the\n"
    "// words need. `shadow` draws a 1px dark offset under the letters.\n"
    "export function fantasyTextSvg(text: string, color: string, height = 18, shadow?: string): { svg: string; width: number; height: number } {\n"
    "  let x = 0\n"
    "  const parts: string[] = []\n"
    "  for (const ch of text) {\n"
    "    const glyph = GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? GLYPHS[' ']\n"
    "    if (glyph === undefined) continue\n"
    "    if (glyph[1] !== '') parts.push(`<path transform=\"translate(${x} 0)\" d=\"${glyph[1]}\"/>`)\n"
    "    x += glyph[0]\n"
    "  }\n"
    "  const scale = height / HEIGHT\n"
    "  const width = Math.max(1, Math.ceil(x * scale) + 2)\n"
    "  const letters = parts.join('')\n"
    "  const under = shadow === undefined ? '' : `<g fill=\"${shadow}\" transform=\"translate(${(1 / scale).toFixed(1)} ${(1 / scale).toFixed(1)})\">${letters}</g>`\n"
    "  return {\n"
    "    svg: `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ${Math.ceil(x) + Math.ceil(2 / scale)} ${HEIGHT}\" width=\"${width}\" height=\"${height}\">${under}<g fill=\"${color}\">${letters}</g></svg>`,\n"
    "    width,\n"
    "    height,\n"
    "  }\n"
    "}\n\n"
    "export const FANTASY_EM = EM\n"
)
OUT.write_text(ts)
print(OUT, len(ts), 'bytes', len(data), 'glyphs', 'upm', upm, 'ascent', ascent, 'descent', descent)
