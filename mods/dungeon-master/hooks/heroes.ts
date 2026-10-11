// The party: twelve pixel heroes, one per D&D class, from 0x72's DungeonTilesetII
// (CC0), recoloured and armed per class by tools/make-heroes.py. Each has a name,
// a class and a voice. They jog while they work and stand with a "!" over their
// head when they need you. The hall of fame keys XP by array index, so a slot's
// position in HEROES is that hero's identity: change heroes in place, never reorder.

import type { HeroKey } from './sprites'
import { OVERLORD, SPRITES } from './sprites'

export type Ending = 'done' | 'error' | 'stopped'

export type Hero = {
  sprite: HeroKey
  name: string
  title: string
  done: string[]
  ask: (what: string) => string
  error: string[]
  stopped: string[]
}

export const HEROES: Hero[] = [
  {
    sprite: 'fighter',
    name: 'Brannoc',
    title: 'Fighter',
    done: ['Job done. Next!', 'Swung, struck, sorted.'],
    ask: what => `Right then, shall I ${what}?`,
    error: ['Took a nasty hit on that one.'],
    stopped: ['Sword down. Standing by.'],
  },
  {
    sprite: 'paladin',
    name: 'Dame Elowen',
    title: 'Paladin',
    done: ['By oath and by light, it is done.', 'Justice served. Finished.'],
    ask: what => `On my honour, may I ${what}?`,
    error: ['My oath held. The work did not.'],
    stopped: ['I yield, as you command.'],
  },
  {
    sprite: 'wizard',
    name: 'Ambrose',
    title: 'Wizard',
    done: ['As the tomes foretold. Done.', 'Spell cast, footnotes and all.'],
    ask: what => `I have consulted the tomes. May I ${what}?`,
    error: ['Wrong page. The spell fizzled.'],
    stopped: ['Closing the spellbook.'],
  },
  {
    sprite: 'sorcerer',
    name: 'Vespera',
    title: 'Sorcerer',
    done: ['Done. It runs in the blood.', 'Raw magic, neatly finished.'],
    ask: what => `My fingers are fizzing. Can I ${what}?`,
    error: ['The magic got away from me.'],
    stopped: ['Letting the sparks die down.'],
  },
  {
    sprite: 'ranger',
    name: 'Thornwick',
    title: 'Ranger',
    done: ['Tracked it down. All done.', 'Back from the scouting run.'],
    ask: what => `Fresh tracks ahead. Can I ${what}?`,
    error: ['Lost the trail. Something broke.'],
    stopped: ['Melting back into the trees.'],
  },
  {
    sprite: 'bard',
    name: 'Lark',
    title: 'Bard',
    done: ['Done, and there is a song in it.', 'Finished! Hold your applause.'],
    ask: what => `One quick verse first: may I ${what}?`,
    error: ['Hit a sour note. It failed.'],
    stopped: ['Curtain down. Bow taken.'],
  },
  {
    sprite: 'barbarian',
    name: 'Grimbold',
    title: 'Barbarian',
    done: ['SMASHED IT. Done.', 'Rage spent. Job finished.'],
    ask: what => `Grimbold wants to ${what}. Yes?`,
    error: ['Axe bounced off. Error!'],
    stopped: ['Fine. Grimbold sits.'],
  },
  {
    sprite: 'druid',
    name: 'Gorrum',
    title: 'Druid',
    done: ['The roots have spoken. Done.', 'All grown and finished.'],
    ask: what => `The forest asks: may I ${what}?`,
    error: ['Blight on this one. It withered.'],
    stopped: ['Going back to the moss.'],
  },
  {
    sprite: 'monk',
    name: 'Kesh',
    title: 'Monk',
    done: ['Ssstillness. The task is done.', 'Flowed like water. Finished.'],
    ask: what => `Ssserenely, may I ${what}?`,
    error: ['Even ssstill water can crack.'],
    stopped: ['Returning to meditation.'],
  },
  {
    sprite: 'rogue',
    name: 'Nightjar',
    title: 'Rogue',
    done: ['In and out. Nobody saw a thing.', 'Done. You never hired me.'],
    ask: what => `Psst. Can I quietly ${what}?`,
    error: ['Caught red-handed by an error.'],
    stopped: ['Slipping into the shadows.'],
  },
  {
    sprite: 'warlock',
    name: 'Malvoren',
    title: 'Warlock',
    done: ['My patron is pleased. Done.', 'The pact is honoured.'],
    ask: what => `My patron whispers. May I ${what}?`,
    error: ['The pact went sour on that one.'],
    stopped: ['The whispers fall silent.'],
  },
  {
    sprite: 'cleric',
    name: 'Sister Aurelia',
    title: 'Cleric',
    done: ['Blessed and done.', 'Light restored. Finished.'],
    ask: what => `With your grace, may I ${what}?`,
    error: ['Even I could not heal this one.'],
    stopped: ['Lighting a candle and resting.'],
  },
]

const FIRST = HEROES[0] as Hero

export function heroOf(index: number): Hero {
  return HEROES[index] ?? FIRST
}

export function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }

  return h >>> 0
}

// Who suits the job: scouts explore, wizards plan, clerics review.
function preferred(type: string): number[] {
  const t = type.toLowerCase()
  if (t === 'explore') return [4, 9]
  if (t === 'plan') return [2, 3]
  if (/review|verif|critic|audit/.test(t)) return [11, 10]
  if (t === 'general-purpose') return [0, 1, 6, 7, 8, 9]

  return []
}

// Each live agent gets a hero no other live agent has, while there are some left.
export function assignHero(id: string, type: string, taken: readonly number[]): number {
  const fits = preferred(type)
  const free = fits.filter(index => !taken.includes(index))
  if (free.length > 0) return free[hash(id) % free.length] ?? (free[0] as number)
  const start = hash(id) % HEROES.length
  for (let step = 0; step < HEROES.length; step += 1) {
    const index = (start + step) % HEROES.length
    if (!taken.includes(index)) return index
  }

  return start
}

export function epitaph(hero: number, ending: Ending, seed: string): string {
  const lines = heroOf(hero)[ending]

  return lines[hash(`${seed}:${ending}`) % lines.length] ?? lines.join(' ')
}

// "run pnpm test", "edit pricing.ts": what a hero asks permission for.
export function askPhrase(tool: string, input: unknown): string {
  const args = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const text = (value: unknown) => (typeof value === 'string' ? value : '')
  const clip = (value: string) => (value.length > 60 ? `${value.slice(0, 59)}…` : value)
  const file = text(args.file_path).split('/').pop() ?? ''
  switch (tool) {
    case 'Bash':
      return `run ${clip(text(args.command).split('\n')[0] ?? '') || 'a command'}`
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return `edit ${file || 'a file'}`
    case 'WebFetch':
      return `open ${/^https?:\/\/([^/]+)/.exec(text(args.url))?.[1] ?? 'a web page'}`
    default:
      return `use ${tool.replace(/^mcp__(.+?)__/, '')}`
  }
}

// --- drawing -------------------------------------------------------------

// The desktop draws an Svg as a still image (an animated one only in a frame
// that every redraw rebuilds, which flickers), so the mod animates the heroes
// itself: it redraws a few times a second and draws one frame each time.
export const FRAME_MS = 200

const alert = (bob: number) =>
  `<g transform="translate(0 ${bob})"><rect x="11" y="-1" width="5" height="8" fill="#D93036"/><rect x="13" y="0" width="1" height="4" fill="#FFFFFF"/><rect x="13" y="5" width="1" height="1" fill="#FFFFFF"/></g>`

// Exactly 2x the art's pixels, so each one lands on whole screen pixels.
export const HERO_SIZE = { width: 32, height: 60 } as const
// Followers and the hall of fame: the art at 1x, still whole pixels.
export const MINI_SIZE = { width: 16, height: 30 } as const

type Size = { readonly width: number; readonly height: number }

// `frame` counts up forever; a working hero runs a frame a tick, a waiting one
// idles at half speed with its "!" bobbing, and a compacting one stands still
// while its memories spiral into a scroll (see `condensing`).
export function heroSvg(hero: number, isWaiting: boolean, frame: number, size: Size = HERO_SIZE, isCompacting = false, scrollY = -2): string {
  const sprite = SPRITES[heroOf(hero).sprite]
  const body = isWaiting || isCompacting ? sprite.idle[Math.floor(frame / 2) % sprite.idle.length] : sprite.run[frame % sprite.run.length]

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 16 30" width="${size.width}" height="${size.height}" shape-rendering="crispEdges">` +
    `<ellipse cx="8" cy="27.5" rx="5" ry="1" fill="#000" opacity="0.18"/>` +
    (isCompacting ? condensingGlow(frame, 8, 15, 7) : '') +
    (body ?? '') +
    (isCompacting ? condensing(frame, 8, 15, 7, 6, 8, scrollY) : isWaiting ? alert(frame % 4 < 2 ? 0 : -1) : '') +
    `</svg>`
  )
}

// Compaction, in the party's terms: the agent's memories (runes) spiral in from
// all round it and condense into the scroll over its head, which glows as each
// wave lands. One wave is RUNE_WAVE frames; the ring turns as it shrinks.
export const RUNE_WAVE = 6
const RUNE_COLOURS = ['#A78BFA', '#67E8F9', '#FDE68A'] as const

// scrollY is the scroll's top row: above the head, inside a cropped picture.
export function condensing(frame: number, cx: number, cy: number, reach: number, count: number, scrollX: number, scrollY = -2): string {
  const step = frame % RUNE_WAVE
  const rune = (at: number, index: number, opacity: number) => {
    const s = at % RUNE_WAVE
    const radius = 1 + (reach - 1) * (1 - s / RUNE_WAVE)
    // Each wave climbs toward the scroll as it closes, so the runes visibly go into it.
    const lift = (cy - scrollY - 1) * (s / RUNE_WAVE)
    const angle = ((index * 360) / count + at * 25) * (Math.PI / 180)
    const x = Math.round(cx + radius * Math.cos(angle))
    const y = Math.round(cy - lift + radius * Math.sin(angle))
    return `<rect x="${x}" y="${y}" width="1" height="1" fill="${RUNE_COLOURS[index % RUNE_COLOURS.length]}" opacity="${opacity}"/>`
  }
  let runes = ''
  for (let index = 0; index < count; index += 1) {
    // A short trail where the rune was a frame ago, so the eye catches the spiral.
    if (step > 0) runes += rune(frame - 1, index, 0.45)
    runes += rune(frame, index, 1)
  }
  const isLit = step >= RUNE_WAVE - 2
  const scroll =
    `<g transform="translate(${scrollX - 4} ${scrollY})">` +
    `<rect x="1" y="0.5" width="6" height="2" fill="#F5DEB3"/>` +
    `<rect x="2" y="1" width="4" height="0.5" fill="#B7791F" opacity="0.6"/>` +
    `<rect x="0" y="0" width="1" height="3" fill="#92400E"/><rect x="7" y="0" width="1" height="3" fill="#92400E"/>` +
    (isLit ? `<rect x="3" y="-1" width="2" height="1" fill="#FDE68A"/>` : '') +
    `</g>`

  return runes + scroll
}

// A soft violet glow drawn behind the hero, breathing with each wave, so the
// state reads at a glance even where single runes are too small to pick out.
export function condensingGlow(frame: number, cx: number, cy: number, reach: number): string {
  return `<ellipse cx="${cx}" cy="${cy + 2}" rx="${reach}" ry="${reach + 1}" fill="#8B5CF6" opacity="${(0.08 + 0.025 * (frame % RUNE_WAVE)).toFixed(3)}"/>`
}

// The main thread's overlord: a demon twice a hero's width, drawn at 1.5x
// (whole screen pixels on a 2x display). It strides while the main thread
// works, idles between turns, and raises its "!" when it needs you.
export const OVERLORD_SIZE = { width: 48, height: 57 } as const

export const OVERLORD_VOICE = {
  name: 'The Overlord',
  title: 'main thread',
  ask: (what: string) => `Shall I ${what}? Your word is law.`,
  idle: 'Awaiting your command.',
}

export function overlordSvg(status: 'idle' | 'working' | 'waiting', frame: number, isCompacting = false, scrollY = -2): string {
  const body =
    status === 'working' && !isCompacting ? OVERLORD.run[frame % OVERLORD.run.length] : OVERLORD.idle[Math.floor(frame / 2) % OVERLORD.idle.length]

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 32 38" width="${OVERLORD_SIZE.width}" height="${OVERLORD_SIZE.height}" shape-rendering="crispEdges">` +
    `<ellipse cx="16" cy="35.5" rx="10" ry="1.2" fill="#000" opacity="0.18"/>` +
    (isCompacting ? condensingGlow(frame, 16, 19, 14) : '') +
    (body ?? '') +
    (isCompacting
      ? condensing(frame, 16, 19, 14, 9, 16, scrollY)
      : status === 'waiting'
        ? `<g transform="translate(16 0)">${alert(frame % 4 < 2 ? 0 : -1)}</g>`
        : '') +
    `</svg>`
  )
}
