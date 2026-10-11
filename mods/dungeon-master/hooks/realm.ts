// The realm map: every open session on this machine, as a kingdom. Each
// session writes its own file under ~/.claude/realm/sessions every few
// seconds; every session reads them all. Pure rules here; the reading and
// writing is in register.tsx.

import type { AppSession, Kingdom, Overlord, Pal } from '../types'

// Not heard from in this long: closed or crashed, and left off the map.
export const STALE_MS = 2 * 60_000
// Written again at least this often, so the others know it is still open.
export const HEARTBEAT_MS = 30_000
// More files than this are not read in one tick.
export const MAX_KINGDOMS = 20

// The app's link to a session, from its host id (CLAUDE_CODE_HOST_SESSION_ID).
export function sessionLink(hostId: string | undefined): string | undefined {
  return hostId !== undefined && /^[A-Za-z0-9_-]+$/.test(hostId) ? `claude://claude.ai/epitaxy/${hostId}` : undefined
}

// Only the app's own session links are ever opened, whatever a file says.
export const isSessionLink = (link: unknown): link is string =>
  typeof link === 'string' && /^claude:\/\/claude\.ai\/epitaxy\/[A-Za-z0-9_-]+$/.test(link)

export const kingdomFile = (dir: string, id: string) => `${dir}/sessions/${id.replace(/[^A-Za-z0-9_-]/g, '')}.json`

// Background helpers (claude-mem's observer sessions, say) run from hidden
// folders like ~/.claude-mem/...; they are not the person's work, so they stay
// off the map. Real projects live in ordinary folders.
export function isBackgroundFolder(cwd: string): boolean {
  return /\/\.claude-mem(\/|$)|\/\.claude\/plugins(\/|$)/.test(cwd)
}

// The mod's own folder: <config>/dungeon-master, where <config> is
// CLAUDE_CONFIG_DIR or ~/.claude. Never inside a project. Null when neither
// can be told.
export function dataDirFrom(home: string | undefined, configDir: string | undefined): string | null {
  const config = configDir !== undefined && configDir.startsWith('/') ? configDir.replace(/\/+$/, '') : home !== undefined && home.startsWith('/') ? `${home.replace(/\/+$/, '')}/.claude` : null
  return config === null ? null : `${config}/dungeon-master`
}

// The check-in files worth reading: written within the stale window, newest
// first. Old ones are never deleted (the engine cannot), only passed over.
export function freshFiles<T extends { name: string; mtimeMs: number }>(entries: readonly T[], now: number, skip: string): T[] {
  return entries
    .filter(entry => entry.name.endsWith('.json') && entry.name !== skip && now - entry.mtimeMs < STALE_MS)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_KINGDOMS)
}

export function folderName(cwd: string): string {
  return cwd.replace(/\/+$/, '').split('/').pop() || cwd
}

export function kingdomOf(id: string, name: string, lord: Overlord, live: readonly Pal[], now: number, camp = 0, link?: string): Kingdom {
  return {
    id,
    name,
    // No prompt text ever leaves the session: the map names sessions by the
    // app's own titles (or the person's names), never by what was typed.
    quest: '',
    opening: '',
    status: lord.status === 'waiting' || live.some(pal => pal.status === 'waiting') ? 'waiting' : lord.status,
    activity: lord.activity,
    context: lord.context ?? null,
    isCompacting: typeof lord.compactingSince === 'number',
    party: live.length,
    camp,
    ...(link === undefined ? {} : { link }),
    updatedAt: now,
  }
}

// Whether a kingdom changed enough to be worth writing before its heartbeat.
export function sameKingdom(a: Kingdom | null, b: Kingdom): boolean {
  if (a === null) return false
  return JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 })
}

function isKingdom(value: unknown): value is Kingdom {
  const k = value as Kingdom
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof k.id === 'string' &&
    typeof k.name === 'string' &&
    typeof k.updatedAt === 'number' &&
    (k.status === 'idle' || k.status === 'working' || k.status === 'waiting')
  )
}

// The files as read, turned into the map: valid, live, not ended, waiting
// ones first (they need you), then working, then resting; newest first within.
export function kingdomsFrom(texts: readonly string[], now: number): Kingdom[] {
  const order = { waiting: 0, working: 1, idle: 2 } as const
  return texts
    .map(text => {
      try {
        return JSON.parse(text) as unknown
      } catch {
        return null
      }
    })
    .filter(isKingdom)
    .filter(k => k.hasEnded !== true && now - k.updatedAt < STALE_MS)
    .sort((a, b) => order[a.status] - order[b.status] || b.updatedAt - a.updatedAt)
}

// What a session is called on the map: what it is about, else its folder.
// A prompt that is only pasted text names nothing: "<pasted_content …>".
const isNamingText = (text: string | undefined) => text !== undefined && text.trim() !== '' && !text.trim().startsWith('<')

export const kingdomTitle = (k: Kingdom) => [k.opening, k.quest].find(isNamingText) ?? k.name

// --- the desktop app's own list of sessions ----------------------------------

// The host id at the end of a session's app link, or null.
export function hostIdOf(link: string | undefined): string | null {
  return isSessionLink(link) ? (link.split('/').pop() ?? null) : null
}

// The app's session list, from whatever shape the list tool's answer takes:
// the array itself, or JSON text somewhere inside it (an MCP content block).
export function appSessionsFrom(value: unknown, keep: 'open' | 'archived' = 'open'): AppSession[] {
  const rows = findRows(value, 0)
  const out: AppSession[] = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const one = row as Record<string, unknown>
    if (typeof one.sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(one.sessionId)) continue
    if ((one.isArchived === true) !== (keep === 'archived')) continue
    const at = typeof one.lastActivityAt === 'string' ? Date.parse(one.lastActivityAt) : NaN
    out.push({
      id: one.sessionId,
      title: typeof one.title === 'string' && one.title.trim() !== '' ? one.title.trim().slice(0, 120) : 'Untitled session',
      lastActivityAt: Number.isFinite(at) ? at : 0,
      isPinned: one.pinned === true,
      isArchived: one.isArchived === true,
    })
  }

  return out
}

function findRows(value: unknown, depth: number): unknown[] {
  if (depth > 4) return []
  if (Array.isArray(value)) {
    if (value.some(row => row !== null && typeof row === 'object' && 'sessionId' in row)) return value
    return value.flatMap(item => findRows(item, depth + 1))
  }
  if (typeof value === 'string') {
    const start = value.indexOf('[')
    if (start === -1) return []
    try {
      return findRows(JSON.parse(value.slice(start)), depth + 1)
    } catch {
      return []
    }
  }
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(item => findRows(item, depth + 1))

  return []
}

// "2h ago", "3d ago": how long since a session last did anything.
export function agoWords(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  return `${Math.floor(hours / 24)}d ago`
}

export function kingdomWords(k: Kingdom): string {
  if (k.isCompacting) return 'Condensing memories'
  if (k.status === 'waiting') return 'Needs you'
  const party =
    (k.party > 0 ? ` · ${k.party} ${k.party === 1 ? 'hero' : 'heroes'} out` : '') + ((k.camp ?? 0) > 0 ? ` · ${k.camp} in camp` : '')
  if (k.status === 'working') return `${k.activity || 'thinking'}${party}`

  return `Idle${party}`
}

// One check-in per app session: a session that reloaded its mod (or ran an
// older one) can leave a second file under a new id. The newest wins.
export function uniqueKingdoms(list: readonly Kingdom[], hereId: string | null): Kingdom[] {
  const best = new Map<string, Kingdom>()
  for (const k of list) {
    const key = hostIdOf(k.link) ?? k.id
    if (key === hereId) continue
    const seen = best.get(key)
    if (seen === undefined || k.updatedAt > seen.updatedAt) best.set(key, k)
  }

  return [...best.values()]
}

const orderKey = (k: Kingdom) => `${kingdomTitle(k).toLowerCase()}\u0000${hostIdOf(k.link) ?? k.id}`

// The map's three bands: who needs the person, who is busy, who is idle.
export type MapGroups = { waiting: Kingdom[]; working: Kingdom[]; idle: Kingdom[] }

export function mapGroups(list: readonly Kingdom[]): MapGroups {
  // A fixed order (by name, then id): check-ins rewrite every few seconds,
  // so ordering by them made the rows jump about.
  const settled = (a: Kingdom, b: Kingdom) => orderKey(a).localeCompare(orderKey(b))
  return {
    waiting: list.filter(k => k.status === 'waiting').sort(settled),
    working: list.filter(k => k.status !== 'waiting' && (k.status === 'working' || k.isCompacting || k.party > 0)).sort(settled),
    idle: list.filter(k => k.status !== 'waiting' && k.status !== 'working' && !k.isCompacting && k.party === 0).sort(settled),
  }
}

// "2 need you · 1 working · 6 idle · 8 asleep", the parts that are not zero.
export function mapSummary(groups: MapGroups, asleep: number, pinned = 0, alsoIdle = 0): string {
  const idle = groups.idle.length + alsoIdle
  const parts = [
    pinned > 0 ? `${pinned} pinned` : '',
    groups.waiting.length > 0 ? `${groups.waiting.length} need${groups.waiting.length === 1 ? 's' : ''} you` : '',
    groups.working.length > 0 ? `${groups.working.length} working` : '',
    idle > 0 ? `${idle} idle` : '',
    asleep > 0 ? `${asleep} asleep` : '',
  ].filter(Boolean)

  return parts.length === 0 ? 'Only this session' : parts.join(' · ')
}

// --- the person's own names for sessions -------------------------------------

export const MAX_SESSION_NAME = 60

// names.json as written, read leniently: only app ids and short names.
export function readNames(text: string | null): Record<string, string> {
  if (text === null) return {}
  try {
    const value = JSON.parse(text) as unknown
    if (value === null || typeof value !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [id, name] of Object.entries(value as Record<string, unknown>)) {
      if (/^[A-Za-z0-9_-]+$/.test(id) && typeof name === 'string' && name.trim() !== '') out[id] = cleanSessionName(name)
    }
    return out
  } catch {
    return {}
  }
}

export function cleanSessionName(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_SESSION_NAME).trim()
}
