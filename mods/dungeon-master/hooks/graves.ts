// Pixel gravestones for the graveyard, drawn for this mod in 0x72's own wall
// colours and outline: a gilded cross and flowers for a quest won, a crack and
// the pack's skull for a hero who fell, moss and a drifting "z" for one you
// stopped.

import type { Ending } from './heroes'
import { SKULL } from './sprites'

// The stone ramp and outline are 0x72's own wall colours (wall_mid, column),
// so the stones sit in the same world as the heroes.
const PALETTE: Record<string, string> = {
  '#': '#222222', // outline, as on every sprite in the pack
  h: '#D3BFA9', // lit edge
  l: '#AA8D7A', // stone face
  m: '#775C55', // weathered stone
  d: '#483B3A', // shadowed side
  k: '#21141B', // engraving and cracks
  s: '#483B3A', // the dirt mound
  S: '#2E2424', // darker dirt
  y: '#F2C14E', // gold
  Y: '#B8862B', // gold, shaded
  v: '#6E8B3D', // moss
  V: '#94B05A', // moss, lit
  p: '#E8758A', // a flower
  f: '#F2C14E', // another
  g: '#4F7A39', // a stem
}

function baseRows(): string[][] {
  const rows = [
    '.....######.....',
    '...##hhhhhh##...',
    '..#hhllllllmm#..',
    '.#hllllllllmmd#.',
    '.#hllllkkllmmd#.',
    '.#hllkkkkkkmmd#.',
    '.#hllllkkllmmd#.',
    '.#hllllkkllmmd#.',
    '.#hllllkkllmmd#.',
    '.#hlmllkkllmmd#.',
    '.#hllllllmllmd#.',
    '.#hllllllllmmd#.',
    '.#mlllmllllmmd#.',
    '.#mmmmmmmmmmmd#.',
    '#dddddddddddddd#',
    '################',
    '.sSsssSssssSsss.',
  ]

  return rows.map(row => [...row])
}

const put = (rows: string[][], points: ReadonlyArray<readonly [number, number, string]>) => {
  for (const [x, y, ch] of points) {
    const row = rows[y]
    if (row !== undefined && x >= 0 && x < row.length) row[x] = ch
  }
}

function pixels(rows: string[][]): string {
  const byColour = new Map<string, string>()
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x] as string
      const fill = PALETTE[ch]
      if (fill === undefined) {
        x += 1
        continue
      }
      let run = 1
      while (row[x + run] === ch) run += 1
      byColour.set(fill, `${byColour.get(fill) ?? ''}M${x} ${y}h${run}v1h-${run}z`)
      x += run
    }
  })

  return [...byColour].map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('')
}

// Exactly 2x the art's pixels, so each one lands on whole screen pixels.
export const GRAVE_SIZE = { width: 36, height: 42 } as const

export function graveSvg(ending: Ending): string {
  const rows = baseRows()
  let extra = ''
  if (ending === 'done') {
    // A gilded cross, flowers on the mound, a glint.
    rows.forEach((row, y) => row.forEach((ch, x) => (ch === 'k' ? (row[x] = y === 5 && (x === 5 || x === 10) ? 'Y' : 'y') : undefined)))
    put(rows, [
      [2, 16, 'p'], [2, 15, 'g'], [4, 16, 'f'], [12, 16, 'p'], [13, 16, 'f'], [13, 15, 'g'],
    ])
    extra =
      `<g transform="translate(12 -2)"><path fill="#F2C14E" d="M1 0h1v1h1v1h-1v1h-1v-1h-1v-1h1z"><animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite"/></path></g>`
  }
  if (ending === 'error') {
    // Split by a crack, a chip off the top, the fallen hero's skull below.
    put(rows, [[10, 1, '.'], [11, 1, '#'], [10, 2, '#'], [9, 3, 'k'], [10, 4, 'k'], [9, 5, 'k'], [10, 6, 'k'], [11, 7, 'k'], [11, 8, 'k'], [12, 9, 'k'], [3, 10, 'k'], [4, 11, 'k'], [4, 12, 'k'], [5, 12, 'k']])
    extra = `<g transform="translate(-1 10) scale(0.55)">${SKULL}</g>`
  }
  if (ending === 'stopped') {
    // Moss creeping over a stone left in peace, and a drifting "z".
    put(rows, [
      [5, 0, 'v'], [6, 0, 'V'], [3, 1, 'V'], [4, 1, 'v'], [3, 2, 'v'], [2, 3, 'V'], [2, 4, 'v'], [2, 5, 'v'],
      [12, 11, 'v'], [12, 12, 'V'], [11, 12, 'v'], [12, 13, 'v'], [11, 13, 'V'],
    ])
    extra =
      `<g fill="#AA8D7A"><path d="M12 -3h3v1h-1v1h-1v1h2v1h-3v-1h1v-1h1v-1h-2z"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 2;1 -2" dur="2.4s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/></g>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -4 18 21" width="${GRAVE_SIZE.width}" height="${GRAVE_SIZE.height}" shape-rendering="crispEdges">` +
    pixels(rows) +
    extra +
    `</svg>`
  )
}
