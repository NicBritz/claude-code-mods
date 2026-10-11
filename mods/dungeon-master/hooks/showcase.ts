// Showcase mode (/dm showcase): for a few minutes every page draws made-up
// content in place of the person's own, so screenshots for a README or a post
// show nothing private (no session names, prompts, files or commands).

import type { AppSession, Kingdom, Overlord, Pal, Quest } from '../types'

export const SHOWCASE_MS = 5 * 60_000

const MIN = 60_000

// The main thread's words, in place of the person's own prompt.
export function showcaseLord(lord: Overlord): Overlord {
  return {
    ...lord,
    quest: 'Raise the watchtower at Riverford',
    opening: 'Raise the watchtower at Riverford',
    activity: lord.status === 'idle' ? '' : 'Studying the old tower plans',
    lastWords: 'The watchtower stands. Three heroes are still out on the road.',
    ask: lord.ask === null ? null : 'Shall I light the beacon?',
  }
}

// Heroes who have finished, for the graveyard: one won, one fell, one was called back.
export function showcaseGraves(now: number): Pal[] {
  const grave = (id: string, hero: number, status: Pal['status'], description: string, lastWords: string, ago: number): Pal => ({
    id,
    description,
    type: 'general-purpose',
    hero,
    color: 0,
    parentId: null,
    status,
    activity: '',
    tools: 14,
    startedAt: now - ago - 6 * MIN,
    endedAt: now - ago,
    ask: null,
    canDecide: false,
    epitaph: '',
    lastWords,
    usage: null,
    xp: status === 'done' ? 10 : 2,
  })
  return [
    grave('demo-grave-1', 4, 'done', 'Demo: map the river crossing', 'Found three fords. The northern one is safest.', 4 * MIN),
    grave('demo-grave-2', 9, 'failed', 'Demo: pick the vault lock', 'The lock was cursed. I need a better pick.', 11 * MIN),
    grave('demo-grave-3', 5, 'stopped', 'Demo: write a ballad', 'Called back before the second verse.', 19 * MIN),
  ]
}

// Other sessions on the map.
export function showcaseKingdoms(now: number): Kingdom[] {
  const window = 200_000
  const kingdom = (id: string, name: string, quest: string, status: Kingdom['status'], used: number, party: number, ago: number): Kingdom => ({
    id,
    name,
    quest,
    opening: quest,
    status,
    activity: status === 'working' ? 'Forging the new gate' : '',
    context: { tokens: Math.round(window * used), window, model: 'demo' },
    isCompacting: false,
    party,
    camp: 0,
    updatedAt: now - ago,
  })
  return [
    kingdom('demo-k1', 'riverford', 'Rebuild the old mill', 'working', 0.42, 2, 5_000),
    kingdom('demo-k2', 'dragon-hoard', 'Count the hoard and find the missing crown', 'waiting', 0.66, 0, 40_000),
    kingdom('demo-k3', 'spellbook', 'Sort the spells by school', 'idle', 0.21, 0, 7 * MIN),
    kingdom('demo-k4', 'old-mine', 'Map the lower tunnels', 'idle', 0.08, 0, 50 * MIN),
  ]
}

// The app's sidebar list, open and archived.
export function showcaseSessions(now: number): { open: AppSession[]; archived: AppSession[] } {
  const one = (id: string, title: string, ago: number, isPinned = false, isArchived = false): AppSession => ({
    id,
    title,
    lastActivityAt: now - ago,
    isPinned,
    isArchived,
  })
  return {
    open: [
      one('demo-s1', 'Riverford watchtower', 0, true),
      one('demo-s2', 'Rebuild the old mill', 5_000),
      one('demo-s3', 'The missing crown', 40_000),
      one('demo-s4', 'Sort the spellbook', 7 * MIN),
      one('demo-s5', 'Map the lower tunnels', 50 * MIN),
      one('demo-s6', 'Tavern price list', 3 * 60 * MIN),
    ],
    archived: [one('demo-s7', 'Slay the cellar rats', 2 * 24 * 60 * MIN, false, true), one('demo-s8', 'Fix the drawbridge chain', 3 * 24 * 60 * MIN, false, true)],
  }
}

// The quest log: the last few turns, made up.
export function showcaseQuests(now: number): Quest[] {
  const quest = (turn: number, text: string, ago: number, durationMs: number, more: Partial<Quest>): Quest => ({
    turn,
    quest: text,
    startedAt: now - ago,
    durationMs,
    reads: [],
    edits: [],
    commands: [],
    searches: 0,
    ravens: 0,
    heroes: 0,
    asked: 0,
    failed: 0,
    contextGained: null,
    ...more,
  })
  return [
    quest(3, 'Raise the watchtower at Riverford', 2 * MIN, 4 * MIN, {
      reads: ['tower-plans.md', 'stone-yard.md'],
      edits: ['watchtower.md'],
      commands: ['count the stones'],
      heroes: 3,
      contextGained: 18_000,
    }),
    quest(2, 'Find out why the drawbridge sticks', 14 * MIN, 2 * MIN, { reads: ['drawbridge.md'], edits: ['chain.md'], searches: 2, contextGained: 9_000 }),
    quest(1, 'Draw up a map of the valley', 31 * MIN, 90_000, { reads: ['valley.md'], ravens: 1, contextGained: 6_000 }),
  ]
}
