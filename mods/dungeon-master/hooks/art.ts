// The art the panel draws with: icons inked from game-icons.net, headings in
// the fantasy font (or, null here, the app's own type), and the d20 that
// rolls beside the working line.

import type { HeadingFont } from '../types'

import { fantasyTextSvg } from './fantasy-font'
import { type InkedName, inkedSvg } from './inked'

export type { InkedName as GlyphName }

export type Picture = { svg: string; width: number; height: number }

export function iconPicture(name: InkedName, size: number, color: string): Picture {
  return { svg: inkedSvg(name, size, color), width: size, height: size }
}

// Null: draw the heading as plain text in the app's font.
export function headingPicture(font: HeadingFont, text: string, color: string, shadow: string, height = 18): Picture | null {
  return font === 'fantasy' ? fantasyTextSvg(text, color, height, shadow) : null
}

// The face showing at this moment: a fresh roll every frame, the same for
// the same frame, so redraws inside one frame agree.
export function rolledFace(frame: number): number {
  let x = Math.imul(frame | 0, 2654435761) >>> 0
  x = (x ^ (x >>> 15)) >>> 0
  return (x % 20) + 1
}

// A tumbling d20: the die turned a little more each frame, with the rolled
// number on a disc on its face so it reads at 22px.
export function diePicture(frame: number, size: number, ink: string, face: string, numeral: string, fixed?: number): Picture {
  const rolled = fixed ?? rolledFace(frame)
  const turn = fixed === undefined ? ((frame * 47) % 360) - 180 : 0
  const die = inkedSvg('d20', 512, ink, turn).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
  const number = fantasyTextSvg(String(rolled), numeral, 260)
  const w = Math.min(330, number.width)
  const h = Math.round((260 * w) / number.width)
  const inner = number.svg
    .replace(/^<svg /, `<svg x="${256 - w / 2}" y="${262 - h / 2 + 8}" `)
    .replace(/ width="\d+"/, ` width="${w}"`)
    .replace(/ height="\d+"/, ` height="${h}"`)

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">${die}<circle cx="256" cy="262" r="178" fill="${face}"/>${inner}</svg>`,
    width: size,
    height: size,
  }
}

// Several drawings of one picture (successive animation frames, each a whole
// <svg>) as one <svg> that steps through them by itself, forever. The panel
// then never redraws to animate, so a click never lands mid-redraw and is lost.
export function animatedSvg(frames: readonly string[], stepMs: number): string {
  if (frames.length === 0) return ''
  const first = frames[0] ?? ''
  if (frames.length === 1 || frames.every(frame => frame === first)) return first
  const open = /^<svg[^>]*>/.exec(first)?.[0] ?? '<svg xmlns="http://www.w3.org/2000/svg">'
  const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
  const total = ((stepMs * frames.length) / 1000).toFixed(2)
  const layers = frames
    .map((frame, index) => {
      const values = frames.map((_, at) => (at === index ? '1' : '0')).join(';')
      return `<g opacity="${index === 0 ? 1 : 0}"><animate attributeName="opacity" values="${values}" dur="${total}s" calcMode="discrete" repeatCount="indefinite"/>${inner(frame)}</g>`
    })
    .join('')
  return `${open}${layers}</svg>`
}

// The frames a moving thing cycles through: eight steps at FRAME_MS covers the
// walk (four frames) and the slower idle and "!" blink (two steps a frame).
export const LOOP_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7] as const
