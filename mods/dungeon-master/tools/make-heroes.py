# Generates hooks/sprites.ts: the twelve class heroes, the grave skull and the
# overlord, as SVG path markup (one path per colour) per animation frame.
#
# Every sprite is 0x72's "16x16 DungeonTileset II" v1.7 (CC0 1.0,
# https://0x72.itch.io/dungeontileset-ii), so the party matches the overlord,
# the items and the pixel icons. Where two classes share a body (the knights,
# the wizards, the elves) the second is recoloured so each class reads at a
# glance: gold paladin, crimson sorcerer, violet bard, saffron monk and so on.
#
# Heroes sit on a 16x28 grid, bottom-aligned and centred, whole pixels only.
# Each has 4 idle and 4 run frames; a sprite with one animation (the
# necromancer) runs on its idle frames with a 1px stride bob.
#
# Usage: python3 -I make-heroes.py [frames dir] [out .ts]
# Pure stdlib (own PNG decoder, same as make-items.py).
import sys, zlib, struct, json, pathlib

HERE = pathlib.Path(__file__).resolve().parent
# Pass the unpacked pack's frames folder as the first argument.
DEFAULT_FRAMES = None

GRID_W, GRID_H = 16, 28

# Small held weapons, drawn for this mod in the pack's palette (0x72's own
# weapons are as tall as a hero, too big for a 16px-wide cell). '.' is empty;
# the outline is added automatically wherever a weapon pixel meets empty space.
INK = {
    'f': 'fdf7ed', 'c': '72d6ce', 's': '417089', 'g': 'facb3e', 'o': 'ee8e2e',
    'b': '8f4029', 'w': 'c56025', 'd': '483b3a', 'l': '97da3f', 'm': '4ba747', 't': 'd3bfa9',
}
SWORD = ['.f.', '.c.', '.c.', '.c.', '.c.', '.c.', '.c.', 'sgs', '.b.', '.b.']
MACE = ['.c.', 'cfc', '.c.'] + ['.b.'] * 6
AXE = ['bcc', 'bccf', 'bccf', 'bcc'] + ['b'] * 10
LUTE = ['.....bb', '..wwb..', '.wwdw..', '..www..']
DAGGER = ['f', 'c', 'c', 'g', 'b']
STAFF = ['.l.', 'lml', '.l.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.']
BOW = ['bb.', 't.b', 't.b', 't.b', 't.b', 't.b', 't.b', 't.b', 't.b', 'bb.']

# key -> (0x72 base, recolour map {from: to}, held weapon or None)
# A weapon is (art, x, y, behind): its top-left in the base's frame-0 grid
# position; it follows the body's bob from frame to frame.
HEROES = {
    # 0: plain steel plate and a short sword: the archetypal fighter.
    'fighter': ('knight_m', {}, (SWORD, 0, 11, True)),
    # 1: the same plate gilded, a white-and-blue plume and a holy mace.
    'paladin': ('knight_f', {
        '72d6ce': 'f2c14e', '417089': 'a8701c', 'fdf7ed': 'fff4cf',
        'dc4a7b': '5698cc', 'f78697': 'e8f4fb',
    }, (MACE, 0, 13, True)),
    # 2: blue hat, white beard.
    'wizard': ('wizzard_m', {}, None),
    # 3: crimson robes and violet hair: magic from the blood, not the book.
    'sorcerer': ('wizzard_f', {
        '5698cc': 'd94a64', '5956bd': '8e2a4f', 'fdf7ed': '6b3fa0', 'd3bfa9': 'b58bd6',
    }, None),
    # 4: the green-clad elf scout with a bow.
    'ranger': ('elf_m', {}, (BOW, 13, 13, False)),
    # 5: the elf in violet, auburn hair, a lute.
    'bard': ('elf_f', {
        '4ba747': '9b5fd4', '3d734f': '5e3591', 'facb3e': 'c8642c', 'ee8e2e': '8f4029',
    }, (LUTE, 6, 22, False)),
    # 6: the wild red-bearded dwarf with an axe.
    'barbarian': ('dwarf_m', {}, (AXE, 1, 6, True)),
    # 7: the orc shaman with a leaf-green charm and a budding staff.
    'druid': ('orc_shaman', {'d44e52': '7ccf4a', '62232f': '3d734f', '8f4029': '6b4a2b'}, (STAFF, 1, 11, True)),
    # 8: a teal lizardfolk in a saffron wrap, unarmed.
    'monk': ('lizard_f', {'62232f': 'c0611d', '8f4029': 'f39c32', '9f294e': 'f39c32', 'da4e38': 'fde68a'}, None),
    # 9: hooded and masked, a blood-red scarf and a dagger.
    'rogue': ('doc', {'417089': 'b8323c'}, (DAGGER, 14, 18, False)),
    # 10: the purple-hooded necromancer with burning eyes.
    'warlock': ('necromancer', {}, None),
    # 11: winged, haloed, in blue.
    'cleric': ('angel', {}, None),
}


def decode(path):
    data = pathlib.Path(path).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, w, h = 8, b'', 0, 0
    while pos < len(data):
        length, kind = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', body)
            assert depth == 8 and ctype == 6 and interlace == 0, path
        elif kind == b'IDAT':
            idat += body
        pos += 12 + length
    raw, stride, rows, prev = zlib.decompress(idat), w * 4, [], bytearray(w * 4)
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - 4] if i >= 4 else 0
            b = prev[i]
            c = prev[i - 4] if i >= 4 else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line); prev = line
    return w, h, [['%02x%02x%02x' % tuple(r[x * 4:x * 4 + 3]) if r[x * 4 + 3] >= 128 else None for x in range(w)] for r in rows]


def top_row(px):
    return next(y for y, row in enumerate(px) if any(row))


def place(px, w, h, grid_w, grid_h, recolour=None, shift=0):
    """Puts a frame on the grid (bottom-aligned, centred) as {(x, y): colour}."""
    ox, oy = (grid_w - w) // 2, grid_h - h + shift
    out = {}
    for y in range(h):
        for x in range(w):
            col = px[y][x]
            if col is None: continue
            out[(x + ox, y + oy)] = (recolour or {}).get(col, col)
    return out


OUTLINE = '222222'


def hold(cells, weapon, dy, grid_w, grid_h):
    """Draws a weapon in front of (or behind) the body, outlined where it meets empty space."""
    art, wx, wy, behind = weapon
    pixels = {(wx + x, wy + y + dy): INK[ch] for y, row in enumerate(art) for x, ch in enumerate(row) if ch != '.'}
    out = dict(cells)
    for p, col in pixels.items():
        if not behind or p not in cells: out[p] = col
    for (x, y) in pixels:
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if n not in out: out[n] = OUTLINE
    return {p: c for p, c in out.items() if 0 <= p[0] < grid_w and 0 <= p[1] < grid_h}


def markup(cells, grid_w, grid_h):
    """One path per colour, in first-seen order, as horizontal runs."""
    paths = {}
    for y in range(grid_h):
        x = 0
        while x < grid_w:
            col = cells.get((x, y))
            if col is None: x += 1; continue
            run = 1
            while cells.get((x + run, y)) == col: run += 1
            paths.setdefault(col, []).append(f'M{x} {y}h{run}v1h-{run}z')
            x += run
    return ''.join(f'<path fill="#{col}" d="{"".join(ds)}"/>' for col, ds in paths.items())


def frames_of(frames, stem):
    out = []
    for i in range(4):
        p = frames / f'{stem}_f{i}.png'
        if p.exists(): out.append(decode(p))
    return out


def hero(frames, base, recolour, weapon):
    idle = frames_of(frames, f'{base}_idle_anim') or frames_of(frames, f'{base}_anim')
    run = frames_of(frames, f'{base}_run_anim')
    bob = [0] * 4
    if not run:
        run, bob = idle, [0, -1, 0, -1]
    assert len(idle) == 4 and len(run) == 4, base
    top0 = top_row(idle[0][2])

    def draw(frame, shift):
        w, h, px = frame
        cells = place(px, w, h, GRID_W, GRID_H, recolour, shift)
        if weapon:
            cells = hold(cells, weapon, top_row(px) - top0 + shift, GRID_W, GRID_H)
        assert all(0 <= x < GRID_W and 0 <= y < GRID_H for x, y in cells), base
        return markup(cells, GRID_W, GRID_H)

    return {'idle': [draw(f, 0) for f in idle], 'run': [draw(f, s) for f, s in zip(run, bob)]}


def main():
    frames = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: give the frames folder of 0x72 DungeonTileset II as the first argument')
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else HERE.parent / 'hooks' / 'sprites.ts'
    sprites = {key: hero(frames, *spec) for key, spec in HEROES.items()}
    w, h, px = decode(frames / 'skull.png')
    skull = markup(place(px, w, h, w, h), w, h)
    demon = {}
    for anim in ('idle', 'run'):
        demon[anim] = [markup(place(px, w, h, 32, 36), 32, 36) for w, h, px in frames_of(frames, f'big_demon_{anim}_anim')]

    ts = (
        '// Generated by tools/make-heroes.py from 0x72\'s "16x16 DungeonTileset II" v1.7\n'
        '// (CC0, https://0x72.itch.io/dungeontileset-ii), some recoloured per class.\n'
        '// Each frame is SVG path markup on a 16x28 grid, one path per colour. Do not edit by hand.\n\n'
        'export type Sprite = { idle: readonly string[]; run: readonly string[] }\n\n'
        f'export const SPRITES = {json.dumps(sprites, indent=2)} as const satisfies Record<string, Sprite>\n\n'
        'export type HeroKey = keyof typeof SPRITES\n\n'
        f'export const SKULL = {json.dumps(skull)}\n\n'
        '// The overlord, on a 32x36 grid.\n'
        f'export const OVERLORD = {json.dumps(demon, indent=2)} as const satisfies Sprite\n'
    )
    out.write_text(ts)
    print(f'wrote {out} ({len(ts)} bytes, {len(sprites)} heroes)')


if __name__ == '__main__':
    main()
