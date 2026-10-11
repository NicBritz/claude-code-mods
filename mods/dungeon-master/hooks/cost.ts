// What a subagent's tokens would cost at Anthropic's API list prices, in US
// dollars per million tokens (cached 2026-10-06). An estimate: a Claude
// subscription bills differently, and a model not listed gets no price.

import type { ModelUsage } from 'claude-code'

import type { Usage } from '../types'

type Rate = { input: number; output: number; cacheRead: number }

// Most specific first: the first pattern the model id matches prices it.
const RATES: ReadonlyArray<readonly [RegExp, Rate]> = [
  [/fable-5-1|mythos-5-1/, { input: 10, output: 50, cacheRead: 0.25 }],
  [/fable-5|mythos-5/, { input: 10, output: 50, cacheRead: 1 }],
  [/opus-5-5/, { input: 4, output: 20, cacheRead: 0.2 }],
  [/opus-(5|4-[5-9])/, { input: 5, output: 25, cacheRead: 0.5 }],
  [/sonnet-5/, { input: 2, output: 10, cacheRead: 0.2 }],
  [/sonnet-4/, { input: 3, output: 15, cacheRead: 0.3 }],
  [/haiku-5-5/, { input: 0.1, output: 0.5, cacheRead: 0.01 }],
  [/haiku-4/, { input: 1, output: 5, cacheRead: 0.1 }],
]

// A five-minute cache write costs a quarter more than plain input.
const CACHE_WRITE = 1.25

export function rateOf(model: string): Rate | null {
  return RATES.find(([pattern]) => pattern.test(model))?.[1] ?? null
}

export function priced(usage: ModelUsage, model: string): Usage {
  const rate = rateOf(model)
  const cost =
    rate === null
      ? null
      : (usage.input_tokens * rate.input +
          usage.cache_creation_input_tokens * rate.input * CACHE_WRITE +
          usage.cache_read_input_tokens * rate.cacheRead +
          usage.output_tokens * rate.output) /
        1_000_000

  return {
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens,
    cacheWrite: usage.cache_creation_input_tokens,
    cost,
    model,
  }
}

export function added(a: Usage | null | undefined, b: Usage): Usage {
  if (a === null || a === undefined) return b
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cost: a.cost === null || b.cost === null ? (a.cost ?? b.cost) : a.cost + b.cost,
    model: b.model,
  }
}

export const tokensOf = (usage: Usage) => usage.input + usage.output + usage.cacheRead + usage.cacheWrite

export function tokens(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`

  return `${(n / 1_000_000).toFixed(1)}M`
}

export function dollars(cost: number | null): string {
  if (cost === null) return ''
  if (cost < 0.01) return '≈ <$0.01'

  return `≈ $${cost.toFixed(2)}`
}

export function spend(usage: Usage | null | undefined): string {
  if (usage === null || usage === undefined) return ''
  const price = dollars(usage.cost)

  return `${tokens(tokensOf(usage))} tokens${price ? ` ${price}` : ''}`
}
