// What a pal is doing, in a few plain words, from the tool call it made.

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

const baseName = (path: unknown) =>
  typeof path === 'string' ? (path.split('/').pop() ?? path) : 'a file'

const str = (value: unknown) => (typeof value === 'string' ? value : '')

export function describeCall(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'Read':
      return `reading ${baseName(input.file_path)}`
    case 'Edit':
    case 'MultiEdit':
      return `editing ${baseName(input.file_path)}`
    case 'Write':
      return `writing ${baseName(input.file_path)}`
    case 'NotebookEdit':
      return `editing ${baseName(input.notebook_path)}`
    case 'Bash': {
      // A command's own description already reads as words ("Pause five seconds…").
      const said = str(input.description)
      if (said) return clip(said.charAt(0).toLowerCase() + said.slice(1), 64)
      return `running ${clip(str(input.command).split('\n')[0] ?? '', 48)}`
    }
    case 'Grep':
      return `searching for “${clip(str(input.pattern), 32)}”`
    case 'Glob':
      return `looking for ${clip(str(input.pattern), 32)}`
    case 'WebFetch': {
      const host = /^https?:\/\/([^/]+)/.exec(str(input.url))?.[1]
      return `reading ${host ?? 'a web page'}`
    }
    case 'WebSearch':
      return `searching the web for “${clip(str(input.query), 32)}”`
    case 'Agent':
    case 'Task':
      return 'briefing a helper'
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'updating its to-do list'
    case 'Skill':
      return `using the ${str(input.skill) || 'a'} skill`
    case 'ToolSearch':
      return 'looking through its toolbox'
  }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (mcp) return `using ${(mcp[2] ?? '').replace(/_/g, ' ')} (${mcp[1] ?? ''})`

  return `using ${tool}`
}

export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

// The first sentence-like line of an answer: headings are skipped while any
// plain line follows them, so "## Findings" never stands in for the finding.
export function firstLine(text: string, max = 120): string {
  const lines = text.split('\n').map(one => one.trim()).filter(one => one.length > 0)
  const line = lines.find(one => !one.startsWith('#')) ?? lines[0]

  return line === undefined ? '' : clip(line.replace(/^[#>*\-\s]+/, '').trim(), max)
}

// Long unbroken words (paths, ids, commands) get invisible break points after
// / . _ - : and every 20 characters, so they wrap instead of running off the card.
export function softBreak(text: string): string {
  return text.replace(/\S{21,}/g, word =>
    word.replace(/([/._\-:])/g, '$1\u200B').replace(/([^\u200B]{20})(?=[^\u200B])/g, '$1\u200B'),
  )
}
