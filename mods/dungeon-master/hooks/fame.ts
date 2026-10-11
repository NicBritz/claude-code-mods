// The hall of fame: each hero's lifetime XP and record across sessions.
// XP comes from quests: a finished one pays most, more for a longer one.

import type { Fame, PalStatus } from '../types'

export const EMPTY_FAME: Fame = { xp: 0, quests: 0, fell: 0, stopped: 0, tokens: 0, cost: 0 }

export function xpFor(status: PalStatus, steps: number): number {
  if (status === 'done') return 10 + Math.min(20, Math.floor(steps / 2))
  if (status === 'stopped') return 2
  if (status === 'failed') return 3

  return 0
}

// Level n is reached at 25 * (n - 1)^2 XP: 25, 100, 225, 400 ...
export const levelOf = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1
export const xpForLevel = (level: number) => 25 * (level - 1) ** 2

// Ten pips of progress from this level to the next.
export function progressBar(xp: number): string {
  const level = levelOf(xp)
  const from = xpForLevel(level)
  const to = xpForLevel(level + 1)
  const filled = Math.round(((xp - from) / (to - from)) * 10)

  return '▰'.repeat(filled) + '▱'.repeat(10 - filled)
}

// The XP bar: progress from this level to the next as a pixel bar, gold on
// a dark trough, ten notches.
export function xpBarSvg(xp: number, width: number, gold: string, trough: string): string {
  const level = levelOf(xp)
  const from = xpForLevel(level)
  const to = xpForLevel(level + 1)
  const inner = width - 2
  const filled = Math.round(((xp - from) / (to - from)) * inner)
  const notches = Array.from({ length: 9 }, (_, i) => `<rect x="${1 + Math.round(((i + 1) * inner) / 10)}" y="1" width="1" height="4" fill="#000" opacity="0.25"/>`).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 6" width="${width}" height="6" shape-rendering="crispEdges">` +
    `<rect x="0" y="0" width="${width}" height="6" fill="#111"/><rect x="1" y="1" width="${inner}" height="4" fill="${trough}"/>` +
    `<rect x="1" y="1" width="${filled}" height="4" fill="${gold}"/><rect x="1" y="1" width="${filled}" height="1" fill="#fff" opacity="0.35"/>${notches}</svg>`
  )
}

export function withQuest(record: Fame | undefined, status: PalStatus, xp: number): Fame {
  const was = record ?? EMPTY_FAME
  return {
    ...was,
    xp: was.xp + xp,
    quests: was.quests + (status === 'done' ? 1 : 0),
    fell: was.fell + (status === 'failed' ? 1 : 0),
    stopped: was.stopped + (status === 'stopped' ? 1 : 0),
  }
}

export function withSpend(record: Fame | undefined, tokens: number, cost: number | null): Fame {
  const was = record ?? EMPTY_FAME
  return { ...was, tokens: was.tokens + tokens, cost: was.cost + (cost ?? 0) }
}

// A stored value is used only if it has the shape; anything else starts afresh.
export function readFame(value: unknown): Record<string, Fame> {
  if (typeof value !== 'object' || value === null) return {}
  const out: Record<string, Fame> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    const num = (k: string) => (typeof e[k] === 'number' && Number.isFinite(e[k]) ? (e[k] as number) : 0)
    out[key] = { xp: num('xp'), quests: num('quests'), fell: num('fell'), stopped: num('stopped'), tokens: num('tokens'), cost: num('cost') }
  }

  return out
}
