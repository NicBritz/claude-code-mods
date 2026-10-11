// Stamina: the plan's usage windows (5-hour, weekly) as bars of what is left,
// with a warning when one crosses 80% and again at 95% used.

import type { Context, Stamina } from '../types'

export const WARN_AT = [80, 95] as const

const LABELS: Record<string, string> = { five_hour: '5-hour', seven_day: 'Week', spend_limit: 'Spend' }
export const staminaLabel = (kind: string) => LABELS[kind] ?? kind.replace(/_/g, ' ')

// The bar reuses the context bar's drawing: "used" out of 100.
export const asContext = (limit: Stamina): Context => ({ tokens: Math.min(100, limit.percentUsed), window: 100, model: limit.kind })

// "in 2h 10m", "in 3d 4h", "in 12m"; empty when unknown or past.
export function resetsIn(resetsAt: string | undefined, now: number): string {
  if (resetsAt === undefined) return ''
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at) || at <= now) return ''
  const minutes = Math.round((at - now) / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `in ${days}d ${hours}h`
  if (hours > 0) return `in ${hours}h ${mins}m`

  return `in ${mins}m`
}

export function staminaWords(limit: Stamina, now: number): string {
  const left = Math.max(0, Math.round(100 - limit.percentUsed))
  const reset = resetsIn(limit.resetsAt, now)

  return `${staminaLabel(limit.kind)} ${left}% left${reset ? ` · resets ${reset}` : ''}`
}

// The warning line a crossing earns, or null: only the highest threshold
// newly crossed since the last reading, so one jump gives one warning.
export function crossing(before: number | undefined, after: number): number | null {
  const crossed = WARN_AT.filter(at => (before ?? 0) < at && after >= at)
  return crossed.length > 0 ? (crossed[crossed.length - 1] as number) : null
}

// The windows worth showing: the plan's two, in a fixed order.
export function shownStamina(limits: readonly Stamina[]): Stamina[] {
  const order = ['five_hour', 'seven_day', 'spend_limit']
  return [...limits]
    .filter(limit => typeof limit.percentUsed === 'number')
    .sort((a, b) => (order.indexOf(a.kind) + 1 || 9) - (order.indexOf(b.kind) + 1 || 9))
}
