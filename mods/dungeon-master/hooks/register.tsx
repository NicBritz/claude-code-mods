// The Dungeon Master mod: Claude Code as a D&D table. Three parts, each of
// which can be switched off in the DM's Tome (settings):
//   - the DM screen (a side panel): a pixel hero per helper Claude sends out,
//     the camp of background work, the quest log, the graveyard, the Hall of
//     Heroes with achievements, the Realm Map of sessions, and the Tome;
//   - the strip above the message box: the person's character (the main
//     thread), its context bar, the plan's limits and critical rolls;
//   - the rows around the chat: tool steps told as deeds, the working line
//     with a rolling d20, and the hints.
// It adds nothing to Claude's prompt and costs no tokens.
// Everything that talks to the engine lives in this one file (the engine
// follows $ only within it); the pure rules, art and words are beside it.
//
// Text keeps the theme's own colours (no coloured words, so contrast holds in
// light and dark); colour lives in borders and in the pixel art.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register, RenderElement, RenderInput, SessionCompactResult } from 'claude-code'

import type { AppSession, CampTask, Context, Fame, Kingdom, OpenedRows, Overlord, Pal, PalStatus, Quest, Section, Settings, Stamina, View } from '../types'
import { describeCall, elapsed, firstLine, softBreak } from './activity'
import { BAR_SIZE, MINI_BAR_SIZE, contextBarSvg, contextBarText, contextTokens, contextWords, leftOf, windowFor } from './context'
import { added, dollars, priced, spend, tokens, tokensOf } from './cost'
import { EMPTY_FAME, levelOf, readFame, withQuest, withSpend, xpBarSvg, xpFor, xpForLevel } from './fame'
import { GRAVE_SIZE, graveSvg } from './graves'
import { MAX_PEEK_BYTES, applyChange, campFromCall, campIcon, campState, cwdSlug, isRunningWork, lastLine, parseNotification, pruneCamp, reconcile } from './camp'
import { ICON_SIZE, iconSvg } from './icons'
import { KEPT_QUESTS, SHOWN_QUESTS, listed, newQuest, questGain, questParts, questTally, withCall } from './quests'
import { asContext, crossing, shownStamina, staminaLabel, staminaWords } from './stamina'
import { HEARTBEAT_MS, agoWords, dataDirFrom, freshFiles, appSessionsFrom, folderName, hostIdOf, mapGroups, mapSummary, readNames, cleanSessionName, uniqueKingdoms, isBackgroundFolder, isSessionLink, kingdomTitle, sessionLink, kingdomFile, kingdomOf, kingdomWords, kingdomsFrom, sameKingdom } from './realm'
import { DEFAULT_MAIN_NAME, DEFAULT_SETTINGS, cleanName, HEADING_FONTS, SECTIONS, SWITCH_GROUPS, type Switch, readRealmAsk, readSettings, sameSettings, settingsWords, switchLabel } from './settings'
import { THEME_BLURBS, THEME_NAMES, type ThemeName, isThemeName, paletteOf } from './themes'
import { type GlyphName, LOOP_FRAMES, animatedSvg, diePicture, headingPicture, iconPicture } from './art'
import { CREDITS, OWN_WORK } from './credits'
import {
  ACHIEVEMENTS,
  ARCHIVES_FOR_SWEEP,
  type AchievementId,
  CRITICAL_STEPS,
  CRITICAL_TURN_MS,
  FULL_PARTY,
  MARATHON_MS,
  isNightOwlHour,
  readEarned,
} from './achievements'
import { SHOWCASE_MS, showcaseGraves, showcaseKingdoms, showcaseLord, showcaseQuests, showcaseSessions } from './showcase'
import { LOOKS, SCORE_NAMES, croppedFigure, figureTop, lookName, modifier, portraitSvg, scoreBarSvg, sheetOf, stepLook } from './characters'
import { detailsMarkdown, hintWords, spinnerWords, toolWords } from './words'
import {
  FRAME_MS,
  HERO_SIZE,
  HEROES,
  MINI_SIZE,
  OVERLORD_VOICE,
  assignHero,
  epitaph,
  heroOf,
  heroSvg,
  overlordSvg,
} from './heroes'
import {
  BORDERS,
  ENDING,
  OUTCOME,
  RECENT_MS,
  borderOf,
  isActive,
  isCurrent,
  leaderOf,
  plural,
  summary,
  trimmed,
  withColours,
} from './rules'

// The values the panel draws from, held by the host for the session (a
// reload keeps them). The settings and the hall of fame are mirrored to
// $.store (and the settings to ~/.claude/realm/settings.json) so they
// outlive the session.
const pals = atom({ plugin: 'dungeon-master', key: 'pals' } as const, [] as Pal[])
const tick = atom({ plugin: 'dungeon-master', key: 'tick' } as const, 0)
// The animation frame: only the drawings that move read it (the strip, the
// party page, the rolling die), so a redraw for the walk never reaches the
// settings, fame or map pages and swallows a click there.
const frameTick = atom({ plugin: 'dungeon-master', key: 'frameTick' } as const, 0)
// Whether the panel is open, for the strip's Open / Close toggle.
const isPaneOpen = atom({ plugin: 'dungeon-master', key: 'isPaneOpen' } as const, false)
// The look the character select screen shows while the person browses with
// the arrows; null shows the character they have chosen.
const browseLook = atom({ plugin: 'dungeon-master', key: 'browseLook' } as const, null as number | null)
// Achievements earned (id to when), kept in the store across sessions.
const earned = atom({ plugin: 'dungeon-master', key: 'earned' } as const, {} as Record<string, number>)
const STORE_EARNED = 'achievements'
const STORE_TALLY = 'tally'
// A critical roll on show on the strip: the face, who rolled it, until when.
const critical = atom({ plugin: 'dungeon-master', key: 'critical' } as const, null as { face: number; who: string; until: number } | null)
const CRITICAL_SHOW_MS = 6000
// Heroes who just reached a new level (slot to until when), to glow a while.
const levelUps = atom({ plugin: 'dungeon-master', key: 'levelUps' } as const, {} as Record<string, number>)
const LEVEL_GLOW_MS = 10 * 60_000
// The person's own names for sessions (app id to name), shared by every
// session through ~/.claude/realm/names.json, and the one being renamed.
const sessionNames = atom({ plugin: 'dungeon-master', key: 'sessionNames' } as const, {} as Record<string, string>)
const renaming = atom({ plugin: 'dungeon-master', key: 'renaming' } as const, null as string | null)
// A sweeping action waiting for its second press (Archive all, Reset): which.
const confirming = atom({ plugin: 'dungeon-master', key: 'confirming' } as const, null as string | null)
const CONFIRM_MS = 6000
// Whether the app is in light mode, as far as the mod can tell, every 30 s:
// the desktop app's own appearance setting (userThemeMode in its config.json,
// the only value read from it), else, when that follows the system, the
// Mac's appearance. Elsewhere it cannot tell, and stays dark.
const isLightApp = atom({ plugin: 'dungeon-master', key: 'isLightApp' } as const, false)
const APPEARANCE_MS = 30_000

async function checkAppearance($: Engine): Promise<void> {
  let isLight: boolean | null = null
  if (homeDir !== null) {
    const text = await $.fs.read(`${homeDir}/Library/Application Support/Claude/config.json`).then(String).catch(() => null)
    const mode = text === null ? undefined : appModeOf(text)
    if (mode === 'light' || mode === 'dark') isLight = mode === 'light'
  }
  if (isLight === null) {
    const ran = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle']).catch(() => null)
    if (ran === null) return
    // "Dark" in dark mode; the key is missing (an error) in light mode.
    isLight = !(ran.exitCode === 0 && /dark/i.test(String(ran.stdout)))
  }
  if ((await read($, isLightApp)) !== isLight) await update($, isLightApp, () => isLight)
}

// The palette for drawing now: the theme, light or dark as the app is.
async function lookNow($: Engine, theme: ThemeName) {
  return paletteOf(theme, await read($, isLightApp))
}
// A session used this recently is never called asleep, so never swept up.
const QUIET_FOR_ASLEEP_MS = 15 * 60_000
const hasAutoOpened = atom({ plugin: 'dungeon-master', key: 'hasAutoOpened' } as const, false)
const openGrave = atom({ plugin: 'dungeon-master', key: 'openGrave' } as const, null as string | null)
const view = atom({ plugin: 'dungeon-master', key: 'view' } as const, 'party' as View)
const fame = atom({ plugin: 'dungeon-master', key: 'fame' } as const, {} as Record<string, Fame>)
const IDLE_OVERLORD: Overlord = { status: 'idle', activity: '', tools: 0, turns: 0, startedAt: 0, ask: null, lastWords: '', usage: null }
const overlord = atom({ plugin: 'dungeon-master', key: 'overlord' } as const, IDLE_OVERLORD)
// Every switch, the theme and the hidden panel sections.
const settings = atom({ plugin: 'dungeon-master', key: 'prefs' } as const, DEFAULT_SETTINGS as Settings)
// The tool rows the person has opened to see the call and its result.
const opened = atom({ plugin: 'dungeon-master', key: 'opened' } as const, [] as OpenedRows)
// The plan's usage windows (5-hour, weekly), as stamina bars.
const stamina = atom({ plugin: 'dungeon-master', key: 'stamina' } as const, [] as Stamina[])
// The main thread's finished turns, newest last, as the quest log shows them.
const quests = atom({ plugin: 'dungeon-master', key: 'quests' } as const, [] as Quest[])
// Background work: shell commands, monitors, workflows, wake-ups and crons.
const camp = atom({ plugin: 'dungeon-master', key: 'camp' } as const, [] as CampTask[])
// The desktop app's own list of open sessions (titles, last activity).
const appSessions = atom({ plugin: 'dungeon-master', key: 'appSessions' } as const, [] as AppSession[])
// The map's folded sections, kept in the store across sessions. Asleep and
// Archived start folded: they are long and rarely needed.
const DEFAULT_FOLDED = ['asleep', 'archived', 'tome-credits']
const mapFolded = atom({ plugin: 'dungeon-master', key: 'mapFolded' } as const, DEFAULT_FOLDED as string[])
const STORE_FOLDED = 'mapFolded'
// How many rows each long section shows; more on request. A section with
// hundreds of rows made the panel too big to redraw.
const PAGE_ROWS = 20
const mapShown = atom({ plugin: 'dungeon-master', key: 'mapShown' } as const, {} as Record<string, number>)
// The heroes in the hall of fame whose record is opened out.
const fameOpen = atom({ plugin: 'dungeon-master', key: 'fameOpen' } as const, [] as number[])
// Whether the map's ⓘ note on allowing Archive is open.
const showArchiveHelp = atom({ plugin: 'dungeon-master', key: 'showArchiveHelp' } as const, false)
// The sessions already archived, for the map's Archived list (folded by default).
const archivedSessions = atom({ plugin: 'dungeon-master', key: 'archivedSessions' } as const, [] as AppSession[])
// Sessions the app refused to archive (open in a window, or in use): they
// join the pinned ones in the map's Pinned band, with no Archive button.
const keptByApp = atom({ plugin: 'dungeon-master', key: 'keptByApp' } as const, [] as string[])
const UNARCHIVE_SESSION = 'mcp__ccd_session_mgmt__unarchive_session'
// The desktop app's session tools, which the map calls on the person's behalf.
const LIST_SESSIONS = 'mcp__ccd_session_mgmt__list_sessions'
const ARCHIVE_SESSION = 'mcp__ccd_session_mgmt__archive_session'
const APP_LIST_MS = 30_000
let lastListReport = 'not asked yet'
// The one setting Archive needs in auto mode, shown in the map's ⓘ note.
const ARCHIVE_RULE_MARKDOWN =
  '```json\n"permissions": {\n  "allow": [\n    "mcp__ccd_session_mgmt__archive_session",\n    "mcp__ccd_session_mgmt__unarchive_session",\n    "mcp__ccd_session_mgmt__list_sessions",\n    "TaskStop"\n  ]\n}\n```'
// Every other open session on this machine, as the map shows them.
const realm = atom({ plugin: 'dungeon-master', key: 'realm' } as const, [] as Kingdom[])
// Showcase mode: until this time every page draws made-up content (showcase.ts).
const showcaseUntil = atom({ plugin: 'dungeon-master', key: 'showcaseUntil' } as const, 0)

const STORE_FAME = 'fame'
const STORE_SETTINGS = 'settings'

// The panel's id, written here so the engine reads it off the matcher.
const PANE = 'dungeon-master'
const TITLE = 'Dungeon Master'
// The Overlord in the HUD: the art at 1x, so it fits the band.
const HUD_LORD_SIZE = { width: 62, height: 74 } as const
// A party hero standing in for the Overlord: the same height, its own shape.
const HUD_HERO_SIZE = { width: 40, height: 75 } as const
// The party page's heroes: a quarter bigger than the sprite's 2x, followers 1.5x.
const PARTY_HERO_SIZE = { width: 40, height: 75 } as const
const FOLLOWER_SIZE = { width: 24, height: 45 } as const
// Each kingdom's overlord on the realm map, a little smaller.
const REALM_LORD_SIZE = { width: 24, height: 29 } as const
// The d20 beside the working line.
const DIE_SIZE = 22
// One breakpoint for the whole DM screen, in the panel's own columns: wider,
// every row keeps its words and buttons side by side; narrower, every row
// puts its buttons under its words, all at once, so the screen stays tidy.
const NARROW_COLUMNS = 64
// The strip's own: narrower, its button moves under the words.
const NARROW_STRIP_COLUMNS = 90
// The panel's width as last drawn, for /dm status (to tune the breakpoint).
let lastPaneColumns = 0

type Engine = EngineInterface
type Change = { before: Pal; after: Pal }
type Sound = 'set-out' | 'done' | 'needs-you' | 'error' | 'stopped' | 'level-up' | 'critical'
type Size = { readonly width: number; readonly height: number }

// --- sound -----------------------------------------------------------------

// Calm sound effects: soft bell tones the mod ships in sounds/. One mute
// switch silences them all; a burst of events plays one tone, not a chord.
// "Needs you" always sounds; the rest wait this long after any tone.
const QUIET_MS = 1500

let lastAt = Number.NEGATIVE_INFINITY

// The Volume row's Test button: the quest-won sound at the chosen volume,
// whatever the quiet window says.
async function playTest($: EngineInterface): Promise<void> {
  lastAt = Number.NEGATIVE_INFINITY
  await chime($, 'done')
}

async function chime($: EngineInterface, sound: Sound): Promise<void> {
  if (!(await read($, settings)).sound) return
  const now = await $.clock.now()
  if (sound !== 'needs-you' && now - lastAt < QUIET_MS) return
  lastAt = now
  const volume = (await read($, settings)).volume
  if (volume <= 0) return
  $.audio.play({ asset: `sounds/${sound}.wav` }, { gain: volume / 100 }).catch(() => undefined)
}

// --- loading -------------------------------------------------------------

// On every load: drop pals in an old shape, colour live ones, bring the hall
// of fame back from the store, and read the settings.
async function restore($: Engine): Promise<void> {
  await update($, pals, list => withColours(list.every(isCurrent) ? list : list.filter(isCurrent)))
  const stored = await $.store.get(STORE_FAME).catch(() => undefined)
  await update($, fame, () => readFame(stored))
  await loadSettings($)
  const storedEarned = await $.store.get(STORE_EARNED).catch(() => undefined)
  await update($, earned, () => readEarned(storedEarned))
  const folded = await $.store.get(STORE_FOLDED).catch(() => undefined)
  if (Array.isArray(folded)) await update($, mapFolded, () => folded.filter((one): one is string => typeof one === 'string'))
}

async function toggleFold($: Engine, key: string): Promise<void> {
  const next = await update($, mapFolded, list => (list.includes(key) ? list.filter(one => one !== key) : [...list, key]))
  await $.store.set(STORE_FOLDED, next).catch(() => undefined)
  // Opening a long list asks the app for the whole of it, in the background,
  // so the section opens at once.
  if (!next.includes(key) && (key === 'asleep' || key === 'archived')) {
    $.clock.after(0, () => {
      refreshAppSessions($, true).catch(() => undefined)
    })
  }
}

// Before 3.0 the mod kept its files in <config>/realm: carry the settings and
// session names across once, if this folder has none yet.
async function adoptEarlierFolder($: Engine): Promise<void> {
  if (dataDir === null) return
  const earlier = dataDir.replace(/\/dungeon-master$/, '/realm')
  for (const name of ['settings.json', 'names.json']) {
    if (await $.fs.exists(`${dataDir}/${name}`).catch(() => true)) continue
    const text = await $.fs.read(`${earlier}/${name}`).then(String).catch(() => null)
    if (text !== null) await $.fs.write(`${dataDir}/${name}`, text).catch(() => undefined)
  }
}

// --- settings ------------------------------------------------------------------

// The record is ~/.claude/realm/settings.json, so a change in one session
// reaches every open one; the store is the fallback.
async function loadSettings($: Engine): Promise<void> {
  const dir = dataDir
  const text = dir === null ? null : await $.fs.read(`${dir}/settings.json`).then(String).catch(() => null)
  const next = text !== null ? readSettings(text) : readSettings(await $.store.get(STORE_SETTINGS).catch(() => undefined))
  await applySettings($, next)
}

async function writeSettings($: Engine, next: Settings): Promise<void> {
  const dir = dataDir
  if (dir !== null) await $.fs.write(`${dir}/settings.json`, JSON.stringify(next, null, 2)).catch(() => undefined)
  await $.store.set(STORE_SETTINGS, next).catch(() => undefined)
}

// Takes new settings in: the drawings that read them redraw by themselves;
// the visual-answers text in the system prompt is redrawn by hand.
async function applySettings($: Engine, next: Settings): Promise<void> {
  const before = await read($, settings)
  if (!sameSettings(before, next)) await update($, settings, () => next)
}

async function changeSettings($: Engine, fn: (current: Settings) => Settings): Promise<Settings> {
  const next = fn(await read($, settings))
  await applySettings($, next)
  await writeSettings($, next)

  return next
}

// --- the party -----------------------------------------------------------

async function change($: Engine, id: string, fn: (pal: Pal) => Pal | null): Promise<Change | null> {
  let seen: Change | null = null
  await update($, pals, list => {
    seen = null
    return list.map(pal => {
      if (pal.id !== id) return pal
      const after = fn(pal)
      if (after === null) return pal
      seen = { before: pal, after }
      return after
    })
  })

  return seen
}

async function addPal($: Engine, id: string, description: string, type: string, parentId?: string): Promise<void> {
  const now = await $.clock.now()
  let isAdded = false
  await update($, pals, list => {
    isAdded = false
    if (list.some(pal => pal.id === id)) return list
    isAdded = true
    const live = list.filter(isActive)
    const colours = live.map(pal => pal.color)
    const color = BORDERS.findIndex((_, index) => !colours.includes(index))
    const pal: Pal = {
      id,
      description: description || 'A quest',
      type,
      hero: assignHero(id, type, live.map(one => one.hero)),
      color: color === -1 ? live.length % BORDERS.length : color,
      parentId: parentId ?? null,
      status: 'working',
      activity: 'setting off',
      tools: 0,
      startedAt: now,
      endedAt: null,
      ask: null,
      epitaph: '',
      lastWords: '',
      usage: null,
    }
    return trimmed([...list, pal])
  })
  if (isAdded) await chime($, 'set-out')
  if (isAdded && !id.startsWith('demo-') && (await read($, pals)).filter(isActive).length >= FULL_PARTY) await unlock($, 'full-party')
}

// Ends a quest once; a later report of the same end only adds the last words
// the first one lacked (the status poll often sees the end before the answer).
async function finish($: Engine, id: string, status: PalStatus, lastWords: string): Promise<void> {
  const now = await $.clock.now()
  const seen = await change($, id, pal => {
    if (isActive(pal)) {
      return {
        ...pal,
        status,
        activity: '',
        ask: null,
        endedAt: now,
        epitaph: epitaph(pal.hero, ENDING[status], pal.id),
        lastWords,
        xp: xpFor(status, pal.tools),
      }
    }
    return pal.lastWords === '' && lastWords !== '' ? { ...pal, lastWords } : null
  })
  if (seen === null || !isActive(seen.before)) return
  const pal = seen.after
  const hero = heroOf(pal.hero)
  const isCritical = status === 'done' && pal.tools >= CRITICAL_STEPS && !pal.id.startsWith('demo-')
  await recordFame($, pal.hero, record => withQuest(record, status, pal.xp ?? 0))
  if (isCritical) await criticalRoll($, 20, hero.name)
  else await chime($, status === 'done' ? 'done' : status === 'failed' ? 'error' : 'stopped')
  if (status === 'failed') await criticalRoll($, 1, hero.name)
  announce($, pal)
  if (pal.id.startsWith('demo-')) return
  if (status === 'done') await unlock($, 'first-blood')
  if (status === 'failed') await unlock($, 'fallen')
  if (status === 'done' && now - pal.startedAt >= MARATHON_MS) await unlock($, 'marathon')
  if (status === 'done' && isNightOwlHour(now)) await unlock($, 'night-owl')
}

async function ask($: Engine, id: string, say: (pal: Pal) => string): Promise<boolean> {
  const seen = await change($, id, pal => (isActive(pal) ? { ...pal, status: 'waiting', ask: say(pal) } : null))
  if (seen === null) return false
  if (seen.before.status !== 'waiting') {
    await chime($, 'needs-you')
    announce($, seen.after)
  }

  return true
}

async function resume($: Engine, id: string): Promise<void> {
  await change($, id, pal => (pal.status === 'waiting' ? { ...pal, status: 'working', ask: null } : null))
}

// A turn's usage, priced, onto the pal and its hero's lifetime spend.
async function addUsage($: Engine, id: string, usage: ModelUsage & { model: string }): Promise<void> {
  const one = priced(usage, usage.model)
  const seen = await change($, id, pal => ({ ...pal, usage: added(pal.usage, one) }))
  if (seen) await recordFame($, seen.after.hero, record => withSpend(record, tokensOf(one), one.cost))
}

function announce($: Engine, pal: Pal): void {
  const hero = heroOf(pal.hero)
  const text = pal.status === 'waiting' ? (pal.ask ?? OUTCOME.waiting) : pal.epitaph
  $.ui.toast(`${hero.name} the ${hero.title}: ${text}`, { timeoutMs: 6000 })
  if (pal.status === 'waiting' || pal.status === 'failed') {
    // Desktop notifications reach a terminal session only; anywhere else the
    // toast and the strip carry it, so a missing or failing notify is fine.
    try {
      $.ui.notify(text, { title: `${hero.name} · ${pal.description}` }).catch(() => undefined)
    } catch {
      // no notification channel here
    }
  }
}

// Opens the panel once a session, at its start (unless switched off in
// Settings), so the party is on show before any subagent sets out. A surface that cannot seat it yet (a narrow
// terminal, a desktop still attaching) holds it open and seats it later.
async function autoOpen($: Engine): Promise<void> {
  if (await read($, hasAutoOpened)) return
  await update($, hasAutoOpened, () => true)
  if (!(await read($, settings)).panelAtStart) return
  $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
}

// --- the overlord: the main thread ------------------------------------------

// A main-thread turn this long ends with a chime, so a long job is heard
// finishing; a quick reply stays quiet.
const LONG_TURN_MS = 30_000

async function changeOverlord($: Engine, fn: (lord: Overlord) => Overlord | null): Promise<{ before: Overlord; after: Overlord } | null> {
  let seen: { before: Overlord; after: Overlord } | null = null
  await update($, overlord, lord => {
    const after = fn(lord)
    seen = after === null ? null : { before: lord, after }
    return after ?? lord
  })

  return seen
}

async function overlordStarts($: Engine): Promise<void> {
  const now = await $.clock.now()
  await changeOverlord($, lord => ({ ...lord, status: 'working', activity: 'thinking', tools: 0, startedAt: now, ask: null }))
}

async function overlordActs($: Engine, activity: string): Promise<void> {
  await changeOverlord($, lord => (lord.status === 'idle' ? null : { ...lord, activity, tools: lord.tools + 1 }))
}

async function overlordResumes($: Engine): Promise<void> {
  await changeOverlord($, lord => (lord.status === 'waiting' ? { ...lord, status: 'working', ask: null } : null))
}

async function overlordAsks($: Engine, text: string): Promise<void> {
  const seen = await changeOverlord($, lord => ({ ...lord, status: 'waiting', ask: text }))
  if (seen && seen.before.status !== 'waiting') await chime($, 'needs-you')
}

async function overlordRests($: Engine, lastWords: string, durationMs: number, usage?: ModelUsage & { model: string }): Promise<void> {
  const one = usage === undefined ? null : priced(usage, usage.model)
  await changeOverlord($, lord => ({
    ...lord,
    status: 'idle',
    activity: '',
    ask: null,
    turns: lord.turns + 1,
    lastWords: lastWords || lord.lastWords,
    usage: one === null ? lord.usage : added(lord.usage, one),
  }))
  const now = await $.clock.now()
  const name = (await read($, settings)).mainName
  if (durationMs >= CRITICAL_TURN_MS) await criticalRoll($, 20, name)
  else if (durationMs >= LONG_TURN_MS) await chime($, 'done')
  if (durationMs >= MARATHON_MS) await unlock($, 'marathon')
  if (durationMs >= LONG_TURN_MS && isNightOwlHour(now)) await unlock($, 'night-owl')
}

// --- the panel sections -------------------------------------------------------

async function toggleSection($: Engine, key: Section): Promise<void> {
  await changeSettings($, now => ({ ...now, hidden: now.hidden.includes(key) ? now.hidden.filter(one => one !== key) : [...now.hidden, key] }))
}

// --- the camp: background work ------------------------------------------------

// This session's id and folder, for finding its background output files.
let sessionId = ''
let sessionCwd = ''
// Where this session's background output lives; undefined until looked for.
let tasksDir: string | null | undefined
const outputSizes = new Map<string, number>()

async function changeCamp($: Engine, fn: (tasks: CampTask[]) => CampTask[]): Promise<void> {
  const before = await read($, camp)
  const after = fn(before)
  if (JSON.stringify(before) !== JSON.stringify(after)) await update($, camp, () => after)
}

// <tmp>/claude-<uid>/<cwd slug>/<session>/tasks: found once, by looking.
async function findTasksDir($: Engine): Promise<string | null> {
  if (tasksDir !== undefined) return tasksDir
  if (sessionId === '' || sessionCwd === '') return null
  for (const root of ['/private/tmp', '/tmp']) {
    const entries = await $.fs.list(root).catch(() => [])
    for (const entry of entries.filter(one => one.name.startsWith('claude-'))) {
      const dir = `${root}/${entry.name}/${cwdSlug(sessionCwd)}/${sessionId}/tasks`
      if (await $.fs.exists(dir).catch(() => false)) {
        tasksDir = dir
        return dir
      }
    }
  }
  return null
}

// Every few seconds: forget what finished long ago, and read the newest
// output line of what is still running (only when its file has grown).
async function campTick($: Engine): Promise<void> {
  const now = await $.clock.now()
  await changeCamp($, tasks => pruneCamp(tasks, now))
  const running = (await read($, camp)).filter(one => one.status === 'running' && (one.kind === 'shell' || one.kind === 'monitor'))
  for (const id of outputSizes.keys()) if (!running.some(one => one.id === id)) outputSizes.delete(id)
  if (running.length === 0) return
  const dir = await findTasksDir($)
  if (dir === null) return
  for (const one of running) {
    const path = `${dir}/${one.id}.output`
    const stat = await $.fs.stat(path).catch(() => null)
    if (stat === null || stat.size === outputSizes.get(one.id)) continue
    outputSizes.set(one.id, stat.size)
    if (stat.size > MAX_PEEK_BYTES) continue
    const output = await $.fs.read(path).then(String).catch(() => '')
    const line = lastLine(output)
    if (line !== '' && line !== one.lastLine) await changeCamp($, tasks => tasks.map(task => (task.id === one.id ? { ...task, lastLine: line } : task)))
  }
}

// What a tool call started or ended in the background (from its result).
async function noteCamp($: Engine, tool: string, input: unknown, ran: { result?: unknown }, agentId: string | undefined): Promise<void> {
  if (ran.result === undefined) return
  const now = await $.clock.now()
  const made = campFromCall(tool, input, ran.result, now, agentId)
  if (made !== null) await changeCamp($, tasks => applyChange(tasks, made, now))
}

// Every tool the panel calls runs only when the person's own rules already
// allow it: anything else would go to a permission dialog or, in auto mode,
// to the mode's checker, a model call. The mod never spends tokens.
async function toolIsAllowed($: Engine, tool: string, input: Record<string, unknown>): Promise<boolean> {
  const answer = await $.tool.check({ tool, input }).catch(() => null)
  if (answer?.decision === 'allow') return true
  $.ui.toast(`To keep the DM screen free, it only uses tools you allow. Add "${tool}" to permissions.allow in ~/.claude/settings.json.`, { timeoutMs: 10000 })
  return false
}

async function stopCampTask($: Engine, one: CampTask): Promise<void> {
  if (!(await toolIsAllowed($, 'TaskStop', { task_id: one.id }))) return
  try {
    const ran = await $.tool.call({ tool: 'TaskStop', task_id: one.id })
    if ('deny' in ran && ran.deny !== undefined) throw new Error(ran.deny)
    if ('isError' in ran && ran.isError === true) throw new Error('text' in ran ? String(ran.text) : 'it refused')
  } catch (error) {
    $.ui.toast(`Couldn't stop it: ${error instanceof Error ? error.message : 'it refused'}`)
    return
  }
  const now = await $.clock.now()
  await changeCamp($, tasks => applyChange(tasks, { end: one.id, status: 'stopped' }, now))
}

// --- stamina and the quest log ---------------------------------------------

// The plan windows after a response; a toast when one crosses 80% or 95%.
async function noteStamina($: Engine, limits: readonly Stamina[]): Promise<void> {
  const now = await $.clock.now()
  const before = await read($, stamina)
  const next = shownStamina(limits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, ...(resetsAt ? { resetsAt } : {}) })))
  if (JSON.stringify(before) === JSON.stringify(next)) return
  await update($, stamina, () => next)
  for (const limit of next) {
    const was = before.find(one => one.kind === limit.kind)?.percentUsed
    const at = crossing(was, limit.percentUsed)
    if (at !== null) $.ui.toast(`${staminaLabel(limit.kind)} limit ${at}% used. ${staminaWords(limit, now)}.`)
  }
}

// The main thread's turn in progress; module state, so a reload mid-turn
// loses only that one receipt.
let currentQuest: Quest | null = null
let contextAtStart: number | null = null

async function questBegins($: Engine, text: string): Promise<void> {
  const lord = await read($, overlord)
  currentQuest = newQuest(lord.turns + 1, firstLine(text, 80), await $.clock.now())
  contextAtStart = lord.context?.tokens ?? null
}

async function questEnds($: Engine, durationMs: number): Promise<void> {
  if (currentQuest === null) return
  const lord = await read($, overlord)
  const after = lord.context?.tokens ?? null
  const done: Quest = {
    ...currentQuest,
    durationMs,
    contextGained: after !== null && contextAtStart !== null ? after - contextAtStart : null,
  }
  currentQuest = null
  await update($, quests, list => [...list, done].slice(-KEPT_QUESTS))
}

// --- compaction ------------------------------------------------------------

const CONDENSING = 'Condensing memories'

// Marks who is compacting: the Overlord when no agent is named, else that
// subagent's hero. An id no hero carries (the engine's own forks) changes nothing.
async function compacting($: Engine, agentId: string | undefined, since: number | null, result?: SessionCompactResult): Promise<void> {
  // Done: the bar refills to what the compaction left, or waits for the next
  // response to say, when the engine did not count it.
  const refilled = (context: Context | null | undefined): Context | null | undefined => {
    if (since !== null || !context || result === undefined || result.skip !== undefined) return context
    return { ...context, tokens: typeof result.tokensAfter === 'number' ? result.tokensAfter : null }
  }
  if (agentId === undefined) {
    await changeOverlord($, lord => ({ ...lord, compactingSince: since, context: refilled(lord.context) }))
    return
  }
  await change($, agentId, pal =>
    isActive(pal) || since === null ? { ...pal, compactingSince: since, context: refilled(pal.context) } : null,
  )
}

// After every model response: how full that agent's window now is. The main
// thread's figure is the engine's own (the status line's); a subagent's is
// what its request was answered over, against its model's window.
async function noteContext($: Engine, agentId: string | undefined, usage: ModelUsage, model: string): Promise<void> {
  const answered = contextTokens(usage)
  if (agentId === undefined) {
    const live = await $.session.usage().catch(() => null)
    const window = live?.context.window ?? windowFor(model, null)
    const used = live?.context.tokens ?? answered
    await changeOverlord($, lord => ({ ...lord, context: { tokens: used, window, model } }))
    if (live) await noteStamina($, live.rateLimits)
    return
  }
  const lord = await read($, overlord)
  await change($, agentId, pal => (isActive(pal) ? { ...pal, context: { tokens: answered, window: windowFor(model, lord.context), model } } : null))
}

const isCompacting = (who: { compactingSince?: number | null }) => typeof who.compactingSince === 'number'

// --- the demo (/dm demo) -----------------------------------------------------

// A scripted show of the context bars and compaction, with made-up heroes
// (ids "demo-…", kept out of the hall of fame) and the Overlord's own card.
// The Overlord's real figure comes back with its next response.
const DEMO = [
  { id: 'demo-1', description: 'Demo: guard the eastern gate', type: 'general-purpose', activity: 'studying the gate plans', used: 0.35 },
  { id: 'demo-2', description: 'Demo: scout the old mine', type: 'Explore', activity: 'scouting for tunnels', used: 0.7 },
  { id: 'demo-3', description: 'Demo: inspect the bridge', type: 'code-reviewer', activity: 'testing every plank', used: 0.91 },
] as const
const DEMO_WINDOW = 200_000

async function demo($: Engine, holdMs = 40_000): Promise<void> {
  const now = await $.clock.now()
  for (const one of DEMO) {
    await addPal($, one.id, one.description, one.type)
    await change($, one.id, pal => ({
      ...pal,
      activity: one.activity,
      context: { tokens: Math.round(DEMO_WINDOW * one.used), window: DEMO_WINDOW, model: 'demo' },
    }))
  }
  const lord = await read($, overlord)
  const lordBefore = lord.context ?? null
  const window = lordBefore?.window ?? 1_000_000
  await changeOverlord($, current => ({ ...current, context: { tokens: Math.round(window * 0.82), window, model: lordBefore?.model ?? 'demo' } }))
  // The camp: a server left burning, a test run that finishes, a wake-up.
  const campDemo = (id: string, kind: CampTask['kind'], title: string, detail: string, lastLine: string, wakesAt?: number): CampTask => ({
    id, kind, title, detail, status: 'running', startedAt: now - 90_000, endedAt: null, lastLine, ...(wakesAt === undefined ? {} : { wakesAt }),
  })
  await changeCamp($, tasks => [
    ...tasks.filter(one => !one.id.startsWith('demo-')),
    campDemo('demo-camp-server', 'shell', 'Demo: the forge fire', 'keep the forge lit', 'the forge burns hot'),
    campDemo('demo-camp-tests', 'shell', 'Demo: count the treasury', 'count every coin', '412 coins counted · checking the last chest'),
    campDemo('demo-camp-wake', 'wakeup', 'Demo: the night watch', 'wake the night watch', '', now + 18 * 60_000),
  ])

  // 4 s in, the nearly-full hero compacts; 8 s in, the Overlord does.
  $.clock.after(4000, () => {
    $.clock.now().then(at => compacting($, 'demo-3', at)).catch(() => undefined)
  })
  $.clock.after(8000, () => {
    $.clock.now().then(at => compacting($, undefined, at)).catch(() => undefined)
  })
  $.clock.after(12_000, () => {
    $.clock.now()
      .then(at => changeCamp($, tasks => applyChange(tasks, { end: 'demo-camp-tests', status: 'done', summary: '418 coins' }, at)))
      .catch(() => undefined)
  })
  $.clock.after(16_000, () => {
    compacting($, 'demo-3', null, { messages: [], tokensAfter: 24_000 }).catch(() => undefined)
  })
  $.clock.after(22_000, () => {
    compacting($, undefined, null, { messages: [], tokensAfter: Math.round(window * 0.09) }).catch(() => undefined)
  })
  $.clock.after(holdMs, () => {
    changeCamp($, tasks => tasks.filter(one => !one.id.startsWith('demo-')))
      .then(() => update($, pals, list => list.filter(pal => !pal.id.startsWith('demo-'))))
      .then(() => changeOverlord($, current => ({ ...current, context: lordBefore })))
      .catch(() => undefined)
  })
}

// --- what the person does from the panel ----------------------------------

async function stop($: Engine, pal: Pal): Promise<void> {
  const hero = heroOf(pal.hero)
  if (!(await toolIsAllowed($, 'TaskStop', { task_id: pal.id }))) return
  try {
    const ran = await $.tool.call({ tool: 'TaskStop', task_id: pal.id })
    if ('deny' in ran && ran.deny !== undefined) throw new Error(ran.deny)
    if ('isError' in ran && ran.isError === true) throw new Error('text' in ran ? String(ran.text) : 'it refused')
  } catch (error) {
    $.ui.toast(`Couldn't stop ${hero.name}: ${error instanceof Error ? error.message : 'it refused'}`)
    return
  }
  await finish($, pal.id, 'stopped', '')
}

async function setSwitch($: Engine, key: Switch, isOn: boolean): Promise<void> {
  await changeSettings($, now => ({ ...now, [key]: isOn }))
}

// --- the hall of fame ----------------------------------------------------

async function recordFame($: Engine, hero: number, fn: (record: Fame | undefined) => Fame): Promise<void> {
  // Several sessions share the hall: read what is stored now, apply this
  // quest to it, and write that back, so no session's XP overwrites another's.
  const key = String(hero)
  const stored = await $.store.get(STORE_FAME).catch(() => undefined)
  const base = stored === undefined ? await read($, fame) : readFame(stored)
  const before = base[key]?.xp ?? 0
  const next: Record<string, Fame> = { ...base, [key]: fn(base[key]) }
  await $.store.set(STORE_FAME, next).catch(() => undefined)
  await update($, fame, () => next)
  const level = levelOf(next[String(hero)]?.xp ?? 0)
  if (level > levelOf(before)) await levelUp($, hero, level)
  if (HEROES.every((_, index) => (next[String(index)]?.xp ?? 0) > 0)) await unlock($, 'whole-guild')
}

// --- glory: level-ups, critical rolls and achievements ---------------------------

async function levelUp($: Engine, hero: number, level: number): Promise<void> {
  const now = await $.clock.now()
  const who = heroOf(hero)
  await update($, levelUps, all => ({ ...all, [String(hero)]: now + LEVEL_GLOW_MS }))
  $.ui.toast(`${who.name} the ${who.title} reached level ${level}!`, { timeoutMs: 6000 })
  lastAt = Number.NEGATIVE_INFINITY
  await chime($, 'level-up')
  if (level >= 3) await unlock($, 'veteran')
  if (level >= 5) await unlock($, 'legend')
}

// A natural 20 for a long quest won, a natural 1 for a hero who falls: the
// strip shows the die on that face for a few seconds.
async function criticalRoll($: Engine, face: 20 | 1, who: string): Promise<void> {
  const now = await $.clock.now()
  await update($, critical, () => ({ face, who, until: now + CRITICAL_SHOW_MS }))
  $.clock.after(CRITICAL_SHOW_MS, () => {
    update($, critical, current => (current !== null && current.until <= now + CRITICAL_SHOW_MS ? null : current)).catch(() => undefined)
  })
  if (face === 20) {
    $.ui.toast(`Natural 20! ${who} wins a long quest.`, { timeoutMs: 6000 })
    lastAt = Number.NEGATIVE_INFINITY
    await chime($, 'critical')
    await unlock($, 'natural-20')
  } else {
    $.ui.toast(`Natural 1. ${who} falls.`, { timeoutMs: 6000 })
  }
}

async function unlock($: Engine, id: AchievementId): Promise<void> {
  if ((await read($, earned))[id] !== undefined) return
  const now = await $.clock.now()
  // Merged with what other sessions have earned since this one loaded.
  const stored = readEarned(await $.store.get(STORE_EARNED).catch(() => undefined))
  const wasEarned = stored[id] !== undefined
  const next = { ...(await read($, earned)), ...stored, ...(wasEarned ? {} : { [id]: now }) }
  await $.store.set(STORE_EARNED, next).catch(() => undefined)
  await update($, earned, () => next)
  if (wasEarned) return
  const one = ACHIEVEMENTS.find(item => item.id === id)
  if (one !== undefined) $.ui.toast(`Achievement unlocked: ${one.name}. ${one.how}`, { timeoutMs: 8000 })
}

async function countArchive($: Engine): Promise<void> {
  const tally = (await $.store.get(STORE_TALLY).catch(() => undefined)) as { archived?: number } | undefined
  const archived = (typeof tally?.archived === 'number' ? tally.archived : 0) + 1
  await $.store.set(STORE_TALLY, { ...(tally ?? {}), archived }).catch(() => undefined)
  if (archived >= ARCHIVES_FOR_SWEEP) await unlock($, 'clean-sweep')
}

async function forgetFame($: Engine): Promise<void> {
  await update($, fame, () => ({}))
  await $.store.set(STORE_FAME, {}).catch(() => undefined)
}

// --- the status poll -----------------------------------------------------

// Catches agents no spawn hook saw (started before a reload, forks), ends the
// ones the engine says are over, and ticks the clocks on the cards.
async function sync($: Engine): Promise<void> {
  const agents = await $.agent.list().catch(() => [])
  const list = await read($, pals)
  for (const agent of agents) {
    const known = list.find(pal => pal.id === agent.id)
    const isRunning = agent.status === 'running' || agent.status === 'pending'
    if (known === undefined) {
      if (isRunning) await addPal($, agent.id, agent.description, agent.type, agent.parentId)
      continue
    }
    if (!isActive(known)) {
      // A teammate goes idle between turns and wakes again on a message.
      if (isRunning && agent.teammateId !== undefined) {
        await change($, agent.id, pal => ({ ...pal, status: 'working', activity: 'back on the road', endedAt: null, ask: null }))
      }
      continue
    }
    if (agent.status === 'completed' || agent.status === 'idle') await finish($, agent.id, 'done', '')
    if (agent.status === 'failed') await finish($, agent.id, 'failed', '')
    if (agent.status === 'killed') await finish($, agent.id, 'stopped', '')
  }
  const now = await $.clock.now()
  const lord = await read($, overlord)
  if (lord.status !== 'idle' || list.some(pal => isActive(pal) || now - (pal.endedAt ?? 0) < RECENT_MS)) {
    await update($, tick, n => n + 1)
  }
}

// --- the realm: the shared look and every open session ----------------------

// Who this session is on the map; set at session.start, kept by the module.
let selfId = ''
let selfName = ''
// The mod's own folder (see dataDirFrom), and the home folder, set at session.start.
let dataDir: string | null = null
let homeDir: string | null = null

// The desktop app's appearance from its config.json: light, dark, or
// anything else (follow the system), read leniently.
function appModeOf(text: string): string | undefined {
  try {
    const value = (JSON.parse(text) as { userThemeMode?: unknown }).userThemeMode
    return typeof value === 'string' ? value.toLowerCase() : undefined
  } catch {
    return undefined
  }
}
let selfLink: string | undefined
let lastWritten: Kingdom | null = null
let lastWriteAt = Number.NEGATIVE_INFINITY

// Every few seconds: read the shared settings, check this session in, and read
// every other session's check-in. All of it best effort: a failed read or
// write leaves the panel as it was.
async function realmTick($: Engine): Promise<void> {
  const dir = dataDir
  if (dir === null) return
  const now = await $.clock.now()

  const settingsText = await $.fs.read(`${dir}/settings.json`).then(String).catch(() => null)
  if (settingsText !== null) await applySettings($, readSettings(settingsText))
  const names = readNames(await $.fs.read(`${dir}/names.json`).then(String).catch(() => null))
  if (JSON.stringify(names) !== JSON.stringify(await read($, sessionNames))) await update($, sessionNames, () => names)

  if (selfId !== '') {
    const working = (await read($, camp)).filter(isRunningWork).length
    const mine = kingdomOf(selfId, selfName, await read($, overlord), (await read($, pals)).filter(isActive), now, working, selfLink)
    if (!sameKingdom(lastWritten, mine) || now - lastWriteAt >= HEARTBEAT_MS) {
      await $.fs.write(kingdomFile(dir, selfId), JSON.stringify(mine)).catch(() => undefined)
      lastWritten = mine
      lastWriteAt = now
    }
  }

  // The app's list is asked for only while the map is on screen: one full
  // read first, small asks after.
  if ((await read($, view)) === 'map' && (await read($, isPaneOpen))) await refreshAppSessions($, lastFullAt === Number.NEGATIVE_INFINITY).catch(() => undefined)

  const entries = await $.fs.list(`${dir}/sessions`).catch(() => [])
  const files = freshFiles(entries, now, `${selfId}.json`)
  const texts = await Promise.all(files.map(entry => $.fs.read(`${dir}/sessions/${entry.name}`).then(String).catch(() => '')))
  const others = kingdomsFrom(texts, now)
  const before = await read($, realm)
  if (JSON.stringify(before) !== JSON.stringify(others)) await update($, realm, () => others)
}

// "Go there": hand the session's own app link to macOS, which switches the
// desktop app to it, as clicking that link anywhere else would.
async function goToKingdom($: Engine, k: Kingdom): Promise<void> {
  if (!isSessionLink(k.link)) return
  const ran = await $.process.run(['open', k.link]).catch(() => null)
  if (ran === null || ran.exitCode !== 0) $.ui.toast(`Couldn't switch to ${k.name}. Open it from the sidebar.`)
}

// The app's own list: every session open in its sidebar, running or not.
// A long history (hundreds of sessions) is too big for one tool answer: the
// app saves it to a file and says where, so the full list is read from that
// file. It is asked for when the person opens the map or one of its folded
// lists, at most every five minutes; in between, a small ask of the 30 most
// recent keeps names and activity fresh every 30 s while the map shows.
let lastListAt = Number.NEGATIVE_INFINITY
let lastFullAt = Number.NEGATIVE_INFINITY
const FULL_LIST_MS = 5 * 60_000
const SMALL_LIST = 30
const FULL_LIST = 400

async function listAnswer($: Engine, args: Record<string, unknown>): Promise<unknown> {
  const ran = await $.tool.call({ tool: LIST_SESSIONS, ...args } as never).catch(() => null)
  if (ran === null || ('deny' in ran && ran.deny !== undefined)) return null
  const answer = (ran as { result?: unknown }).result ?? (ran as { text?: unknown }).text
  // Only the engine's own "too big" notice, as the whole answer, naming a
  // file in its own tool-results folder: never a path from a session title.
  const text = Array.isArray(answer) && answer.length === 1 ? (answer[0] as { text?: unknown }).text : answer
  const notice = typeof text === 'string' ? /^Error: result \([^)]*\) exceeds maximum allowed tokens\. Output has been saved to (\/[^\s]+\.txt)\./.exec(text) : null
  if (notice === null) return answer
  const saved = notice[1] ?? ''
  const config = dataDir === null ? null : dataDir.replace(/\/dungeon-master$/, '')
  if (config === null || !saved.startsWith(`${config}/projects/`) || !saved.includes('/tool-results/') || saved.includes('/../')) return null
  const stat = await $.fs.stat(saved).catch(() => null)
  if (stat === null || stat.kind !== 'file' || stat.size > 4 * 1024 * 1024) return null

  return $.fs.read(saved).then(String).catch(() => null)
}

// Whether the app's session list runs without asking anyone. In auto mode an
// "ask" goes to the mode's checker, a model call: the map never spends that
// in the background, so then it asks only when the person opens the map.
let listDecision: 'allow' | 'ask' | 'deny' | null = null

async function listIsFree($: Engine): Promise<boolean> {
  if (listDecision === null) {
    const answer = await $.tool.check({ tool: LIST_SESSIONS, input: { limit: SMALL_LIST } }).catch(() => null)
    listDecision = answer?.decision ?? 'ask'
  }
  return listDecision === 'allow'
}

async function refreshAppSessions($: Engine, full = false): Promise<void> {
  const now = await $.clock.now()
  const isFull = full && now - lastFullAt >= FULL_LIST_MS
  if (!isFull && now - lastListAt < APP_LIST_MS) return
  const isFree = await listIsFree($)
  if (listDecision === 'deny' || (!isFree && !isFull)) return
  lastListAt = now
  if (isFull) {
    lastFullAt = now
    const answer = await listAnswer($, { limit: FULL_LIST, include_archived: true })
    const open = answer === null ? [] : appSessionsFrom(answer)
    const archived = answer === null ? [] : appSessionsFrom(answer, 'archived')
    lastListReport = `full list: ${open.length} open, ${archived.length} archived${answer === null ? ' (no answer)' : ''}`
    if (open.length > 0 && JSON.stringify(open) !== JSON.stringify(await read($, appSessions))) await update($, appSessions, () => open)
    if (answer !== null && JSON.stringify(archived) !== JSON.stringify(await read($, archivedSessions))) await update($, archivedSessions, () => archived)
    return
  }
  // The small ask: fresh names and activity for the most recent, merged in.
  const answer = await listAnswer($, { limit: SMALL_LIST })
  const recent = answer === null ? [] : appSessionsFrom(answer)
  lastListReport = `${lastListReport.split(';')[0]}; recent ${recent.length}`
  if (recent.length === 0) return
  await update($, appSessions, list => {
    const fresh = new Map(recent.map(one => [one.id, one]))
    const kept = list.filter(one => !fresh.has(one.id))
    return [...recent, ...kept]
  })
}

// Close = the app's archive: the session's process stops and it moves to the
// sidebar's Archived list, from where it can be reopened. One press, no
// confirm (the person asked: it can always come back). The last refusal is
// kept for /dm status.
const CLOSE_TIMEOUT_MS = 20_000
// The last archive or restore the app refused, for /dm status (no titles).
let lastRefusal = ''

function noteRefusal(what: string, answer: { ok: boolean; text: string }): void {
  if (!answer.ok) lastRefusal = `${what}: ${answer.text.slice(0, 200)}`
}

// What the app said, as text: an error, a refusal ("not archived…"), or done.
function archiveAnswer(ran: unknown): { ok: boolean; text: string } {
  const value = ran as { deny?: string; isError?: boolean; text?: unknown; result?: unknown }
  if (value.deny !== undefined) return { ok: false, text: value.deny }
  const text = JSON.stringify(value.result ?? value.text ?? '').slice(0, 300)
  if (/keeping it for the user/i.test(text)) {
    return { ok: false, text: 'the app keeps this one (it is pinned, or open in a window). Archive it from the sidebar.' }
  }
  if (/auto mode classifier/i.test(text)) {
    return { ok: false, text: 'auto mode cannot approve a click. Press ⓘ Archive not working? on the map for the setting it needs.' }
  }
  if (value.isError === true) return { ok: false, text }
  // The app's own success line first, so a title that happens to contain
  // "pinned" or "denied" never reads as a refusal.
  if (/^\W*(Archived session|Restored|Unarchived)/i.test(text.replace(/^\[\{"type":"text","text":/, ''))) return { ok: true, text }
  if (/not archived|not restored|still working|open on screen|refus|denied|declined|^"?Error/i.test(text)) return { ok: false, text }

  return { ok: true, text }
}

async function archiveOne($: Engine, id: string, title: string): Promise<{ ok: boolean; text: string }> {
  if (id.startsWith('demo-')) return { ok: false, text: 'it is a showcase session, made up for pictures' }
  if (!(await toolIsAllowed($, ARCHIVE_SESSION, { session_id: id }))) return { ok: false, text: 'archiving is not in your allow list yet' }
  let timer: { cancel: () => void } | undefined
  const timeout = new Promise<{ ok: boolean; text: string }>(resolve => {
    timer = $.clock.after(CLOSE_TIMEOUT_MS, () => resolve({ ok: false, text: `no answer from the app after ${CLOSE_TIMEOUT_MS / 1000}s (waiting for an approval?)` }))
  })
  const call = $.tool
    .call({ tool: ARCHIVE_SESSION, session_id: id, reason: 'Closed from the Dungeon Master map' } as never)
    .then(archiveAnswer)
    .catch((error: unknown) => ({ ok: false, text: error instanceof Error ? error.message : String(error) }))
  const answer = await Promise.race([call, timeout])
  timer?.cancel()
  noteRefusal('archive', answer)
  if (!answer.ok && answer.text.startsWith('the app keeps this one')) await update($, keptByApp, list => (list.includes(id) ? list : [...list, id]))
  if (answer.ok) {
    const was = (await read($, appSessions)).find(one => one.id === id)
    await update($, appSessions, list => list.filter(one => one.id !== id))
    await update($, realm, list => list.filter(k => hostIdOf(k.link) !== id))
    await countArchive($).catch(() => undefined)
    await update($, archivedSessions, list => [{ id, title: was?.title ?? title, lastActivityAt: was?.lastActivityAt ?? 0, isPinned: false, isArchived: true }, ...list.filter(one => one.id !== id)])
  }

  return answer
}

async function closeSession($: Engine, id: string, title: string): Promise<void> {
  $.ui.toast(`Archiving ${title}…`)
  const answer = await archiveOne($, id, title)
  $.ui.toast(answer.ok ? `Archived ${title}. It is under Archived in the sidebar.` : `Couldn't archive ${title}: ${answer.text}`, { timeoutMs: 8000 })
}

// A session's own name: written to the shared file (read fresh first, so two
// sessions renaming at once both land); empty puts the app's title back.
async function nameSession($: Engine, id: string, text: string): Promise<void> {
  const dir = dataDir
  const name = cleanSessionName(text)
  const file = dir === null ? null : `${dir}/names.json`
  const now = file === null ? await read($, sessionNames) : readNames(await $.fs.read(file).then(String).catch(() => null))
  const next = { ...now }
  if (name === '') delete next[id]
  else next[id] = name
  if (file !== null) await $.fs.write(file, JSON.stringify(next, null, 2)).catch(() => undefined)
  await update($, sessionNames, () => next)
  await update($, renaming, () => null)
}

// Restore: the app's unarchive, the same way round; the session comes back
// to the sidebar and onto the map.
async function restoreSession($: Engine, one: AppSession): Promise<void> {
  if (one.id.startsWith('demo-')) return
  if (!(await toolIsAllowed($, UNARCHIVE_SESSION, { session_id: one.id }))) return
  $.ui.toast(`Restoring ${one.title}…`)
  const answer = await $.tool
    .call({ tool: UNARCHIVE_SESSION, session_id: one.id } as never)
    .then(archiveAnswer)
    .catch((error: unknown) => ({ ok: false, text: error instanceof Error ? error.message : String(error) }))
  noteRefusal('restore', answer)
  if (answer.ok) {
    await update($, archivedSessions, list => list.filter(s => s.id !== one.id))
    await update($, appSessions, list => [...list, { ...one, isArchived: false }])
  }
  $.ui.toast(answer.ok ? `Restored ${one.title}. It is back in the sidebar.` : `Couldn't restore ${one.title}: ${answer.text}`, { timeoutMs: 8000 })
}

async function askFirst($: Engine, what: string): Promise<void> {
  await update($, confirming, () => what)
  $.clock.after(CONFIRM_MS, () => {
    update($, confirming, current => (current === what ? null : current)).catch(() => undefined)
  })
}

// Close all: the same archive, one after another, pinned ones skipped.
async function closeAll($: Engine, band: 'idle' | 'asleep', targets: ReadonlyArray<{ id: string; title: string }>): Promise<void> {
  await update($, confirming, () => null)
  $.ui.toast(`Archiving ${targets.length} ${band} ${targets.length === 1 ? 'session' : 'sessions'}…`)
  let closed = 0
  const failed: string[] = []
  for (const one of targets) {
    const answer = await archiveOne($, one.id, one.title)
    if (answer.ok) closed += 1
    else failed.push(`${one.title} (${answer.text.slice(0, 80)})`)
  }
  $.ui.toast(
    failed.length === 0
      ? `Archived ${closed} ${band} ${closed === 1 ? 'session' : 'sessions'}. They are under Archived in the sidebar.`
      : `Archived ${closed}; ${failed.length} would not archive: ${failed.slice(0, 2).join('; ')}${failed.length > 2 ? '…' : ''}`,
    { timeoutMs: 10_000 },
  )
}

// Closing: off the map at once rather than after the stale window.
async function leaveRealm($: Engine): Promise<void> {
  const dir = dataDir
  if (dir === null || lastWritten === null) return
  await $.fs.write(kingdomFile(dir, selfId), JSON.stringify({ ...lastWritten, hasEnded: true })).catch(() => undefined)
}

// A moving drawing as one self-animating picture: fn draws frame n.
const looped = (draw: (frame: number) => string) => animatedSvg(LOOP_FRAMES.map(draw), FRAME_MS)

// --- the strip above the prompt -------------------------------------------

async function drawBand($: Engine, e: RenderInput<'AbovePrompt'>): Promise<RenderElement> {
  const allPals = await read($, pals)
  await read($, tick)
  const chosen = await read($, settings)
  const isOpen = await read($, isPaneOpen)
  const crit = await read($, critical)
  // Narrower than the breakpoint, the button sits under the words.
  const isNarrowStrip = (e.props.bodyColumns ?? 120) < NARROW_STRIP_COLUMNS
  const now = await $.clock.now()
  const isShowcase = (await read($, showcaseUntil)) > now
  const list = isShowcase ? allPals.filter(pal => pal.id.startsWith('demo-')) : allPals
  const lord = isShowcase ? showcaseLord(await read($, overlord)) : await read($, overlord)
  const frame = Math.floor(now / FRAME_MS)
  const isTerminal = e.surface === 'terminal'
  const live = list.filter(isActive)
  const recent = list.filter(pal => !isActive(pal) && now - (pal.endedAt ?? 0) < RECENT_MS)
  const look = await lookNow($, chosen.theme)
  const hiddenInHud = chosen.hidden
  const limits = hiddenInHud.includes('stamina') ? [] : await read($, stamina)
  const inCamp = hiddenInHud.includes('camp') ? 0 : (await read($, camp)).filter(one => !isShowcase || one.id.startsWith('demo-')).filter(isRunningWork).length
  const { Box, Text, Button } = $.ui.resolve(e)
  // Always drawn, so the way into the panel is there from the first prompt:
  // the party when one is out, else the Overlord (the main thread) alone.
  const mainName = chosen.mainName
  const condensing = [...(isCompacting(lord) ? [mainName] : []), ...live.filter(isCompacting).map(pal => heroOf(pal.hero).name)]
  const left = leftOf(lord.context)
  const words =
    condensing.length > 0
      ? `${CONDENSING}: ${condensing.join(', ')}`
      : live.length > 0
      ? summary(list)
      : recent.length > 0
        ? `${plural(recent.length, 'quest', 'quests')} just ended: ${recent.map(pal => heroOf(pal.hero).name).join(', ')}`
        : `${mainName} · ${
            lord.status === 'working'
              ? `${lord.activity || 'thinking'} · ${elapsed(now - lord.startedAt)}`
              : lord.status === 'waiting'
                ? 'needs you'
                : OVERLORD_VOICE.idle
          }${isTerminal && left !== null ? ` · ${Math.round(left * 100)}% context left` : ''}`
  const campWords = inCamp > 0 ? ` · ${inCamp} in camp` : ''

  // The HUD: a dungeon-stone panel, the Overlord striding in its corner and
  // its context bar under the words (the terminal keeps the words alone).
  const svg = (source: string, alt: string, size: Size) => {
    if (e.surface === 'terminal') return null
    const { Svg } = $.ui.resolve(e)
    return <Svg source={source} alt={alt} width={size.width} height={size.height} />
  }

  const toggle = (
    <Button
      key="open"
      label={isOpen ? 'Close DM screen' : 'Open DM screen'}
      onPress={async () => {
        if (isOpen) await $.ui.close({ id: PANE })
        else await $.ui.open({ id: PANE, title: TITLE })
        await update($, isPaneOpen, () => !isOpen)
      }}
    />
  )

  return (
    <Box flexDirection="row" gap={1} alignItems="center" paddingX={1} borderStyle="round" borderColor={look.frame} backgroundColor={look.panel}>
      {!isTerminal &&
        (chosen.mainLook < 0
          ? (() => {
              const art = croppedFigure(looped(f => overlordSvg(lord.status, f, isCompacting(lord), figureTop(-1) - 2)), -1, HUD_LORD_SIZE.height / 38)
              return svg(art.svg, `${mainName}, your character`, art)
            })()
          : (() => {
              const art = croppedFigure(
                looped(f => heroSvg(chosen.mainLook, lord.status === 'waiting', lord.status !== 'idle' || isCompacting(lord) ? f : 0, HUD_HERO_SIZE, isCompacting(lord), figureTop(chosen.mainLook) - 2)),
                chosen.mainLook,
                HUD_HERO_SIZE.height / 30,
              )
              return svg(art.svg, `${mainName}, your character`, art)
            })())}
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {crit !== null && crit.until > now ? (
          <Box flexDirection="row" gap={1} alignItems="center">
            {svg(diePicture(0, 26, crit.face === 20 ? look.name : '#B91C1C', look.inset, look.code, crit.face).svg, `A natural ${crit.face}`, { width: 26, height: 26 })}
            <Text color={crit.face === 20 ? look.name : look.text} bold wrap="wrap">
              {crit.face === 20 ? `Natural 20! ${crit.who} wins a long quest.` : `Natural 1. ${crit.who} falls.`}
            </Text>
          </Box>
        ) : (
          <Text color={look.text} bold={live.some(pal => pal.status === 'waiting')} wrap="wrap">
            {words}
            {campWords}
          </Text>
        )}
        {!isTerminal && (
          <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
            {svg(looped(f => contextBarSvg(lord.context, f, isCompacting(lord), BAR_SIZE)), contextWords(lord.context, isCompacting(lord)), BAR_SIZE)}
            <Text color={look.dim} wrap="wrap">
              {contextWords(lord.context, isCompacting(lord))}
            </Text>
          </Box>
        )}
        {limits.length > 0 &&
          (isTerminal ? (
            <Text color={look.dim} wrap="wrap">
              Stamina: {limits.map(limit => staminaWords(limit, now)).join(' · ')}
            </Text>
          ) : (
            <Box flexDirection="row" gap={2} flexWrap="wrap">
              {limits.map(limit => (
                <Box key={`stamina:${limit.kind}`} flexDirection="row" gap={1} alignItems="center">
                  {svg(contextBarSvg(asContext(limit), 0, false, MINI_BAR_SIZE), staminaWords(limit, now), MINI_BAR_SIZE)}
                  <Text color={look.dim}>{staminaWords(limit, now)}</Text>
                </Box>
              ))}
            </Box>
          ))}
        {isNarrowStrip && toggle}
      </Box>
      {!isNarrowStrip && toggle}
    </Box>
  )
}

// --- the panel -------------------------------------------------------------

async function drawPane($: Engine, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const allPals = await read($, pals)
  const opened = await read($, openGrave)
  const prefs = await read($, settings)
  const showing = await read($, view)
  const levelGlow = showing === 'party' ? await read($, levelUps) : {}
  // Only the party page moves: the clocks and the walk redraw it alone.
  if (showing === 'party') await read($, tick)
  const records = await read($, fame)
  const shownAt = await $.clock.now()
  // Showcase: made-up heroes, map, quests and camp, nothing of the person's own.
  const isShowcase = (await read($, showcaseUntil)) > shownAt
  const list = isShowcase ? [...allPals.filter(pal => pal.id.startsWith('demo-') && isActive(pal)), ...showcaseGraves(shownAt)] : allPals
  const lord = isShowcase ? showcaseLord(await read($, overlord)) : await read($, overlord)
  const kingdoms = isShowcase ? showcaseKingdoms(shownAt) : await read($, realm)
  const limits = await read($, stamina)
  const questLog = isShowcase ? showcaseQuests(shownAt) : await read($, quests)
  const shows = (key: Section) => !prefs.hidden.includes(key)
  const campTasks = shows('camp') ? (await read($, camp)).filter(one => !isShowcase || one.id.startsWith('demo-')) : []
  const look = await lookNow($, prefs.theme)
  const now = await $.clock.now()
  const frame = Math.floor(now / FRAME_MS)
  const isTerminal = e.surface === 'terminal'
  const wrap = (text: string) => (isTerminal ? text : softBreak(text))
  lastPaneColumns = e.props.bodyColumns ?? lastPaneColumns
  const narrow = (e.props.bodyColumns ?? 80) < NARROW_COLUMNS
  // A row of words and buttons, as the breakpoint lays it out.
  const line = narrow ? ({ flexDirection: 'column', alignItems: 'flex-start' } as const) : ({ flexDirection: 'row', alignItems: 'center' } as const)

  // The size goes on the element: without it the desktop stretches the
  // drawing to fill the slot, whatever the markup says. Drawn as an image,
  // not an interactive frame: every redraw rebuilt the frame, a flicker
  // (heroes.ts says how they move all the same).
  const picture = (svg: string, alt: string, size: Size) => {
    if (e.surface === 'terminal') return <Text color={look.text}>{alt}</Text>
    const { Svg } = $.ui.resolve(e)
    return <Svg source={svg} alt={alt} width={size.width} height={size.height} />
  }

  // The context bar under a name: the pixel bar, then its words.
  const contextBar = (key: string, who: { context?: Context | null; compactingSince?: number | null }, size: Size) => {
    const condensing = isCompacting(who)
    const words = contextWords(who.context, condensing)
    return (
      <Box key={`context:${key}`} flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
        {picture(looped(f => contextBarSvg(who.context, f, condensing, size)), isTerminal ? contextBarText(who.context, condensing) : words, size)}
        <Text color={look.dim} wrap="wrap">
          {isTerminal ? words.replace(/^Context:? ?/, '') : words}
        </Text>
      </Box>
    )
  }

  // An icon in the chosen style; the terminal draws none.
  const icon = (name: GlyphName, alt: string, size = 16) => {
    if (e.surface === 'terminal') return null
    const { Svg } = $.ui.resolve(e)
    const art = iconPicture(name, size, look.name)
    return <Svg key={`icon:${name}:${alt}`} source={art.svg} alt={alt} width={art.width} height={art.height} />
  }

  // A heading in the chosen font (the app's own on the terminal, or when
  // the person prefers it).
  const heading = (key: string, text: string, glyph?: GlyphName) => {
    const carved = () => {
      const art = e.surface === 'terminal' ? null : headingPicture(prefs.headingFont, text, look.name, look.inset)
      if (art === null || e.surface === 'terminal') {
        return (
          <Text color={look.name} bold wrap="wrap">
            {text}
          </Text>
        )
      }
      const { Svg } = $.ui.resolve(e)
      return <Svg source={art.svg} alt={text} width={art.width} height={art.height} />
    }
    return (
      <Box key={`heading:${key}`} flexDirection="row" gap={1} alignItems="center">
        {glyph !== undefined && icon(glyph, text, 20)}
        {carved()}
      </Box>
    )
  }

  // A button: the app draws it (shape, colour, texture) and takes one plain
  // string as its words. None is dimmed (a dimmed label falls under 3:1 in
  // both modes); the current one is primary.
  const act = (key: string, label: string, onPress: () => unknown, style: { isMain?: boolean } = {}) => (
    <Button
      key={key}
      label={label}
      variant={style.isMain ? 'primary' : undefined}
      onPress={onPress}
    />
  )

  // A foldable section's heading: ▸/▾ always at the far left, the title,
  // a note that wraps, and the section's own action on the right.
  const foldedHere = new Set(await read($, mapFolded))
  const foldHead = (key: string, title: string, glyph: GlyphName, note: string, action: RenderElement | null = null) => (
    <Box key={`head:${key}`} {...line} gap={1}>
      <Box flexDirection="row" gap={1} alignItems="center">
        <Button key={`fold:${key}`} label={foldedHere.has(key) ? '▸' : '▾'} onPress={() => toggleFold($, key)} />
        {heading(key, title, glyph)}
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        <Text color={look.dim} wrap="wrap">
          {note}
        </Text>
      </Box>
      {action !== null && <Box flexShrink={0}>{action}</Box>}
    </Box>
  )

  // The header: what this page is, and the way to the other three.
  const page =
    showing === 'fame'
      ? { glyph: 'fame' as const, title: 'Hall of Heroes', note: 'XP earned across every session' }
      : showing === 'map'
        ? { glyph: 'map' as const, title: 'The Realm Map', note: 'every Claude session in the app' }
        : showing === 'settings'
          ? { glyph: 'settings' as const, title: "The DM's Tome", note: 'settings, shared by every open session' }
          : { glyph: 'party' as const, title: 'Your Party', note: summary(list) }
  const someoneWaits = kingdoms.some(k => k.status === 'waiting')
  const header = (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        {heading('page', page.title, page.glyph)}
        <Text color={look.dim} wrap="wrap">
          {page.note}
        </Text>
      </Box>
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {act('view-party', 'Party', () => update($, view, () => 'party'), { isMain: showing === 'party' })}
        {act(
          'view-map',
          someoneWaits ? 'Map · needs you' : 'Map',
          async () => {
            await update($, view, () => 'map')
            await refreshAppSessions($, true)
          },
          { isMain: showing === 'map' },
        )}
        {act('view-fame', 'Fame', () => update($, view, () => 'fame'), { isMain: showing === 'fame' })}
        {act('view-settings', 'Settings', () => update($, view, () => 'settings'), { isMain: showing === 'settings' })}
      </Box>
    </Box>
  )

  // Settings: every part, each with its own switch, the look, and the panel's
  // sections. Shared by every open session.
  if (showing === 'settings') {
    const browsing = await read($, browseLook)
    const toggle = (key: string, label: string, hint: string, isOn: boolean, onPress: () => Promise<unknown>) => (
      <Box key={`setting:${key}`} {...line} gap={1} justifyContent="space-between">
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Text color={look.text} bold wrap="wrap">
            {label}
          </Text>
          {hint !== '' && (
            <Text color={look.dim} wrap="wrap">
              {hint}
            </Text>
          )}
        </Box>
        <Button key={`switch:${key}`} label={isOn ? 'On' : 'Off'} variant={isOn ? 'primary' : undefined} onPress={onPress} />
      </Box>
    )
    // A section of the Tome: it folds (▸ ▾ at the left, kept like the map's),
    // all but the character select screen at the top.
    const group = (key: string, title: string, glyph: GlyphName, children: RenderElement[]) => {
      const foldKey = `tome-${key}`
      const canFold = key !== 'character'
      const isOpen = !canFold || !foldedHere.has(foldKey)
      return (
        <Box key={`group:${key}`} flexDirection="column" gap={1} paddingX={1} paddingY={1} borderStyle="round" borderColor={look.frame} backgroundColor={look.card}>
          <Box flexDirection="row" gap={1} alignItems="center">
            {canFold && <Button key={`fold:${foldKey}`} label={isOpen ? '▾' : '▸'} onPress={() => toggleFold($, foldKey)} />}
            {heading(`group-${key}`, title, glyph)}
          </Box>
          {isOpen && children}
        </Box>
      )
    }
    const groupGlyph: Record<string, GlyphName> = { 'At the table': 'd20', 'The look': 'mana', 'The DM screen': 'chest' }
    return (
      <Box flexDirection="column" backgroundColor={look.panel} paddingX={1} paddingY={1}>
        {header}
        <Box flexDirection="column" gap={1} marginTop={1}>
          {(() => {
            // The character select screen: browse with the arrows, then choose.
            const shown = browsing ?? prefs.mainLook
            const who = lookName(shown)
            const sheet = sheetOf(shown)
            const isChosen = shown === prefs.mainLook
            const portrait = portraitSvg(shown, 120)
            const place = LOOKS.indexOf(shown) + 1
            return group('character', 'Choose your character', 'party', [
              <Box key="select" flexDirection="row" gap={2} alignItems="center" justifyContent="center">
                <Button key="look-prev" label="◀" onPress={() => update($, browseLook, now => stepLook(now ?? prefs.mainLook, -1))} />
                <Box flexDirection="column" alignItems="center" paddingX={2} paddingY={1} borderStyle="round" borderColor={isChosen ? look.name : look.frame} backgroundColor={look.inset}>
                  {picture(portrait.svg, `${who.name}, ${who.title}`, portrait)}
                </Box>
                <Button key="look-next" label="▶" onPress={() => update($, browseLook, now => stepLook(now ?? prefs.mainLook, 1))} />
              </Box>,
              <Box key="select-name" flexDirection="column" alignItems="center">
                {heading('select-name', isChosen ? prefs.mainName : who.name)}
                <Text color={look.dim}>
                  {who.title} · {place} of {LOOKS.length}
                  {isChosen ? ' · your character' : ''}
                </Text>
              </Box>,
              <Text key="select-tale" color={look.text} italic wrap="wrap">
                {sheet.tale}
              </Text>,
              <Box key="select-scores" flexDirection="row" flexWrap="wrap" gap={2} justifyContent="center">
                {SCORE_NAMES.map((name, at) => {
                  const score = sheet.scores[at] ?? 10
                  return (
                    <Box key={`score:${name}`} flexDirection="column" alignItems="center">
                      <Text color={look.name} bold>
                        {name}
                      </Text>
                      {picture(scoreBarSvg(score, look.name, look.card), `${name} ${score}`, { width: 40, height: 5 })}
                      <Text color={look.text}>
                        {score} ({modifier(score)})
                      </Text>
                    </Box>
                  )
                })}
              </Box>,
              <Box key="select-actions" flexDirection="row" gap={1} justifyContent="center">
                {isChosen ? (
                  <Text color={look.name}>This is your character.</Text>
                ) : (
                  act(
                    'look-choose',
                    'Choose this character',
                    async () => {
                      await changeSettings($, now => ({ ...now, mainLook: shown, mainName: now.mainName === lookName(now.mainLook).name || now.mainName === DEFAULT_MAIN_NAME ? who.name : now.mainName }))
                      await update($, browseLook, () => null)
                    },
                    { isMain: true },
                  )
                )}
              </Box>,
              ...(e.surface === 'mobile'
                ? []
                : [
                    (() => {
                      const { Input } = $.ui.resolve(e)
                      return (
                        <Input
                          key="character-name"
                          label="Name"
                          placeholder={lookName(prefs.mainLook).name}
                          value={prefs.mainName}
                          submitLabel="Rename"
                          onSubmit={text => changeSettings($, now => ({ ...now, mainName: cleanName(text) }))}
                        />
                      )
                    })(),
                  ]),
              <Text key="select-hint" color={look.dim} wrap="wrap">
                Your character is the one you talk to: Claude, as it leads your party. It stands on the strip above the message box.
              </Text>,
            ])
          })()}
          {SWITCH_GROUPS.map(one =>
            group(
              one.title,
              one.title,
              groupGlyph[one.title] ?? 'lever',
              [
                ...one.switches.map(item => toggle(item.key, item.label, item.hint, prefs[item.key], () => setSwitch($, item.key, !prefs[item.key]))),
                ...(one.title === 'At the table'
                  ? [
                      <Box key="volume" {...line} gap={1} justifyContent="space-between">
                        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                          <Text color={look.text} bold>
                            Volume
                          </Text>
                          <Text color={look.dim} wrap="wrap">
                            {prefs.sound ? `${prefs.volume}%: how loud the chimes are, beside everything else.` : 'Sounds are off.'}
                          </Text>
                        </Box>
                        <Box flexDirection="row" flexShrink={0} gap={1} alignItems="center">
                          <Button key="volume-down" label="−" onPress={() => changeSettings($, now => ({ ...now, volume: Math.max(0, now.volume - 10) }))} />
                          {picture(scoreBarSvg(prefs.volume / 5, look.name, look.inset), `Volume ${prefs.volume}%`, { width: 40, height: 5 })}
                          <Button key="volume-up" label="+" onPress={() => changeSettings($, now => ({ ...now, volume: Math.min(100, now.volume + 10) }))} />
                          <Button key="volume-test" label="Test" onPress={() => playTest($)} />
                        </Box>
                      </Box>,
                    ]
                  : []),
                ...(one.title === 'The look'
                  ? [
                      <Box key="heading-fonts" flexDirection="column" gap={1}>
                        <Text color={look.text} bold>
                          Headings
                        </Text>
                        <Box flexDirection="row" flexWrap="wrap" gap={1}>
                          {HEADING_FONTS.map(font => (
                            <Button
                              key={`font:${font.key}`}
                              label={font.label}
                              variant={font.key === prefs.headingFont ? 'primary' : undefined}
                              onPress={() => changeSettings($, now => ({ ...now, headingFont: font.key }))}
                            />
                          ))}
                        </Box>
                      </Box>,
                      <Box key="themes" flexDirection="column" gap={1}>
                        <Text color={look.text} bold>
                          Theme
                        </Text>
                        <Box flexDirection="row" flexWrap="wrap" gap={1}>
                          {THEME_NAMES.map(name => (
                            <Button
                              key={`theme:${name}`}
                              label={name}
                              variant={name === prefs.theme ? 'primary' : undefined}
                              onPress={() => changeSettings($, now => ({ ...now, theme: name }))}
                            />
                          ))}
                        </Box>
                        <Text color={look.dim} wrap="wrap">
                          {prefs.theme}: {THEME_BLURBS[prefs.theme]}
                        </Text>
                      </Box>,
                    ]
                  : []),
              ],
            ),
          )}
          {group('sections', 'On the DM screen', 'party', SECTIONS.map(one => toggle(`section-${one.key}`, one.label, '', shows(one.key), () => toggleSection($, one.key))))}
          {group(
            'credits',
            'Credits and licences',
            'book',
            CREDITS.map(one => (
              <Box key={`credit:${one.what}`} flexDirection="column">
                <Text color={look.text} bold wrap="wrap">
                  {one.what}
                </Text>
                <Text color={look.dim} wrap="wrap">
                  {one.who} · {one.licence}
                </Text>
                <Text color={look.dim} wrap="wrap">
                  {one.changes}
                </Text>
                {e.surface !== 'mobile' && (
                  <Box flexDirection="row" gap={2} flexWrap="wrap">
                    {(() => {
                      const { Link } = $.ui.resolve(e)
                      return [<Link key={`credit-src:${one.what}`} href={one.source} label="Source" />, <Link key={`credit-lic:${one.what}`} href={one.licenceUrl} label="Licence" />]
                    })()}
                  </Box>
                )}
              </Box>
            )).concat([
              <Text key="credit-own" color={look.dim} wrap="wrap">
                {OWN_WORK}
              </Text>,
            ]),
          )}
          <Text color={look.dim} wrap="wrap">
            From the message box: /dm settings, /dm theme underdark, /dm font fantasy, /dm dice off, /dm sound off.
          </Text>
        </Box>
      </Box>
    )
  }

  // The map: this session first, then every other running one, then the ones
  // open in the app's sidebar but not running. Each can be gone to or closed.
  if (showing === 'map') {
    const fromApp = isShowcase ? showcaseSessions(now).open : await read($, appSessions)
    const { Markdown } = $.ui.resolve(e)
    const folded = new Set(await read($, mapFolded))
    const shownRows = await read($, mapShown)
    const isShowingHelp = await read($, showArchiveHelp)
    const sure = await read($, confirming)
    const archived = isShowcase ? showcaseSessions(now).archived : await read($, archivedSessions)
    const kept = new Set(await read($, keptByApp))
    const hereId = hostIdOf(selfLink)
    const isHeld = (id: string | null) => id !== null && (kept.has(id) || fromApp.some(one => one.id === id && one.isPinned))
    const allOthers = uniqueKingdoms(kingdoms, hereId)
    const others = allOthers.filter(k => !isHeld(hostIdOf(k.link)))
    const groups = mapGroups(others)
    const runningIds = new Set([hereId, ...allOthers.map(k => hostIdOf(k.link))].filter((one): one is string => one !== null))
    // Pinned (or kept by the app): their own band, running or not, no Archive.
    const held = fromApp
      .filter(one => one.id !== hereId && isHeld(one.id))
      .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.id.localeCompare(b.id))
    // Recent means within the last quarter hour; a time in the future (a clock
    // out of step) is not taken as recent.
    const isQuietLongEnough = (one: AppSession) => {
      const since = now - one.lastActivityAt
      return one.lastActivityAt === 0 || since < 0 || since >= QUIET_FOR_ASLEEP_MS
    }
    const asleep = fromApp.filter(one => !runningIds.has(one.id) && !isHeld(one.id) && isQuietLongEnough(one))
    // Used in the last quarter hour but not checking in (no mod there, or it
    // has not started yet): idle, never asleep.
    const quietNow = fromApp.filter(one => !runningIds.has(one.id) && !isHeld(one.id) && !isQuietLongEnough(one)).sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.id.localeCompare(b.id))
    const appOf = (k: Kingdom) => fromApp.find(one => one.id === hostIdOf(k.link))
    const names = isShowcase ? {} : await read($, sessionNames)
    const renamingId = await read($, renaming)
    const titleOf = (k: Kingdom) => {
      const id = hostIdOf(k.link)
      return (id === null ? undefined : names[id]) ?? appOf(k)?.title ?? kingdomTitle(k)
    }
    const nameOf = (one: { id: string; title: string }) => names[one.id] ?? one.title
    // The rename field, in place of a row's buttons while it is open.
    const renameField = (id: string, current: string) => {
      if (e.surface === 'mobile') return null
      const { Input } = $.ui.resolve(e)
      return (
        <Box key={`rename:${id}`} {...line} gap={1}>
          <Input key={`rename-input:${id}`} placeholder="A name for this quest" value={current} submitLabel="Save" autoFocus onSubmit={text => nameSession($, id, text)} />
          <Button key={`rename-cancel:${id}`} label="Cancel" onPress={() => update($, renaming, () => null)} />
        </Box>
      )
    }
    const renameButton = (id: string | null) =>
      id === null || e.surface === 'mobile' ? null : <Button key={`rename-open:${id}`} label="Name" onPress={() => update($, renaming, () => id)} />
    const lastActive = (k: Kingdom) => {
      const at = appOf(k)?.lastActivityAt ?? 0
      return at > 0 ? `last active ${agoWords(now - at)}` : 'open'
    }
    // Another folder than this session's is worth saying; the same one is not.
    const place = (k: Kingdom) => (k.name !== selfName ? ` · ${k.name}` : '')

    const closeButtons = (id: string, title: string, isPinned: boolean) => {
      if (e.surface === 'mobile' || id === hereId) return null
      if (isPinned) return <Text color={look.dim}>Pinned</Text>
      return act(`close:${id}`, 'Archive', () => closeSession($, id, title))
    }
    const goButton = (key: string, link: string | undefined, name: string) =>
      isSessionLink(link) && e.surface !== 'mobile' ? (
        act(`realm-go:${key}`, 'Go ↗', () => goToKingdom($, { ...kingdomOf(key, name, lord, [], now), link }))
      ) : null

    // "Close all" for a band, with the same confirm step; pinned ones stay.
    const closeAllButtons = (band: 'idle' | 'asleep', targets: ReadonlyArray<{ id: string; title: string }>) => {
      if (e.surface === 'mobile' || targets.length === 0) return null
      return sure === `archive-${band}` ? (
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {act(`close-all-yes:${band}`, `Really archive ${targets.length}?`, () => closeAll($, band, targets), { isMain: true })}
          <Button key={`close-all-no:${band}`} label="Keep" onPress={() => update($, confirming, () => null)} />
        </Box>
      ) : (
        act(`close-all:${band}`, `Archive all ${targets.length}`, () => askFirst($, `archive-${band}`))
      )
    }
    const closable = (list: ReadonlyArray<{ id: string | null; title: string; isPinned: boolean }>) =>
      list.filter((one): one is { id: string; title: string; isPinned: boolean } => one.id !== null && !one.isPinned && one.id !== hereId)
    const idleTargets = closable([
      ...groups.idle.map(k => ({ id: hostIdOf(k.link), title: titleOf(k), isPinned: appOf(k)?.isPinned === true })),
      ...quietNow.map(one => ({ id: one.id, title: nameOf(one), isPinned: one.isPinned })),
    ])
    const asleepTargets = closable(asleep)

    // A session that needs the person or is busy: a card with what it is doing.
    const card = (k: Kingdom) => {
      const id = hostIdOf(k.link)
      const title = titleOf(k)
      const isWaiting = k.status === 'waiting'
      return (
        <Box
          key={`realm:${k.id}`}
          flexDirection="row"
          gap={1}
          paddingX={1}
          borderStyle="round"
          borderColor={isWaiting ? 'warning' : look.frame}
          backgroundColor={look.card}
        >
          {picture(looped(f => overlordSvg(k.status, f, k.isCompacting)), isTerminal ? (isWaiting ? '!' : '>') : `${title}'s overlord`, REALM_LORD_SIZE)}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Text color={look.name} bold wrap="wrap">
              {wrap(title)}
            </Text>
            <Text color={isWaiting ? look.text : look.dim} bold={isWaiting} wrap="wrap">
              {wrap(kingdomWords(k))}
              {place(k)}
            </Text>
            {k.context && contextBar(`realm:${k.id}`, { context: k.context, compactingSince: k.isCompacting ? k.updatedAt : null }, MINI_BAR_SIZE)}
            {id !== null && renamingId === id ? (
              renameField(id, names[id] ?? '')
            ) : (
              <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
                {renameButton(id)}
                {goButton(k.id, k.link, title)}
                {id !== null && closeButtons(id, title, appOf(k)?.isPinned === true)}
              </Box>
            )}
          </Box>
        </Box>
      )
    }

    // An idle or asleep session: one line, its name, how long it has rested.
    const row = (key: string, title: string, note: string, link: string | undefined, id: string | null, isPinned: boolean) => (
      <Box key={`row:${key}`} {...line} gap={1} justifyContent="space-between" paddingX={1} borderStyle="round" borderColor={look.frame} backgroundColor={look.card}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Text color={look.text} wrap="wrap">
            {wrap(title)}
          </Text>
          <Text color={look.dim} wrap="wrap">
            {note}
          </Text>
        </Box>
        {renamingId !== null && renamingId === hostIdOf(link) ? (
          renameField(renamingId, names[renamingId] ?? '')
        ) : (
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {renameButton(hostIdOf(link))}
            {goButton(key, link, title)}
            {id !== null && closeButtons(id, title, isPinned)}
          </Box>
        )}
      </Box>
    )

    // The first rows of a long section, and a button for the next page.
    const paged = (key: string, rows: RenderElement[]) => {
      const limit = shownRows[key] ?? PAGE_ROWS
      if (rows.length <= limit) return rows
      const left = rows.length - limit
      return [
        ...rows.slice(0, limit),
        <Box key={`more:${key}`} flexDirection="row" gap={1}>
          {act(`more-rows:${key}`, `Show ${Math.min(PAGE_ROWS, left)} more (${left} left)`, () =>
            update($, mapShown, now => ({ ...now, [key]: (now[key] ?? PAGE_ROWS) + PAGE_ROWS })),
          )}
        </Box>,
      ]
    }

    // A section: its heading, how many, a note, its own actions, and Show or
    // Hide. Rows are only drawn while it is open.
    const band = (key: string, title: string, glyph: GlyphName, count: number, hint: string, children: () => RenderElement[], action: RenderElement | null = null) => {
      if (count === 0) return null
      const isOpen = !folded.has(key)
      return (
        <Box key={`band:${key}`} flexDirection="column" gap={1} marginTop={1}>
          <Box {...line} gap={1}>
            <Box flexDirection="row" gap={1} alignItems="center">
              <Button key={`fold:${key}`} label={isOpen ? '▾' : '▸'} onPress={() => toggleFold($, key)} />
              {heading(`band-${key}`, title, glyph)}
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text color={look.dim} wrap="wrap">
                {count} · {hint}
              </Text>
            </Box>
            {action !== null && <Box flexShrink={0}>{action}</Box>}
          </Box>
          {isOpen && paged(key, children())}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" backgroundColor={look.panel} paddingX={1} paddingY={1}>
        {header}
        <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="round" borderColor={look.name} backgroundColor={look.card}>
          <Text color={look.text} bold wrap="wrap">
            {mapSummary(groups, asleep.length, held.length, quietNow.length)}
          </Text>
          <Text color={look.dim} wrap="wrap">
            This session is not listed. Archive the ones you are done with: they move to Archived in the sidebar and can come back.
          </Text>
          <Box flexDirection="row">
            <Button key="archive-help" label={isShowingHelp ? 'ⓘ Hide' : 'ⓘ Archive not working?'} plain onPress={() => update($, showArchiveHelp, now => !now)} />
          </Box>
          {isShowingHelp && (
            <Box key="archive-help-box" flexDirection="column" gap={1} marginTop={1} marginBottom={1} paddingX={1} paddingY={1} backgroundColor={look.inset}>
              <Text color={look.code} wrap="wrap">
                Archive and Restore use the app's own tools. In auto mode the app only approves actions you asked Claude for, and a click here is not one, so it refuses until you allow the two tools once.
              </Text>
              <Text color={look.code} wrap="wrap">
                Add this to ~/.claude/settings.json (a new "permissions" section next to "env"), then start a new session:
              </Text>
              <Markdown key="archive-help-code" text={ARCHIVE_RULE_MARKDOWN} />
              <Text color={look.codeDim} wrap="wrap">
                Archived sessions stay in the sidebar's Archived list and can be reopened. The rule also lets Claude archive sessions without asking.
              </Text>
            </Box>
          )}
        </Box>
        {band('pinned', 'Pinned', 'here', held.length, 'kept by the app, archive from the sidebar', () =>
          held.map(one => {
            const k = allOthers.find(other => hostIdOf(other.link) === one.id)
            const state = k === undefined ? 'asleep' : k.status === 'waiting' ? 'needs you' : k.status === 'working' ? kingdomWords(k) : 'idle'
            const why = one.isPinned ? 'pinned' : 'open in a window'
            return row(`pinned-${one.id}`, nameOf(one), `${why} · ${state}${one.lastActivityAt > 0 ? ` · last active ${agoWords(now - one.lastActivityAt)}` : ''}`, `claude://claude.ai/epitaxy/${one.id}`, null, true)
          }),
        )}
        {band('waiting', 'Needs you', 'waiting', groups.waiting.length, 'waiting on your answer', () => groups.waiting.map(card))}
        {band('working', 'Working', 'party', groups.working.length, 'busy right now', () => groups.working.map(card))}
        {band(
          'idle',
          'Idle',
          'kingdom',
          groups.idle.length + quietNow.length,
          'open and waiting for a prompt',
          () => [
            ...groups.idle.map(k => row(k.id, titleOf(k), `${lastActive(k)}${place(k)}`, k.link, hostIdOf(k.link), appOf(k)?.isPinned === true)),
            ...quietNow.map(one => row(one.id, nameOf(one), `last active ${agoWords(now - one.lastActivityAt)}`, `claude://claude.ai/epitaxy/${one.id}`, one.id, one.isPinned)),
          ],
          closeAllButtons('idle', idleTargets),
        )}
        {band(
          'asleep',
          'Asleep',
          'skull',
          asleep.length,
          'in the sidebar, not running',
          () =>
            asleep.map(one =>
              row(one.id, nameOf(one), one.lastActivityAt > 0 ? `last active ${agoWords(now - one.lastActivityAt)}` : 'not active lately', `claude://claude.ai/epitaxy/${one.id}`, one.id, one.isPinned),
            ),
          closeAllButtons('asleep', asleepTargets),
        )}
        {band('archived', 'Archived', 'chest', archived.length, 'safe to reopen', () =>
          archived.map(one => (
            <Box key={`archived:${one.id}`} {...line} gap={1} justifyContent="space-between" paddingX={1} borderStyle="round" borderColor={look.frame} backgroundColor={look.card}>
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Text color={look.text} wrap="wrap">
                  {wrap(nameOf(one))}
                </Text>
                <Text color={look.dim}>{one.lastActivityAt > 0 ? `last active ${agoWords(now - one.lastActivityAt)}` : 'archived'}</Text>
              </Box>
              {e.surface !== 'mobile' && (
                <Box flexDirection="row" flexWrap="wrap" gap={1}>
                  {goButton(one.id, `claude://claude.ai/epitaxy/${one.id}`, one.title)}
                  {act(`restore:${one.id}`, 'Restore', () => restoreSession($, one))}
                </Box>
              )}
            </Box>
          )),
        )}
      </Box>
    )
  }

  if (showing === 'fame') {
    const opened = new Set(await read($, fameOpen))
    const badges = await read($, earned)
    const sure = await read($, confirming)
    const glowing = await read($, levelUps)
    const ranked = HEROES.map((hero, index) => ({ hero, index, record: records[String(index)] ?? EMPTY_FAME })).sort(
      (a, b) => b.record.xp - a.record.xp || a.index - b.index,
    )
    const fameCard = ({ hero, index, record }: (typeof ranked)[number], place: number) => {
      const level = levelOf(record.xp)
      const next = xpForLevel(level + 1)
      const hasServed = record.xp > 0
      const isOpen = opened.has(index)
      const line = (label: string, value: string) => (
        <Box key={`fame-line:${index}:${label}`} flexDirection="row" justifyContent="space-between" gap={1}>
          <Text color={look.codeDim}>{label}</Text>
          <Text color={look.code}>{value}</Text>
        </Box>
      )
      return (
        <Box
          key={`fame:${index}`}
          flexDirection="row"
          gap={1}
          paddingX={1}
          borderStyle="round"
          borderColor={(place === 0 && hasServed) || (glowing[String(index)] ?? 0) > now ? look.name : look.frame}
          backgroundColor={look.card}
        >
          {picture(heroSvg(index, false, 0, HERO_SIZE), `${hero.name} the ${hero.title}`, HERO_SIZE)}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Box {...line} gap={1} justifyContent="space-between">
              <Box flexShrink={1}>
                <Text color={look.text} wrap="wrap">
                  <Text color={look.name} bold>
                    {hero.name}
                  </Text>
                  <Text color={look.dim}> the {hero.title}</Text>
                </Text>
              </Box>
              <Text color={look.name} bold>
                {(glowing[String(index)] ?? 0) > now ? `Level up! Lv ${level}` : `Lv ${level}`}
              </Text>
            </Box>
            {hasServed ? (
              <Box flexDirection="row" gap={1} alignItems="center">
                {e.surface !== 'terminal' && picture(xpBarSvg(record.xp, 120, look.name, look.inset), `${record.xp} of ${next} XP`, { width: 120, height: 6 })}
                <Text color={look.dim}>
                  {record.xp} / {next} XP
                </Text>
              </Box>
            ) : (
              <Text color={look.dim}>Not yet called on a quest.</Text>
            )}
            {hasServed && (
              <Box flexDirection="row">
                <Button
                  key={`fame-open:${index}`}
                  label={isOpen ? '▾ Record' : '▸ Record'}
                  plain
                  onPress={() => update($, fameOpen, list => (list.includes(index) ? list.filter(one => one !== index) : [...list, index]))}
                />
              </Box>
            )}
            {hasServed && isOpen && (
              <Box key={`fame-record:${index}`} flexDirection="column" marginTop={1} marginBottom={1} paddingX={1} paddingY={1} backgroundColor={look.inset}>
                {line('Quests won', `${record.quests} · 10 to 30 XP each`)}
                {line('Stopped on your word', `${record.stopped} · 2 XP each`)}
                {line('Fell in battle', `${record.fell} · 3 XP each`)}
                {line('Total', `${record.xp} XP`)}
                {line(`To level ${level + 1}`, `${next - record.xp} XP to go`)}
              </Box>
            )}
          </Box>
        </Box>
      )
    }
    const served = ranked.filter(one => one.record.xp > 0)
    const waiting = ranked.filter(one => one.record.xp === 0)
    return (
      <Box flexDirection="column" backgroundColor={look.panel} paddingX={1} paddingY={1}>
        {header}
        <Text color={look.dim} wrap="wrap">
          Every quest earns its hero XP, kept across sessions. A quest won pays most, and a long one pays more.
        </Text>
        <Box flexDirection="column" gap={1} marginTop={1}>
          {foldHead('achievements', 'Achievements', 'fame', `${ACHIEVEMENTS.filter(one => badges[one.id] !== undefined).length} of ${ACHIEVEMENTS.length} earned`)}
          {!foldedHere.has('achievements') && (
            <Box flexDirection="column" gap={1} paddingX={1} paddingY={1} borderStyle="round" borderColor={look.frame} backgroundColor={look.card}>
              {ACHIEVEMENTS.map(one => {
                const at = badges[one.id]
                const has = at !== undefined
                return (
                  <Box key={`badge:${one.id}`} flexDirection="row" gap={1} alignItems="center">
                    {e.surface !== 'terminal' && picture(iconPicture(one.glyph, 22, has ? look.name : look.frame).svg, has ? one.name : `${one.name} (not yet)`, { width: 22, height: 22 })}
                    <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                      <Text color={has ? look.text : look.dim} bold={has} wrap="wrap">
                        {has ? one.name : `${one.name} · not yet`}
                      </Text>
                      <Text color={look.dim} wrap="wrap">
                        {one.how}
                        {has ? ` Earned ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.` : ''}
                      </Text>
                    </Box>
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>
        <Box flexDirection="column" gap={1} marginTop={1}>
          {served.map((one, place) => fameCard(one, place))}
        </Box>
        {waiting.length > 0 && (
          <Box flexDirection="column" gap={1} marginTop={1}>
            {foldHead('fame-waiting', 'In the tavern', 'chest', `${plural(waiting.length, 'hero', 'heroes')} not yet called on a quest`)}
            {!foldedHere.has('fame-waiting') && waiting.map(one => fameCard(one, -1))}
          </Box>
        )}
        <Box flexDirection="row" marginTop={1}>
          {sure === 'reset-fame' ? (
            <Box flexDirection="row" gap={1} alignItems="center">
              {act('forget-yes', 'Really wipe every hero\'s XP?', async () => {
                await update($, confirming, () => null)
                await forgetFame($)
              }, { isMain: true })}
              <Button key="forget-no" label="Keep" onPress={() => update($, confirming, () => null)} />
            </Box>
          ) : (
            <Button key="forget" label="Reset the Hall of Heroes" onPress={() => askFirst($, 'reset-fame')} />
          )}
        </Box>
      </Box>
    )
  }

  const live = list.filter(isActive)
  const leaders = live
    .filter(pal => leaderOf(pal, live) === pal)
    .sort((a, b) => (a.status === 'waiting' ? -1 : 0) - (b.status === 'waiting' ? -1 : 0) || a.startedAt - b.startedAt)
  const followersOf = (leader: Pal) => live.filter(pal => pal !== leader && leaderOf(pal, live) === leader)
  const graves = list.filter(pal => !isActive(pal)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  const chosen = graves.find(pal => pal.id === opened)

  const follower = (pal: Pal) => {
    const hero = heroOf(pal.hero)
    const isWaiting = pal.status === 'waiting'
    return (
      <Box key={`follower:${pal.id}`} flexDirection="row" gap={1}>
        {picture(looped(f => heroSvg(pal.hero, isWaiting, f, FOLLOWER_SIZE, isCompacting(pal))), isTerminal ? '↳' : `${hero.name} the ${hero.title}`, FOLLOWER_SIZE)}
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Text color={look.text} wrap="wrap">
            <Text color={look.name} bold>↳ {hero.name}</Text>
            <Text color={look.dim}> · {wrap(pal.description)}</Text>
          </Text>
          <Text color={look.dim} wrap="wrap">
            {isWaiting
              ? `Needs you: ${wrap(pal.ask ?? 'waiting')}`
              : isCompacting(pal)
                ? `${CONDENSING} · ${elapsed(now - (pal.compactingSince ?? now))}`
                : `${wrap(pal.activity || 'on a quest')} · ${elapsed(now - pal.startedAt)}`}
          </Text>
          {contextBar(pal.id, pal, MINI_BAR_SIZE)}
        </Box>
        <Button key={`stop:${pal.id}`} label="Stop" onPress={() => stop($, pal)} />
      </Box>
    )
  }

  const member = (pal: Pal) => {
    const hero = heroOf(pal.hero)
    const isWaiting = pal.status === 'waiting'
    const level = levelOf(records[String(pal.hero)]?.xp ?? 0)
    const steps = pal.tools > 0 ? ` · ${plural(pal.tools, 'step', 'steps')}` : ''
    const followers = followersOf(pal)
    return (
      <Box
        key={`hero:${pal.id}`}
        flexDirection="row"
        gap={1}
        paddingX={1}
        borderStyle="round"
        borderColor={isWaiting ? 'warning' : (levelGlow[String(pal.hero)] ?? 0) > now ? look.name : borderOf(pal)}
        backgroundColor={look.card}
      >
        {picture(
          looped(f => heroSvg(pal.hero, isWaiting, f, PARTY_HERO_SIZE, isCompacting(pal))),
          isTerminal ? (isWaiting ? '!' : isCompacting(pal) ? '~' : '>') : `${hero.name} the ${hero.title}`,
          PARTY_HERO_SIZE,
        )}
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Box {...line} justifyContent="space-between" gap={1}>
            <Text color={look.text} wrap="wrap">
              <Text color={look.name} bold>{hero.name}</Text>
              <Text color={look.dim}>
                {' '}the {hero.title} · Lv {level}
              </Text>
            </Text>
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              <Button key={`stop:${pal.id}`} label="Stop" onPress={() => stop($, pal)} />
            </Box>
          </Box>
          <Text color={look.text} wrap="wrap">{wrap(pal.description)}</Text>
          <Text color={look.dim} wrap="wrap">
            {isWaiting
              ? `Needs you · ${elapsed(now - pal.startedAt)}`
              : isCompacting(pal)
                ? `${CONDENSING} · ${elapsed(now - (pal.compactingSince ?? now))}`
                : `${wrap(pal.activity || 'on a quest')} · ${elapsed(now - pal.startedAt)}`}
            {steps}
          </Text>
          {contextBar(pal.id, pal, BAR_SIZE)}
          {pal.ask !== null && <Text color={look.text} wrap="wrap">Asks: {wrap(pal.ask)}</Text>}
          {followers.length > 0 && (
            <Box flexDirection="column" gap={1} marginTop={1}>
              {followers.map(follower)}
            </Box>
          )}
        </Box>
      </Box>
    )
  }

  const grave = (pal: Pal) => {
    const hero = heroOf(pal.hero)
    const isOpen = pal.id === opened
    return (
      // The stone being read stands in a gold frame, its name marked ▾.
      <Box
        key={`grave:${pal.id}`}
        flexDirection="column"
        alignItems="center"
        paddingX={1}
        borderStyle="round"
        borderColor={isOpen ? look.name : look.card}
        backgroundColor={isOpen ? look.inset : look.card}
      >
        {picture(graveSvg(ENDING[pal.status]), isTerminal ? '+' : `${hero.name}'s grave: ${OUTCOME[pal.status]}`, GRAVE_SIZE)}
        <Button
          key={`visit:${pal.id}`}
          label={isOpen ? `▾ ${hero.name}` : hero.name}
          variant={isOpen ? 'primary' : undefined}
          onPress={() => update($, openGrave, current => (current === pal.id ? null : pal.id))}
        />
      </Box>
    )
  }

  const visit = (pal: Pal) => {
    const hero = heroOf(pal.hero)
    const took = elapsed((pal.endedAt ?? now) - pal.startedAt)
    const cost = spend(pal.usage)
    return (
      <Box key="visit" flexDirection="column" borderStyle="round" borderColor={look.name} backgroundColor={look.inset} paddingX={1} marginTop={1}>
        <Text color={look.name} bold wrap="wrap">
          Here lies {hero.name} the {hero.title}
        </Text>
        <Text color={look.text} wrap="wrap">{wrap(pal.description)}</Text>
        <Text color={look.dim} wrap="wrap">
          {OUTCOME[pal.status]} after {took}
          {pal.tools > 0 ? ` and ${plural(pal.tools, 'step', 'steps')}` : ''} · {pal.type}
          {pal.xp ? ` · +${pal.xp} XP` : ''}
        </Text>
        {cost !== '' && (
          <Text color={look.dim} wrap="wrap">
            Spent {cost}
            {pal.usage?.model ? ` on ${pal.usage.model}` : ''}
          </Text>
        )}
        <Text color={look.text} italic wrap="wrap">
          “{pal.epitaph}”
        </Text>
        {pal.lastWords !== '' && <Text color={look.text} wrap="wrap">Last words: {wrap(pal.lastWords)}</Text>}
        <Box flexDirection="row" gap={1} marginTop={1}>
          <Button key="close-visit" label="Close" onPress={() => update($, openGrave, () => null)} />
          <Button
            key="bury"
            label="Lay to rest"
            onPress={async () => {
              await update($, openGrave, () => null)
              await update($, pals, all => all.filter(one => one.id !== pal.id))
            }}
          />
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" backgroundColor={look.panel} paddingX={1} paddingY={1}>
      {header}
      <Box flexDirection="column" gap={1} marginTop={1}>
        {shows('party') && leaders.length === 0 && (
          <Text color={look.dim} wrap="wrap">
            The tavern is quiet. When Claude sends a helper off on a task, a hero sets out from here.
          </Text>
        )}
        {shows('party') && leaders.map(member)}
      </Box>
      {campTasks.length > 0 && (
        <Box flexDirection="column" marginTop={2}>
          {foldHead('camp', 'The camp', 'campfire', `${plural(campTasks.filter(isRunningWork).length, 'at work', 'at work')} in the background`)}
          {!foldedHere.has('camp') && (
          <Box flexDirection="column" gap={1} marginTop={1}>
            {campTasks.map(one => {
              const canStop = isRunningWork(one)
              const ended = one.status === 'done' ? '#22C55E' : one.status === 'failed' ? '#DC2626' : look.frame
              return (
                <Box
                  key={`camp:${one.id}`}
                  {...line}
                  gap={1}
                  justifyContent="space-between"
                  paddingX={1}
                  borderStyle="round"
                  borderColor={one.status === 'running' ? look.frame : ended}
                  backgroundColor={look.card}
                >
                  <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                    <Box flexDirection="row" gap={1} alignItems="center">
                    {!isTerminal && picture(iconSvg(campIcon(one)), one.status, { width: ICON_SIZE, height: ICON_SIZE })}
                    <Text color={look.text} wrap="wrap">
                      <Text color={look.name} bold>
                        {wrap(one.title)}
                      </Text>
                      <Text color={look.dim}>
                        {one.detail !== '' && one.detail !== one.title ? ` · ${wrap(one.detail)}` : ''}
                      </Text>
                    </Text>
                    </Box>
                    <Text color={look.dim} wrap="wrap">
                      {wrap(campState(one, now, elapsed))}
                      {one.agentId ? ` · started by ${heroOf(list.find(pal => pal.id === one.agentId)?.hero ?? 0).name}` : ''}
                    </Text>
                    {one.lastLine !== '' && (
                      <Text color={look.text} wrap="wrap">
                        › {wrap(one.lastLine)}
                      </Text>
                    )}
                  </Box>
                  {canStop && <Button key={`camp-stop:${one.id}`} label="Stop" onPress={() => stopCampTask($, one)} />}
                </Box>
              )
            })}
          </Box>
          )}
        </Box>
      )}
      {shows('quests') && questLog.length > 0 && (
        <Box flexDirection="column" marginTop={2}>
          {foldHead('quests', 'Quest log', 'scroll', `the last ${Math.min(questLog.length, SHOWN_QUESTS)}`)}
          {!foldedHere.has('quests') && (
          <Box flexDirection="column" gap={1} marginTop={1}>
            {questLog
              .slice(-SHOWN_QUESTS)
              .reverse()
              .map(q => {
                const gain = questGain(q)
                return (
                  <Box key={`quest:${q.turn}:${q.startedAt}`} flexDirection="column" paddingX={1} borderStyle="round" borderColor={look.frame} backgroundColor={look.card}>
                    <Text color={look.text} wrap="wrap">
                      <Text color={look.name} bold>
                        Quest {q.turn}
                      </Text>
                      <Text color={look.dim}>{q.quest === '' ? '' : ` · ${wrap(q.quest)}`}</Text>
                    </Text>
                    {isTerminal ? (
                      <Text color={look.text} wrap="wrap">
                        {questTally(q)}
                      </Text>
                    ) : (
                      <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
                        {questParts(q).length === 0 && <Text color={look.text}>Words only, no tools</Text>}
                        {questParts(q).map(part => (
                          <Box key={`tally:${q.turn}:${part.item}`} flexDirection="row" gap={1} alignItems="center">
                            {picture(iconSvg(part.item), part.text, { width: ICON_SIZE, height: ICON_SIZE })}
                            <Text color={look.text}>{part.text}</Text>
                          </Box>
                        ))}
                      </Box>
                    )}
                    {q.edits.length > 0 && (
                      <Text color={look.dim} wrap="wrap">
                        Forged {wrap(listed(q.edits))}
                      </Text>
                    )}
                    {q.commands.length > 0 && (
                      <Text color={look.dim} wrap="wrap">
                        Cast {wrap(listed(q.commands))}
                      </Text>
                    )}
                    <Text color={look.dim} wrap="wrap">
                      {elapsed(q.durationMs)}
                      {gain === '' ? '' : ` · ${gain}`}
                    </Text>
                  </Box>
                )
              })}
          </Box>
          )}
        </Box>
      )}
      {shows('graveyard') && graves.length > 0 && (
        <Box flexDirection="column" marginTop={2}>
          {foldHead(
            'graveyard',
            'Graveyard',
            'graveyard',
            plural(graves.length, 'stone', 'stones'),
            <Button
              key="clear"
              label="Clear graveyard"
              onPress={async () => {
                await update($, openGrave, () => null)
                await update($, pals, all => all.filter(isActive))
              }}
            />,
          )}
          {!foldedHere.has('graveyard') && (
            <Box flexDirection="column" borderStyle="round" borderColor="error" backgroundColor={look.card} paddingX={1} marginTop={1}>
              <Text color={look.dim} wrap="wrap">
                Click a name to read its stone.
              </Text>
              <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
                {graves.map(grave)}
              </Box>
            </Box>
          )}
          {!foldedHere.has('graveyard') && chosen !== undefined && visit(chosen)}
        </Box>
      )}
    </Box>
  )
}

// --- hooks -------------------------------------------------------------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dm', description: 'Open the DM screen: /dm, /dm settings, /dm name <name>, /dm theme <name>, /dm <part> on|off, /dm demo' })
    const home = await $.env.get('HOME').catch(() => undefined)
    homeDir = typeof home === 'string' && home.startsWith('/') ? home.replace(/\/+$/, '') : null
    dataDir = dataDirFrom(home, await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined))
    await adoptEarlierFolder($).catch(() => undefined)
    await restore($)
    await autoOpen($)
    // After a reload the panel may already be open: the strip's toggle asks.
    const panes = await $.ui.panes().catch(() => [])
    if (panes.some(pane => pane.id === PANE)) await update($, isPaneOpen, () => true)
    sessionId = await $.session.id().catch(() => '')
    selfLink = sessionLink(await $.env.get('CLAUDE_CODE_HOST_SESSION_ID').catch(() => undefined))
    sessionCwd = e.cwd
    tasksDir = undefined
    // One check-in file per app session (its host id), so a reload or a
    // /clear reuses it rather than leaving another behind.
    selfId = isBackgroundFolder(e.cwd) ? '' : (hostIdOf(selfLink) ?? sessionId)
    selfName = folderName(e.cwd)
    await realmTick($).catch(() => undefined)
    await checkAppearance($).catch(() => undefined)
    $.clock.every(APPEARANCE_MS, () => {
      checkAppearance($).catch(() => undefined)
    })
    // Every 5 s: each tick redraws the panel, so no more often than the clocks need.
    $.clock.every(5000, () => {
      sync($).catch(() => undefined)
      campTick($).catch(() => undefined)
      realmTick($).catch(() => undefined)
    })
    // The heroes' walk: a redraw per frame, only while someone is on a quest
    // or the main thread is at work.
    $.clock.every(FRAME_MS, () => {
      Promise.all([read($, pals), read($, overlord)])
        .then(([list, lord]) => (list.some(isActive) || lord.status !== 'idle' || isCompacting(lord) ? update($, frameTick, n => n + 1) : undefined))
        .catch(() => undefined)
    })

    return next(e)
  })

  // /dm: the panel, its settings, or one switch straight from the message box.
  on('command.run', { command: 'dm' }, async ($, e) => {
    const asked = readRealmAsk(e.args)
    if (asked.kind === 'open' || asked.kind === 'settings' || asked.kind === 'demo') {
      await update($, view, () => (asked.kind === 'settings' ? 'settings' : 'party'))
      const shown = await $.ui.open({ id: PANE, title: TITLE, focus: true })
      if (asked.kind === 'demo') {
        await demo($).catch(() => undefined)
        return { text: 'The demo: context bars at every level, a hero and the Overlord compacting. It tidies itself away in 40 seconds.' }
      }
      if (!shown.isPlaced) return { text: `The DM screen needs a wider window. Settings now: ${settingsWords(await read($, settings))}.` }
      return { text: asked.kind === 'settings' ? "Opened the DM's Tome (settings)." : 'Opened the DM screen.' }
    }
    if (asked.kind === 'showcase') {
      const until = (await $.clock.now()) + SHOWCASE_MS
      await update($, showcaseUntil, () => until)
      await update($, view, () => 'party')
      await $.ui.open({ id: PANE, title: TITLE, focus: true })
      await demo($, SHOWCASE_MS).catch(() => undefined)
      $.clock.after(SHOWCASE_MS, () => {
        update($, showcaseUntil, () => 0).catch(() => undefined)
      })
      return { text: 'Showcase: for 5 minutes every page shows made-up heroes, sessions and quests, so you can take pictures safely. Your own things come back after.' }
    }
    // What a bug report needs, shown to the person only (no tool for the model).
    if (asked.kind === 'status') {
      return {
        text: `${settingsWords(await read($, settings))}. Map: ${lastListReport}; session list ${listDecision ?? 'not checked'}. Panel width: ${lastPaneColumns} columns (stacks below ${NARROW_COLUMNS}).${lastRefusal === '' ? '' : ` Last refusal: ${lastRefusal}`}`,
      }
    }
    if (asked.kind === 'theme') {
      const name = asked.theme
      if (!isThemeName(name)) return { text: `Themes: ${THEME_NAMES.join(', ')}. You're in ${(await read($, settings)).theme}. Use /dm theme <name>.` }
      await changeSettings($, now => ({ ...now, theme: name }))
      return { text: `The table now wears ${name}, in every open session.` }
    }
    if (asked.kind === 'volume') {
      if (asked.volume === null) return { text: `Volume is ${(await read($, settings)).volume}%. Use /dm volume 0 to 100.` }
      const volume = Math.round(asked.volume / 10) * 10
      await changeSettings($, now => ({ ...now, volume }))
      return { text: `Volume: ${volume}%.` }
    }
    if (asked.kind === 'name') {
      if (asked.name.trim() === '') return { text: `Your character is ${(await read($, settings)).mainName}. Use /dm name <name> to rename it.` }
      const name = cleanName(asked.name)
      await changeSettings($, now => ({ ...now, mainName: name }))
      return { text: `Your character is now ${name}.` }
    }
    if (asked.kind === 'font') {
      const font = HEADING_FONTS.find(one => one.key === asked.font)
      if (font === undefined) return { text: `Headings: ${HEADING_FONTS.map(one => one.key).join(', ')}. Use /dm font <name>.` }
      await changeSettings($, now => ({ ...now, headingFont: font.key }))
      return { text: `Headings: ${font.label}.` }
    }
    if (asked.kind === 'switch') {
      await setSwitch($, asked.key, asked.on)
      return { text: `${switchLabel(asked.key)}: ${asked.on ? 'on' : 'off'}, in every open session.` }
    }

    return { text: 'Use /dm, /dm settings, /dm name <name>, /dm theme <name>, /dm font <fantasy|app>, or /dm <hud|rows|dice|sound|panel> on|off.' }
  })



  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.agentId !== undefined) {
      await addPal($, ran.agentId, e.description, e.subagentType, e.parentAgentId).catch(() => undefined)
    }

    return ran
  }).catch(($, e, next) => next(e))

  // Every model request, main or subagent: the response's usage fills that
  // agent's context bar. The stream passes through untouched.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (result.usage) await noteContext($, e.agentId, result.usage, result.usage.model || e.model).catch(() => undefined)
    return result
  })

  // Compaction, of the main conversation or a subagent's own: the hero holds
  // the scroll from the moment it starts until it stands or is skipped. A
  // precompute (worked out ahead, installs nothing) is not shown.
  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute') return next(e)
    const now = await $.clock.now()
    await compacting($, e.agentId, now).catch(() => undefined)
    let result: SessionCompactResult | undefined
    try {
      result = await next(e)
      return result
    } finally {
      await compacting($, e.agentId, null, result).catch(() => undefined)
    }
  }).catch(($, e, next) => next(e))

  // A background task's notice that it finished: done, failed or stopped.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'task-notification') {
      const notice = parseNotification(e.text)
      if (notice !== null) {
        const now = await $.clock.now()
        const known = (await read($, camp)).some(one => one.id === notice.id && one.status === 'running')
        await changeCamp($, tasks => applyChange(tasks, { end: notice.id, status: notice.status, summary: notice.summary }, now)).catch(() => undefined)
        if (known) await chime($, notice.status === 'failed' ? 'error' : 'done')
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The end of each turn: the engine's own list of what is still running and
  // what is scheduled, so nothing is missed or left burning on the map.
  on('classic.Stop', async ($, e, next) => {
    const running = e.background_tasks
    const crons = e.session_crons
    if (Array.isArray(running) && Array.isArray(crons)) {
      const now = await $.clock.now()
      await changeCamp($, tasks => reconcile(tasks, running, crons, now)).catch(() => undefined)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // /clear keeps the process (and this app session) going under a new id.
    if (e.reason === 'clear') {
      sessionId = await $.session.id().catch(() => sessionId)
      tasksDir = undefined
    } else {
      await leaveRealm($).catch(() => undefined)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await overlordStarts($).catch(() => undefined)
    const quest = firstLine(e.text, 80)
    if (quest !== '' && !quest.startsWith('/')) await changeOverlord($, lord => ({ ...lord, quest, opening: lord.opening || quest })).catch(() => null)
    await questBegins($, e.text).catch(() => undefined)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // The map's own calls to the app's session tools are not the agents' work.
    if (e.tool.startsWith('mcp__ccd_session_mgmt__')) return next(e)
    const agentId = e.agentId
    const activity = describeCall(e.tool, e as unknown as Record<string, unknown>)
    if (agentId === undefined) {
      await overlordActs($, activity).catch(() => undefined)
      const ran = await next(e)
      await noteCamp($, e.tool, e, ran as { result?: unknown }, agentId).catch(() => undefined)
      await overlordResumes($).catch(() => undefined)
      if (currentQuest !== null) currentQuest = withCall(currentQuest, e.tool, e, (ran as { isError?: boolean }).isError === true)
      return ran
    }
    await change($, agentId, pal => (isActive(pal) ? { ...pal, activity, tools: pal.tools + 1 } : null)).catch(() => null)
    const ran = await next(e)
    await noteCamp($, e.tool, e, ran as { result?: unknown }, agentId).catch(() => undefined)
    await resume($, agentId).catch(() => undefined)

    return ran
  }).catch(($, e, next) => next(e))

  // The app's own notices: a helper or the main thread waiting on a
  // permission prompt shows as asking. The mod never answers a permission
  // request; that is always the app's own prompt.
  on('classic.Notification', async ($, e, next) => {
    const agentId = e.agent_id
    if (agentId !== undefined) await ask($, agentId, () => e.message).catch(() => undefined)
    else if (e.notification_type === 'permission_prompt') {
      if (currentQuest !== null) currentQuest = { ...currentQuest, asked: currentQuest.asked + 1 }
      await overlordAsks($, e.message).catch(() => undefined)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId === undefined) {
      await overlordRests($, firstLine(e.answer, 160), e.durationMs, e.usage).catch(() => undefined)
      await questEnds($, e.durationMs).catch(() => undefined)
    } else {
      if (e.usage !== undefined) await addUsage($, agentId, e.usage).catch(() => undefined)
      const said = firstLine(e.answer, 160)
      if (e.reason === 'aborted') await finish($, agentId, 'stopped', said)
      else if (e.reason === 'answer') await finish($, agentId, 'done', said)
      else await finish($, agentId, 'failed', said || 'The model call failed.')
    }

    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await finish($, e.agent_id, 'done', firstLine(e.last_assistant_message ?? '', 160)).catch(() => undefined)

    return next(e)
  })

  // The strip's toggle follows the panel, however it was opened or closed.
  on('ui.open', async ($, e, next) => {
    const ran = await next(e)
    if (e.id === PANE) await update($, isPaneOpen, () => true).catch(() => undefined)
    return ran
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, isPaneOpen, () => false).catch(() => undefined)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, settings)).hud) return next(e)

    return drawBand($, e)
  })

  // A tool's row: a stone row with the verb in torch orange and the plain
  // detail beside it, and a button to see the call in full and what came back.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const chosen = await read($, settings)
    if (!chosen.rows) return next(e)
    const { tool_use_id: id, tool, input, output, isRunning, isErrored, isInterrupted } = e.props
    const words = toolWords(tool, input, { isRunning, isErrored, isInterrupted })
    const isOpen = (await read($, opened)).includes(id)
    const details = isOpen ? detailsMarkdown(tool, input, output) : ''
    const look = await lookNow($, chosen.theme)
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    // The desktop draws the pixel item; the terminal keeps the emoji.
    const item = () => {
      if (e.surface === 'terminal') return null
      const { Svg } = $.ui.resolve(e)
      return <Svg source={iconSvg(words.item)} alt={words.verb} width={ICON_SIZE} height={ICON_SIZE} />
    }

    return (
      <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor={look.frame} backgroundColor={look.panel}>
        <Box flexDirection="row" gap={1} justifyContent="space-between" alignItems="center">
          {item()}
          <Box flexGrow={1} flexShrink={1}>
            <Text color={look.text} wrap="wrap">
              {e.surface === 'terminal' ? `${words.icon} ` : ''}
              <Text color={look.name} bold>
                {words.verb}
              </Text>
              {words.detail === '' ? '' : ` ${words.detail}`}
            </Text>
          </Box>
          <Button
            key={`row:${id}`}
            label={isOpen ? '▾ Hide' : '▸ Details'}
            plain
            onPress={() => update($, opened, ids => (ids.includes(id) ? ids.filter(one => one !== id) : [...ids.slice(-49), id]))}
          />
        </Box>
        {isOpen && (
          // The details sit in their own dark inset, like a code block, drawn
          // as markdown so the app highlights commands, diffs and code.
          <Box flexDirection="column" gap={1} marginTop={1} marginBottom={1} paddingX={1} paddingY={1} backgroundColor={look.inset}>
            <Markdown key={`details:${id}`} text={details} />
            {isRunning && <Text color={look.codeDim}>Still running…</Text>}
          </Box>
        )}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // The working row keeps the app's own timer and mark: only its words change.
  // A d20 tumbles beside it on the desktop, a fresh roll each frame.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const chosen = await read($, settings)
    if (!chosen.rows) return next(e)
    const { word, message, mode } = e.props
    const line = await next({ ...e, props: { ...e.props, word: spinnerWords(word, null, mode), message } })
    if (!chosen.dice || e.surface !== 'desktop') return line
    const { Box, Svg } = $.ui.resolve(e)
    const look = await lookNow($, chosen.theme)
    await read($, frameTick)
    const frame = Math.floor((await $.clock.now()) / FRAME_MS)
    const die = diePicture(frame, DIE_SIZE, look.name, look.inset, look.code)

    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Svg source={die.svg} alt="A d20, rolling" width={die.width} height={die.height} />
        {line}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!(await read($, settings)).rows) return next(e)

    return next({ ...e, props: { ...e.props, hint: hintWords(e.props.hint) } })
  }).catch(($, e, next) => next(e))


  on('ui.render', { component: 'Pane', requestId: 'dungeon-master' }, ($, e) => drawPane($, e))
}
