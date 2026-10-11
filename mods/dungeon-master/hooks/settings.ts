// The realm's settings: every part can be switched off on its own. The record
// is ~/.claude/realm/settings.json, shared by every open session (each reads
// it every few seconds), with the mod's store as the fallback when that folder
// cannot be found. Read leniently: anything missing or unknown is the default.

import type { HeadingFont, Section, Settings } from '../types'

import { DEFAULT_THEME, asThemeName } from './themes'

export type { Section, Settings }

// The main thread's character, until the person names it.
export const DEFAULT_MAIN_NAME = 'The Overlord'
export const MAX_NAME = 32

// A name as typed, made safe to show: no control characters, one space
// between words, at most 32 characters; empty means the default.
export function cleanName(text: string): string {
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim()
  return clean === '' ? DEFAULT_MAIN_NAME : clean
}

export const DEFAULT_SETTINGS: Settings = {
  panelAtStart: true,
  hud: true,
  sound: true,
  rows: true,
  dice: true,
  volume: 60,
  headingFont: 'fantasy',
  mainName: DEFAULT_MAIN_NAME,
  mainLook: -1,
  theme: DEFAULT_THEME,
  hidden: [],
}

export type Switch = Exclude<keyof Settings, 'theme' | 'hidden' | 'headingFont' | 'mainName' | 'mainLook' | 'volume'>

export const HEADING_FONTS: ReadonlyArray<{ key: HeadingFont; label: string }> = [
  { key: 'fantasy', label: 'Fantasy' },
  { key: 'app', label: 'App font' },
]

// The switches as the Settings page groups and words them.
export const SWITCH_GROUPS: ReadonlyArray<{ title: string; switches: ReadonlyArray<{ key: Switch; label: string; hint: string }> }> = [
  {
    title: 'At the table',
    switches: [
      { key: 'hud', label: 'Strip above the message box', hint: 'Your character, how much context is left and your plan limits.' },
      { key: 'rows', label: 'Steps told as deeds', hint: 'Tool steps read as deeds: Studied, Forged, Cast, Scouted.' },
      { key: 'dice', label: 'Rolling d20', hint: 'A d20 tumbles beside the working line while Claude thinks.' },
      { key: 'sound', label: 'Sounds', hint: 'Soft chimes when a hero sets out, returns or needs you.' },
    ],
  },
  {
    title: 'The look',
    switches: [],
  },
  {
    title: 'The DM screen',
    switches: [{ key: 'panelAtStart', label: 'Open at session start', hint: 'The DM screen opens with every new session. Otherwise use /dm or the strip.' }],
  },
]

export const SECTIONS: ReadonlyArray<{ key: Section; label: string }> = [
  { key: 'party', label: 'The party' },
  { key: 'camp', label: 'The camp (background work)' },
  { key: 'quests', label: 'Quest log' },
  { key: 'graveyard', label: 'Graveyard' },
  { key: 'stamina', label: 'Stamina (plan limits)' },
]

const SWITCH_KEYS = SWITCH_GROUPS.flatMap(group => group.switches.map(one => one.key))
const SECTION_KEYS = new Set<string>(SECTIONS.map(one => one.key))

export function readSettings(value: unknown): Settings {
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      raw = null
    }
  }
  if (raw === null || typeof raw !== 'object') return DEFAULT_SETTINGS
  const given = raw as Record<string, unknown>
  const settings: Settings = { ...DEFAULT_SETTINGS }
  for (const key of SWITCH_KEYS) if (typeof given[key] === 'boolean') settings[key] = given[key]
  const theme = asThemeName(given.theme)
  if (theme !== null) settings.theme = theme
  if (typeof given.volume === 'number' && Number.isFinite(given.volume)) settings.volume = Math.max(0, Math.min(100, Math.round(given.volume / 10) * 10))
  if (typeof given.mainName === 'string') settings.mainName = cleanName(given.mainName)
  if (typeof given.mainLook === 'number' && Number.isInteger(given.mainLook) && given.mainLook >= -1 && given.mainLook < 64) settings.mainLook = given.mainLook
  if (HEADING_FONTS.some(one => one.key === given.headingFont)) settings.headingFont = given.headingFont as HeadingFont
  if (Array.isArray(given.hidden)) settings.hidden = given.hidden.filter((one): one is Section => typeof one === 'string' && SECTION_KEYS.has(one))

  return settings
}

export const sameSettings = (a: Settings, b: Settings) => JSON.stringify(a) === JSON.stringify(b)

// "/dm …": what the person asked for.
export type RealmAsk =
  | { kind: 'open' }
  | { kind: 'settings' }
  | { kind: 'demo' }
  | { kind: 'status' }
  | { kind: 'theme'; theme: string }
  | { kind: 'font'; font: string }
  | { kind: 'name'; name: string }
  | { kind: 'volume'; volume: number | null }
  | { kind: 'switch'; key: Switch; on: boolean }
  | { kind: 'unknown' }

const SWITCH_WORDS: Record<string, Switch> = {
  hud: 'hud',
  strip: 'hud',
  rows: 'rows',
  sound: 'sound',
  sounds: 'sound',
  dice: 'dice',
  d20: 'dice',
  panel: 'panelAtStart',
}

const ON = ['on', 'yes', 'enable', 'true']
const OFF = ['off', 'no', 'disable', 'false']

export function readRealmAsk(args: string): RealmAsk {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { kind: 'open' }
  if (words[0] === 'settings' && words.length === 1) return { kind: 'settings' }
  if (words[0] === 'demo' && words.length === 1) return { kind: 'demo' }
  if (words[0] === 'status' && words.length === 1) return { kind: 'status' }
  if (words[0] === 'theme') return { kind: 'theme', theme: words[1] ?? '' }
  if (words[0] === 'font') return { kind: 'font', font: words[1] ?? '' }
  if (words[0] === 'volume') {
    const n = Number.parseInt(words[1] ?? '', 10)
    return { kind: 'volume', volume: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null }
  }
  // The name keeps the person's own capitals.
  if (words[0] === 'name') return { kind: 'name', name: args.trim().replace(/^name\s*/i, '') }
  const key = Object.hasOwn(SWITCH_WORDS, words[0]!) ? SWITCH_WORDS[words[0]!] : undefined
  const state = words[1] ?? ''
  if (key !== undefined && (ON.includes(state) || OFF.includes(state))) return { kind: 'switch', key, on: ON.includes(state) }

  return { kind: 'unknown' }
}

export function switchLabel(key: Switch): string {
  for (const group of SWITCH_GROUPS) for (const one of group.switches) if (one.key === key) return one.label

  return key
}

// One line: what is on and what is off.
export function settingsWords(settings: Settings): string {
  const all = SWITCH_GROUPS.flatMap(group => group.switches)
  const on = all.filter(one => settings[one.key]).map(one => one.label)
  const off = all.filter(one => !settings[one.key]).map(one => one.label)

  return [
    on.length > 0 ? `On: ${on.join(', ')}` : '',
    off.length > 0 ? `Off: ${off.join(', ')}` : '',
    `Theme: ${settings.theme}`,
    `Headings: ${settings.headingFont}`,
  ]
    .filter(Boolean)
    .join('. ')
}
