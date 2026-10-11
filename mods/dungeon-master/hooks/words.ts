// The realm's words and colours: pure, so every rule is tested on its own.
// An RPG verb with the plain detail always shown, so nobody has to guess.

import type { ItemName } from './items'

// `icon` is the emoji the terminal shows; `item` the pixel item the desktop draws.
export type Words = { icon: string; verb: string; detail: string; item: ItemName }

type Verb = { icon: string; item: ItemName; running: string; done: string }

const VERBS: Record<string, Verb> = {
  read: { item: 'chest', icon: '›', running: 'Studying', done: 'Studied' },
  forge: { item: 'hammer', icon: '›', running: 'Forging', done: 'Forged' },
  cast: { item: 'staff', icon: '›', running: 'Casting', done: 'Cast' },
  scout: { item: 'bow', icon: '›', running: 'Scouting', done: 'Scouted' },
  raven: { item: 'arrow', icon: '›', running: 'Sending a raven', done: 'Raven returned' },
  hero: { item: 'sword', icon: '›', running: 'Sending a hero', done: 'Hero sent' },
  quest: { item: 'coin', icon: '›', running: 'Updating the quest log', done: 'Quest log updated' },
  other: { item: 'flask', icon: '›', running: 'Using', done: 'Used' },
}

const KIND: Record<string, keyof typeof VERBS> = {
  Read: 'read',
  NotebookRead: 'read',
  Edit: 'forge',
  MultiEdit: 'forge',
  Write: 'forge',
  NotebookEdit: 'forge',
  Bash: 'cast',
  Grep: 'scout',
  Glob: 'scout',
  LS: 'scout',
  WebFetch: 'raven',
  WebSearch: 'raven',
  Agent: 'hero',
  Task: 'hero',
  TodoWrite: 'quest',
}

const clip = (text: string, max = 70) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const baseName = (path: string) => path.split('/').pop() ?? path

// "mcp__github__create_pull_request" → "create pull request (github)".
export function toolName(tool: string): string {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (mcp) return `${(mcp[2] ?? '').replace(/_/g, ' ')} (${mcp[1] ?? ''})`

  return tool
}

// The plain detail of a call: the file, the command, the search, the page.
export function detailOf(tool: string, input: unknown): string {
  const args = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  switch (KIND[tool]) {
    case 'read':
    case 'forge':
      return baseName(text(args.file_path) || text(args.notebook_path))
    case 'cast':
      return clip(text(args.description) || (text(args.command).split('\n')[0] ?? ''))
    case 'scout':
      return clip(text(args.pattern) || text(args.path))
    case 'raven': {
      const host = /^https?:\/\/([^/]+)/.exec(text(args.url))?.[1]
      return clip(host ?? text(args.query))
    }
    case 'hero':
      return clip(text(args.description))
    case 'quest':
      return ''
    default:
      return toolName(tool)
  }
}

export type CallState = { isRunning: boolean; isErrored: boolean; isInterrupted: boolean }

export function toolWords(tool: string, input: unknown, state: CallState): Words {
  const verb = VERBS[KIND[tool] ?? 'other'] ?? (VERBS.other as Verb)
  const detail = detailOf(tool, input)
  if (state.isInterrupted) return { icon: '×', item: 'heart', verb: 'Called back', detail: `${verb.running.toLowerCase()} ${detail}`.trim() }
  if (state.isErrored) return { icon: '!', item: 'skull', verb: 'Failed', detail: `${verb.running.toLowerCase()} ${detail}`.trim() }

  return { icon: verb.icon, item: verb.item, verb: state.isRunning ? verb.running : verb.done, detail }
}

// What an opened row shows: the call in full, then what came back, clipped
// so one huge result cannot flood the chat.
const MAX_LINES = 40
const MAX_CHARS = 4000

export function clipLines(body: string): string {
  const trimmed = body.length > MAX_CHARS ? body.slice(0, MAX_CHARS) : body
  const lines = trimmed.replace(/\s+$/, '').split('\n')
  const total = body.replace(/\s+$/, '').split('\n').length
  const shown = lines.slice(0, MAX_LINES).join('\n')
  const hidden = total - Math.min(lines.length, MAX_LINES)

  return hidden > 0 || body.length > MAX_CHARS ? `${shown}\n… ${hidden > 0 ? `${hidden} more lines` : 'more'}` : shown
}

export function callOf(tool: string, input: unknown): string {
  const args = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  switch (KIND[tool]) {
    case 'read':
    case 'forge':
      return text(args.file_path) || text(args.notebook_path)
    case 'cast':
      return `$ ${text(args.command)}`
    case 'scout':
      return [text(args.pattern), text(args.path) || text(args.glob)].filter(Boolean).join('  in  ')
    case 'raven':
      return text(args.url) || text(args.query)
    case 'hero':
      return text(args.prompt) || text(args.description)
    default:
      return clipLines(JSON.stringify(args, null, 2))
  }
}

export function resultOf(output: unknown): string {
  if (output === undefined || output === null) return ''
  if (typeof output === 'string') return clipLines(output)
  const record = output as Record<string, unknown>
  if (typeof record.stdout === 'string' || typeof record.stderr === 'string') {
    return clipLines([text(record.stdout), text(record.stderr)].filter(Boolean).join('\n'))
  }
  const file = record.file as Record<string, unknown> | undefined
  if (file && typeof file.content === 'string') return clipLines(file.content)
  if (typeof record.content === 'string') return clipLines(record.content)
  if (Array.isArray(record.filenames)) return clipLines((record.filenames as unknown[]).map(String).join('\n'))

  return clipLines(JSON.stringify(output, null, 2))
}

// The opened row as markdown, so the app draws it as it draws a reply: the
// command as a bash block, an edit as a red/green diff, a file in its own
// language, output in its own block. Each block clipped like the plain view.
const LANGS: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js', json: 'json', md: 'markdown', py: 'python',
  sh: 'bash', zsh: 'bash', css: 'css', scss: 'scss', html: 'html', yml: 'yaml', yaml: 'yaml', sql: 'sql',
  go: 'go', rs: 'rust', swift: 'swift', kt: 'kotlin', java: 'java', rb: 'ruby', toml: 'toml', xml: 'xml',
}

export const langOf = (path: string) => LANGS[(/\.([A-Za-z0-9]+)$/.exec(path)?.[1] ?? '').toLowerCase()] ?? ''

// A fenced block that cannot be closed early by backticks in its body.
export function fence(body: string, lang = ''): string {
  let ticks = '```'
  while (body.includes(ticks)) ticks += '`'
  return `${ticks}${lang}\n${body}\n${ticks}`
}

const asDiff = (before: string, after: string) =>
  [...before.split('\n').map(line => `- ${line}`), ...after.split('\n').map(line => `+ ${line}`)].join('\n')

const pathLine = (path: string) => (path === '' ? '' : `\`${path.replace(/`/g, "'")}\``)

export function detailsMarkdown(tool: string, input: unknown, output: unknown): string {
  const args = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const result = resultOf(output)
  const outputBlock = result === '' ? '' : fence(result)
  const blocks: string[] = []
  switch (KIND[tool]) {
    case 'cast':
      blocks.push(fence(clipLines(text(args.command)), 'bash'), outputBlock)
      break
    case 'forge': {
      const path = text(args.file_path) || text(args.notebook_path)
      blocks.push(pathLine(path))
      if (typeof args.old_string === 'string' || typeof args.new_string === 'string') {
        blocks.push(fence(clipLines(asDiff(text(args.old_string), text(args.new_string))), 'diff'))
      } else if (Array.isArray(args.edits)) {
        for (const edit of args.edits as Array<Record<string, unknown>>) blocks.push(fence(clipLines(asDiff(text(edit.old_string), text(edit.new_string))), 'diff'))
      } else if (typeof args.content === 'string') {
        blocks.push(fence(clipLines(args.content), langOf(path)))
      }
      break
    }
    case 'read': {
      const path = text(args.file_path) || text(args.notebook_path)
      blocks.push(pathLine(path), result === '' ? '' : fence(result, langOf(path)))
      break
    }
    case 'scout':
    case 'raven':
      blocks.push(pathLine(callOf(tool, input)), outputBlock)
      break
    case 'hero':
      blocks.push(fence(clipLines(text(args.prompt) || text(args.description))), outputBlock)
      break
    default:
      blocks.push(fence(clipLines(JSON.stringify(args, null, 2)), 'json'), outputBlock)
  }

  return blocks.filter(block => block !== '').join('\n\n')
}

// The working row's word: the app's own ("Creating notes.md", "Working"),
// read by its first word into the realm's verb, the rest kept as the detail.
const SPINNER_VERBS: ReadonlyArray<[RegExp, keyof typeof VERBS]> = [
  [/^(reading|viewing|opening)\b/i, 'read'],
  [/^(creating|writing|editing|updating|changing)\b/i, 'forge'],
  [/^(running|executing)\b/i, 'cast'],
  [/^(searching|finding|listing|looking)\b/i, 'scout'],
  [/^(fetching|browsing)\b/i, 'raven'],
]

export type SpinnerMode = 'requesting' | 'responding' | 'thinking' | 'tool-input' | 'tool-use'

export function spinnerWords(word: string, message: string | null, mode: SpinnerMode): string {
  if (message !== null && message !== '') return message
  if (mode === 'thinking') return 'Pondering'
  if (mode === 'requesting') return 'Summoning'
  if (mode === 'responding') return 'Scribing the answer'
  for (const [pattern, kind] of SPINNER_VERBS) {
    if (pattern.test(word)) {
      const verb = VERBS[kind] as Verb
      return `${verb.running}${word.replace(pattern, '')}`
    }
  }

  return /^working$/i.test(word.trim()) ? 'On the quest' : word
}

// The line under the prompt: known phrases reworded, the rest as written.
const HINTS: ReadonlyArray<[RegExp, string]> = [
  [/esc to interrupt/i, 'esc to call the party back'],
  [/\? for shortcuts/i, '? for the spellbook'],
]

export function hintWords(hint: string): string {
  return HINTS.reduce((line, [pattern, words]) => line.replace(pattern, words), hint)
}

