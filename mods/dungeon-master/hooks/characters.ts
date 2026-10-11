// The character select screen: a sheet for each character the main thread
// can be (the Overlord, or a party hero by its slot), and its portrait, the
// sprite's own idle frames animated inside the picture so it breathes
// without the panel redrawing.

import { HEROES, heroOf } from './heroes'
import { OVERLORD, SPRITES } from './sprites'

// STR, DEX, CON, INT, WIS, CHA, as on a character sheet.
export type Scores = readonly [number, number, number, number, number, number]
export const SCORE_NAMES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const

export type Sheet = { tale: string; scores: Scores }

// -1 is the Overlord; 0 to 11 the party, in their fixed slots.
const SHEETS: Record<number, Sheet> = {
  [-1]: { tale: 'An ancient demon of the deep halls, who rules the dungeon and sends heroes where it wills.', scores: [18, 10, 17, 16, 14, 15] },
  0: { tale: 'A sellsword turned champion. First through the door, last to leave it.', scores: [17, 12, 16, 10, 11, 10] },
  1: { tale: 'Sworn to an oath of light, with a mace that has settled many arguments.', scores: [16, 10, 14, 10, 13, 16] },
  2: { tale: 'A scholar of the old tomes, who answers most questions with another spell.', scores: [8, 13, 12, 18, 14, 11] },
  3: { tale: 'Born with wild magic in the blood. It does not always ask before it leaves.', scores: [9, 14, 13, 12, 10, 18] },
  4: { tale: 'A tracker of the deep woods who can follow a trail through any maze.', scores: [12, 17, 13, 11, 15, 10] },
  5: { tale: 'A wandering minstrel. Every quest becomes a song, whether you like it or not.', scores: [9, 15, 12, 13, 10, 17] },
  6: { tale: 'Raised by storms and mountain goats. Solves most problems by hitting them.', scores: [18, 12, 17, 8, 10, 9] },
  7: { tale: 'An orc shaman who speaks for the old roots and the slow, patient green.', scores: [12, 11, 15, 11, 17, 10] },
  8: { tale: 'A lizardfolk monk of the still pool. Moves before you see it move.', scores: [13, 18, 13, 10, 16, 9] },
  9: { tale: 'A masked shadow from the night markets. Was never here, took nothing.', scores: [10, 18, 12, 14, 12, 13] },
  10: { tale: 'Bound to a patron best left unnamed, and paid in secrets.', scores: [9, 13, 14, 13, 11, 17] },
  11: { tale: 'A winged healer of the temple. Mends what the others break.', scores: [12, 10, 14, 11, 18, 14] },
}

const FALLBACK: Sheet = { tale: 'A traveller of unknown tale.', scores: [10, 10, 10, 10, 10, 10] }

// Every look the main character can take, in the order the arrows walk it.
export const LOOKS: readonly number[] = [-1, ...HEROES.map((_, index) => index)]

export function sheetOf(look: number): Sheet {
  return SHEETS[look] ?? FALLBACK
}

export function lookName(look: number): { name: string; title: string } {
  if (look < 0) return { name: 'The Overlord', title: 'Demon lord' }
  const hero = heroOf(look)
  return { name: hero.name, title: hero.title }
}

// The look one step along (wrapping round), for the ◀ ▶ arrows.
export function stepLook(look: number, by: 1 | -1): number {
  const at = Math.max(0, LOOKS.indexOf(look))
  return LOOKS[(at + by + LOOKS.length) % LOOKS.length] ?? -1
}

// The D&D modifier for a score: 10 or 11 is +0, each two points one more.
export const modifier = (score: number) => {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : String(mod)
}

// The portrait: the idle frames one after another, forever, at 5 a second.
export function portraitSvg(look: number, height: number): { svg: string; width: number; height: number } {
  const isLord = look < 0
  const frames = isLord ? OVERLORD.idle : (SPRITES[heroOf(look).sprite]?.idle ?? [])
  const box = isLord ? { x: 0, y: -2, w: 32, h: 38 } : { x: 0, y: -2, w: 16, h: 30 }
  const width = Math.round((height * box.w) / box.h)
  const step = 0.2
  const total = (step * frames.length).toFixed(1)
  const layers = frames
    .map((frame, index) => {
      const values = frames.map((_, at) => (at === index ? '1' : '0')).join(';')
      return `<g opacity="${index === 0 ? 1 : 0}"><animate attributeName="opacity" values="${values}" dur="${total}s" calcMode="discrete" repeatCount="indefinite"/>${frame}</g>`
    })
    .join('')
  const shadow = isLord ? '<ellipse cx="16" cy="35.5" rx="10" ry="1.2" fill="#000" opacity="0.25"/>' : '<ellipse cx="8" cy="27.5" rx="5" ry="1" fill="#000" opacity="0.25"/>'

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" width="${width}" height="${height}" shape-rendering="crispEdges">${shadow}${layers}</svg>`,
    width,
    height,
  }
}

// One ability score as a small pixel bar out of 20, in the theme's gold.
export function scoreBarSvg(score: number, gold: string, trough: string): string {
  const width = 40
  const filled = Math.round((Math.max(0, Math.min(20, score)) / 20) * (width - 2))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 5" width="${width}" height="5" shape-rendering="crispEdges">` +
    `<rect width="${width}" height="5" fill="#111"/><rect x="1" y="1" width="${width - 2}" height="3" fill="${trough}"/>` +
    `<rect x="1" y="1" width="${filled}" height="3" fill="${gold}"/></svg>`
  )
}

// The top row the look's figure ever reaches (any idle or run frame), so the
// strip can drop the empty headroom above it and sit the figure in the middle.
const tops = new Map<number, number>()
export function figureTop(look: number): number {
  const known = tops.get(look)
  if (known !== undefined) return known
  const sprite = look < 0 ? OVERLORD : SPRITES[heroOf(look).sprite]
  const frames = sprite === undefined ? [] : [...sprite.idle, ...sprite.run]
  const rows = frames.flatMap(frame => [...frame.matchAll(/M-?\d+(?:\.\d+)? (-?\d+(?:\.\d+)?)/g)].map(match => Number(match[1])))
  const top = rows.length === 0 ? 0 : Math.min(...rows)
  tops.set(look, top)
  return top
}

// A character drawing (heroSvg / overlordSvg output) cropped to its figure:
// the same pixel scale, two rows kept above the head for the "!".
export function croppedFigure(svg: string, look: number, pxPerRow: number): { svg: string; width: number; height: number } {
  const box = look < 0 ? { w: 32, bottom: 36 } : { w: 16, bottom: 28 }
  const top = Math.max(-2, figureTop(look) - 2)
  const rows = box.bottom - top
  const width = Math.round(box.w * pxPerRow)
  const height = Math.round(rows * pxPerRow)
  return {
    svg: svg
      .replace(/viewBox="[^"]*"/, `viewBox="0 ${top} ${box.w} ${rows}"`)
      .replace(/ width="\d+"/, ` width="${width}"`)
      .replace(/ height="\d+"/, ` height="${height}"`),
    width,
    height,
  }
}
