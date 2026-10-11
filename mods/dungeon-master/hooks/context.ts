// The context bar: how much of its context window each agent has left, drawn
// as a pixel health bar that drains as the conversation grows. Compacting
// turns it violet with a shimmer, and the bar refills to what is left after.

import type { ModelUsage } from 'claude-code'

import type { Context } from '../types'
import { tokens } from './cost'

// A subagent on a model other than the main thread's: the usual window.
export const DEFAULT_WINDOW = 200_000

// What a request was answered over: uncached, cache-written and cache-read.
export const contextTokens = (usage: ModelUsage) =>
  usage.input_tokens + usage.cache_read_input_tokens + (usage.cache_creation_input_tokens ?? 0)

// The window a model works in: a 1M model says so in its id; the main thread's
// own window (which the engine reports) holds for any agent on the same model.
export function windowFor(model: string, main: Context | null | undefined): number {
  if (/\[1m\]|-1m\b/i.test(model)) return 1_000_000
  if (main && main.model === model) return main.window

  return DEFAULT_WINDOW
}

// The share of the window still free, 0 to 1; null before the first response.
export function leftOf(context: Context | null | undefined): number | null {
  if (!context || context.tokens === null || context.window <= 0) return null

  return Math.min(1, Math.max(0, 1 - context.tokens / context.window))
}

export function contextWords(context: Context | null | undefined, isCompacting: boolean): string {
  if (isCompacting) return 'Context: condensing'
  const left = leftOf(context)
  if (left === null || !context || context.tokens === null) return 'Context: fresh'

  return `Context ${Math.round(left * 100)}% left · ${tokens(context.tokens)} of ${tokens(context.window)}`
}

// Healthy, wary, low: green, amber, crimson, by how much is left.
const FILLS = { high: '#22C55E', mid: '#F59E0B', low: '#DC2626', condensing: '#8B5CF6' } as const

export function fillOf(left: number | null, isCompacting: boolean): string {
  if (isCompacting) return FILLS.condensing
  if (left === null || left > 0.5) return FILLS.high

  return left > 0.25 ? FILLS.mid : FILLS.low
}

// The art is 60 by 5 pixels; drawn at 2x on cards, 1x for followers.
export const BAR_SIZE = { width: 120, height: 10 } as const
export const MINI_BAR_SIZE = { width: 60, height: 5 } as const
const W = 60
const H = 5

type Size = { readonly width: number; readonly height: number }

export function contextBarSvg(context: Context | null | undefined, frame: number, isCompacting: boolean, size: Size = BAR_SIZE): string {
  const left = leftOf(context)
  const inner = W - 2
  const filled = Math.round(inner * (left ?? 1))
  const fill = fillOf(left, isCompacting)
  // Nearly empty: the bar pulses, as a hero's does on its last hit points.
  const opacity = !isCompacting && left !== null && left < 0.15 && frame % 4 < 2 ? 0.6 : 1
  let ticks = ''
  for (let step = 1; step < 10; step += 1) {
    const x = 1 + Math.round((inner * step) / 10)
    ticks += `<rect x="${x}" y="1" width="0.5" height="${H - 2}" fill="#000" opacity="0.25"/>`
  }
  const shimmer = isCompacting && filled > 0 ? `<rect x="${1 + ((frame * 4) % Math.max(filled, 1))}" y="1" width="3" height="${H - 2}" fill="#EDE9FE" opacity="0.7"/>` : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${size.width}" height="${size.height}" shape-rendering="crispEdges">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#1F2937"/>` +
    `<rect x="1" y="1" width="${inner}" height="${H - 2}" fill="#4B5563"/>` +
    (filled > 0
      ? `<rect x="1" y="1" width="${filled}" height="${H - 2}" fill="${fill}" opacity="${opacity}"/>` +
        `<rect x="1" y="1" width="${filled}" height="1" fill="#FFFFFF" opacity="0.35"/>`
      : '') +
    shimmer +
    ticks +
    `</svg>`
  )
}

// The terminal's bar: ten blocks, full ones for what is left.
export function contextBarText(context: Context | null | undefined, isCompacting: boolean): string {
  const left = leftOf(context) ?? 1
  const full = Math.round(left * 10)

  return `${isCompacting ? 'Condensing' : 'Context'} ${'▰'.repeat(full)}${'▱'.repeat(10 - full)}`
}
