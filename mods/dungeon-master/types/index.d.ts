export type PalStatus = 'working' | 'waiting' | 'done' | 'failed' | 'stopped'

// What an agent's turns cost, summed; `cost` in US dollars at API rates,
// null when the model is not in the price table.
export type Usage = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number | null
  model: string
}

// How full an agent's context window is, from its last model response.
// `tokens` is null until the first response, and again right after compacting
// when the engine did not say how much was left.
export type Context = {
  tokens: number | null
  window: number
  model: string
}

export type Pal = {
  id: string
  description: string
  type: string
  hero: number
  // Index into the border palette; absent on pals saved before colours existed.
  color?: number
  // The agent that spawned this one, when another subagent did.
  parentId?: string | null
  status: PalStatus
  activity: string
  tools: number
  startedAt: number
  endedAt: number | null
  ask: string | null
  // True while the card offers Allow / Deny for the permission it asks.
  canDecide?: boolean
  epitaph: string
  lastWords: string
  usage?: Usage | null
  // XP this quest earned its hero, once it ended.
  xp?: number
  // When this agent began compacting its conversation; absent or null when it is not.
  compactingSince?: number | null
  context?: Context | null
}

// One hero's lifetime record, kept across sessions.
export type Fame = {
  xp: number
  quests: number
  fell: number
  stopped: number
  tokens: number
  cost: number
}

// The panel's pages: the party, the map of open sessions, the hall of fame
// and the settings.
export type View = 'party' | 'map' | 'fame' | 'settings'

// The panel's sections the person can switch off in Settings.
export type Section = 'party' | 'camp' | 'quests' | 'graveyard' | 'stamina'

// Every part of the realm can be switched off on its own (hooks/settings.ts
// holds the defaults and the reader).
export type Settings = {
  panelAtStart: boolean
  hud: boolean
  sound: boolean
  rows: boolean
  dice: boolean
  // How loud the sounds are, 0 to 100 (Sounds off silences them all).
  volume: number
  headingFont: HeadingFont
  // The main thread's character: its name, and its look (-1 the Overlord
  // demon, else a party hero's index).
  mainName: string
  mainLook: number
  theme: ThemeName
  hidden: Section[]
}

// A session as the desktop app lists it (its own title, when it last did
// anything), so the map can name every session and offer to close it.
export type AppSession = {
  id: string
  title: string
  lastActivityAt: number
  isPinned: boolean
  isArchived: boolean
}

// Headings: Cinzel Decorative drawn as pictures, or the app's own type.
export type HeadingFont = 'fantasy' | 'app'

// The tool rows the person has opened to see the call and its result, by id.
export type OpenedRows = string[]

// One piece of background work in the camp: a shell command left running,
// a monitor, a workflow, a scheduled wake-up or cron. Subagents are heroes.
export type CampKind = 'shell' | 'monitor' | 'workflow' | 'wakeup' | 'cron'
export type CampStatus = 'running' | 'done' | 'failed' | 'stopped'

export type CampTask = {
  id: string
  kind: CampKind
  // What it is, in words: its description, else its command.
  title: string
  // The command, the schedule or the workflow name.
  detail: string
  status: CampStatus
  startedAt: number
  endedAt: number | null
  // When a wake-up or cron next fires; epoch milliseconds.
  wakesAt?: number
  // The newest line of its output, read every few seconds.
  lastLine: string
  // How the notification summed it up when it finished.
  summary?: string
  // The subagent that started it; absent for the main thread.
  agentId?: string
}

// One usage-limit window as the engine reports it: the 5-hour or weekly
// plan window (or a gateway's spend limit), shown as a stamina bar.
export type Stamina = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

// One finished turn of the main thread, as the quest log shows it.
export type Quest = {
  turn: number
  quest: string
  startedAt: number
  durationMs: number
  reads: string[]
  edits: string[]
  commands: string[]
  searches: number
  ravens: number
  heroes: number
  asked: number
  failed: number
  // Context tokens gained over the turn; null when either end was unknown.
  contextGained: number | null
}

// The realm's looks, kept in ~/.claude/realm/settings.json.
export type ThemeName = 'dungeon' | 'tavern' | 'underdark' | 'dragonfire' | 'frostkeep' | 'feywild' | 'arcane' | 'tome' | 'celestial' | 'wildwood'

// One open session, as it checks in to ~/.claude/realm/sessions/<id>.json
// every few seconds, so every session's panel can show all of them.
export type Kingdom = {
  id: string
  // The session's folder name.
  name: string
  // The first line of its latest prompt.
  quest: string
  // The first line of its opening prompt: what the session is about.
  opening?: string
  status: 'idle' | 'working' | 'waiting'
  activity: string
  context: Context | null
  isCompacting: boolean
  party: number
  // Background work running in that session's camp.
  camp?: number
  // The app's own link to the session (claude://…/epitaxy/local_…): a click
  // switches the desktop app to it.
  link?: string
  updatedAt: number
  hasEnded?: boolean
}

// The main thread of the session, drawn as the overlord above the party.
export type Overlord = {
  status: 'idle' | 'working' | 'waiting'
  activity: string
  tools: number
  turns: number
  startedAt: number
  ask: string | null
  lastWords: string
  usage: Usage | null
  // The first line of the latest prompt.
  quest?: string
  // The first line of the session's opening prompt: what it is about.
  opening?: string
  // When the main conversation began compacting; absent or null when it is not.
  compactingSince?: number | null
  context?: Context | null
}

// Named apart: inside the module block, `Settings` is the engine's own type.
export type RealmSettings = Settings

declare module 'claude-code' {
  interface PluginState {
    'dungeon-master': {
      pals: Pal[]
      tick: number
      frameTick: number
      isPaneOpen: boolean
      browseLook: number | null
      earned: Record<string, number>
      critical: { face: number; who: string; until: number } | null
      levelUps: Record<string, number>
      sessionNames: Record<string, string>
      renaming: string | null
      confirming: string | null
      isLightApp: boolean
      hasAutoOpened: boolean
      openGrave: string | null
      view: View
      fame: Record<string, Fame>
      overlord: Overlord
      prefs: RealmSettings
      realm: Kingdom[]
      stamina: Stamina[]
      quests: Quest[]
      camp: CampTask[]
      opened: OpenedRows
      mapFolded: string[]
      mapShown: Record<string, number>
      fameOpen: number[]
      showArchiveHelp: boolean
      keptByApp: string[]
      archivedSessions: AppSession[]
      appSessions: AppSession[]
    }
  }
}
