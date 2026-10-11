// The quest log: a short receipt of each main-thread turn, what was read,
// changed and run, what was asked, and what it cost in context.

import type { Quest } from '../types'

import type { ItemName } from './items'
import { tokens } from './cost'

export const KEPT_QUESTS = 20
export const SHOWN_QUESTS = 5

export function newQuest(turn: number, quest: string, startedAt: number): Quest {
  return { turn, quest, startedAt, durationMs: 0, reads: [], edits: [], commands: [], searches: 0, ravens: 0, heroes: 0, asked: 0, failed: 0, contextGained: null }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const baseName = (path: string) => path.split('/').pop() ?? path
const addOnce = (list: readonly string[], item: string) => (item === '' || list.includes(item) ? [...list] : [...list, item])

// One tool call of the turn, counted by what it does.
export function withCall(quest: Quest, tool: string, input: unknown, isErrored: boolean): Quest {
  const args = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const next = { ...quest, failed: quest.failed + (isErrored ? 1 : 0) }
  switch (tool) {
    case 'Read':
    case 'NotebookRead':
      return { ...next, reads: addOnce(next.reads, baseName(text(args.file_path) || text(args.notebook_path))) }
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return { ...next, edits: addOnce(next.edits, baseName(text(args.file_path) || text(args.notebook_path))) }
    case 'Bash': {
      const said = text(args.description) || (text(args.command).split('\n')[0] ?? '')
      return { ...next, commands: [...next.commands, said.length > 60 ? `${said.slice(0, 59)}…` : said] }
    }
    case 'Grep':
    case 'Glob':
    case 'LS':
      return { ...next, searches: next.searches + 1 }
    case 'WebFetch':
    case 'WebSearch':
      return { ...next, ravens: next.ravens + 1 }
    case 'Agent':
    case 'Task':
      return { ...next, heroes: next.heroes + 1 }
    default:
      return next
  }
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// The tally line: only what happened, in the realm's words.
// The turn's tally, each part with the pixel item the tool rows use for it.
export type TallyPart = { item: ItemName; text: string }

export function questParts(quest: Quest): TallyPart[] {
  const parts: Array<TallyPart | null> = [
    quest.reads.length > 0 ? { item: 'chest', text: count(quest.reads.length, 'read', 'read') } : null,
    quest.edits.length > 0 ? { item: 'hammer', text: count(quest.edits.length, 'forged', 'forged') } : null,
    quest.commands.length > 0 ? { item: 'staff', text: count(quest.commands.length, 'cast', 'cast') } : null,
    quest.searches > 0 ? { item: 'bow', text: count(quest.searches, 'scout', 'scouts') } : null,
    quest.ravens > 0 ? { item: 'arrow', text: count(quest.ravens, 'raven', 'ravens') } : null,
    quest.heroes > 0 ? { item: 'sword', text: count(quest.heroes, 'hero', 'heroes') } : null,
    quest.asked > 0 ? { item: 'heart', text: count(quest.asked, 'ask', 'asks') } : null,
    quest.failed > 0 ? { item: 'skull', text: count(quest.failed, 'failed', 'failed') } : null,
  ]
  return parts.filter((one): one is TallyPart => one !== null)
}

export function questTally(quest: Quest): string {
  const parts = questParts(quest).map(one => one.text)

  return parts.length > 0 ? parts.join(' · ') : 'Words only, no tools'
}

export function questGain(quest: Quest): string {
  if (quest.contextGained === null) return ''
  if (quest.contextGained < 0) return 'context condensed'

  return `+${tokens(quest.contextGained)} context`
}

// "a.ts, b.ts and 3 more".
export function listed(items: readonly string[], shown = 3): string {
  if (items.length <= shown) return items.join(', ')
  return `${items.slice(0, shown).join(', ')} and ${items.length - shown} more`
}
