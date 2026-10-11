// The party's rules as plain functions: what counts as live, the colours,
// the wording of a summary, who follows whom. Nothing here touches the
// engine; the hooks module (register.tsx) does that.

import type { Overlord, Pal, PalStatus, Usage } from '../types'
import { dollars, tokens } from './cost'
import type { Ending } from './heroes'

const KEEP = 40
// How long the strip above the prompt keeps saying a quest just ended.
export const RECENT_MS = 90_000

export const isActive = (pal: Pal) => pal.status === 'working' || pal.status === 'waiting'

// A pal saved by an older version of this mod (state outlives a reload).
export const isCurrent = (pal: Pal) => typeof pal.hero === 'number' && typeof pal.epitaph === 'string' && pal.ask !== undefined

export const ENDING: Record<PalStatus, Ending> = {
  working: 'done',
  waiting: 'done',
  done: 'done',
  failed: 'error',
  stopped: 'stopped',
}

export const OUTCOME: Record<PalStatus, string> = {
  working: 'On a quest',
  waiting: 'Needs you',
  done: 'Quest complete',
  failed: 'Fell to an error',
  stopped: 'Stopped by you',
}

// Card borders, one per live hero: none red (the graveyard's colour) or amber
// (needs you), each at least 3:1 against both a dark and a light background.
export const BORDERS = ['#3B82F6', '#0D9488', '#16A34A', '#8B5CF6', '#C026D3', '#7C8F1E'] as const
export const borderOf = (pal: Pal) => BORDERS[(pal.color ?? pal.hero) % BORDERS.length] ?? BORDERS[0]

// Live pals saved before colours existed get the first free ones, in order.
export function withColours(list: Pal[]): Pal[] {
  if (list.every(pal => pal.color !== undefined || !isActive(pal))) return list
  const used = new Set(list.filter(isActive).map(pal => pal.color))
  return list.map(pal => {
    if (pal.color !== undefined || !isActive(pal)) return pal
    const color = BORDERS.findIndex((_, index) => !used.has(index))
    used.add(color)
    return { ...pal, color: color === -1 ? pal.hero % BORDERS.length : color }
  })
}

// Keeps every live pal and as many of the newest graves as fit.
export function trimmed(list: Pal[]): Pal[] {
  if (list.length <= KEEP) return list
  const graves = list.filter(pal => !isActive(pal)).sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))
  const drop = new Set(graves.slice(0, list.length - KEEP).map(pal => pal.id))

  return list.filter(pal => !drop.has(pal.id))
}


export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function summary(list: readonly Pal[]): string {
  const waiting = list.filter(pal => pal.status === 'waiting').length
  const working = list.filter(pal => pal.status === 'working').length
  const parts = [
    waiting > 0 && `${plural(waiting, 'needs', 'need')} you`,
    working > 0 && `${plural(working, 'hero', 'heroes')} on a quest`,
  ].filter(Boolean)

  return parts.length === 0 ? 'No one on a quest' : parts.join(' · ')
}

export function sessionSpend(list: readonly Pal[], lord: Overlord): string {
  const used: Usage[] = [...(lord.usage ? [lord.usage] : []), ...list.flatMap(pal => (pal.usage ? [pal.usage] : []))]
  if (used.length === 0) return ''
  const all = used.reduce((sum, usage) => sum + usage.input + usage.output + usage.cacheRead + usage.cacheWrite, 0)
  const priced = used.filter(usage => usage.cost !== null)
  const cost = priced.length === 0 ? null : priced.reduce((sum, usage) => sum + (usage.cost ?? 0), 0)

  return `This session: ${tokens(all)} tokens ${dollars(cost)} at API rates`.trim()
}

// The top live ancestor a pal follows, or the pal itself.
export function leaderOf(pal: Pal, live: readonly Pal[]): Pal {
  let at = pal
  for (let hops = 0; hops < 8; hops += 1) {
    const parent = live.find(one => one.id === at.parentId)
    if (parent === undefined) return at
    at = parent
  }

  return at
}

