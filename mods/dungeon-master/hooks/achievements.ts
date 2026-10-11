// Achievements: badges the party earns once and keeps, shown in the Hall of
// Heroes. Each is unlocked by the moment that earns it (register.tsx calls
// unlock); here are the list and the rules that are pure.

import type { GlyphName } from './art'

export type AchievementId =
  | 'first-blood'
  | 'full-party'
  | 'marathon'
  | 'natural-20'
  | 'clean-sweep'
  | 'veteran'
  | 'legend'
  | 'whole-guild'
  | 'fallen'
  | 'night-owl'

export type Achievement = { id: AchievementId; name: string; how: string; glyph: GlyphName }

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-blood', name: 'First Blood', how: 'A hero wins their first quest.', glyph: 'sword' },
  { id: 'full-party', name: 'Full Party', how: 'Five heroes out on quests at once.', glyph: 'party' },
  { id: 'natural-20', name: 'Natural 20', how: 'Roll a critical success: a long quest won.', glyph: 'd20' },
  { id: 'veteran', name: 'Veteran', how: 'A hero reaches level 3.', glyph: 'fame' },
  { id: 'legend', name: 'Legend', how: 'A hero reaches level 5.', glyph: 'dragon' },
  { id: 'whole-guild', name: 'The Whole Guild', how: 'Every hero has been on a quest.', glyph: 'kingdom' },
  { id: 'marathon', name: 'Marathon', how: 'A quest that runs for over an hour.', glyph: 'stamina' },
  { id: 'night-owl', name: 'Night Owl', how: 'Win a quest between midnight and 4 in the morning.', glyph: 'scroll' },
  { id: 'clean-sweep', name: 'Clean Sweep', how: 'Archive 20 sessions from the Realm Map.', glyph: 'chest' },
  { id: 'fallen', name: 'Lessons Learned', how: 'A hero falls in battle. It happens to the best.', glyph: 'graveyard' },
]

export const isAchievementId = (value: string): value is AchievementId => ACHIEVEMENTS.some(one => one.id === value)

// What was earned and when (epoch ms), read leniently from the store.
export function readEarned(value: unknown): Record<string, number> {
  if (value === null || typeof value !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [id, at] of Object.entries(value as Record<string, unknown>)) {
    if (isAchievementId(id) && typeof at === 'number' && Number.isFinite(at)) out[id] = at
  }
  return out
}

// Thresholds the moments are measured against.
export const ARCHIVES_FOR_SWEEP = 20
export const MARATHON_MS = 60 * 60_000
export const FULL_PARTY = 5
// A quest long enough that winning it is a critical success.
export const CRITICAL_STEPS = 20
export const CRITICAL_TURN_MS = 5 * 60_000

export const isNightOwlHour = (epochMs: number) => {
  const hour = new Date(epochMs).getHours()
  return hour >= 0 && hour < 4
}
