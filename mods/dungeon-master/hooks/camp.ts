// The camp: background work the session left running (shell commands,
// monitors, workflows) and what it scheduled (wake-ups, crons). Pure rules;
// the hooks that feed them are in register.tsx.

import type { CampKind, CampStatus, CampTask } from '../types'

import type { ItemName } from './items'

// A finished task stays this long, so you see how it ended.
export const KEEP_FINISHED_MS = 5 * 60_000
// An output file bigger than this is not read whole every few seconds.
export const MAX_PEEK_BYTES = 1024 * 1024

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const clip = (value: string, max = 90) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)
const firstLine = (value: string) => (value.split('\n')[0] ?? '').trim()

export type CampChange =
  | { add: CampTask }
  | { end: string; status: CampStatus; summary?: string }
  | { remove: string }

const task = (id: string, kind: CampKind, title: string, detail: string, now: number, agentId?: string, wakesAt?: number): CampTask => ({
  id,
  kind,
  title: clip(title || detail || kind),
  detail: clip(detail, 140),
  status: 'running',
  startedAt: now,
  endedAt: null,
  lastLine: '',
  ...(agentId === undefined ? {} : { agentId }),
  ...(wakesAt === undefined ? {} : { wakesAt }),
})

// What one tool call did to the camp, read from its input and its result.
export function campFromCall(tool: string, input: unknown, result: unknown, now: number, agentId?: string): CampChange | null {
  const args = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const out = (typeof result === 'object' && result !== null ? result : {}) as Record<string, unknown>
  switch (tool) {
    case 'Bash': {
      const id = text(out.backgroundTaskId)
      if (id === '') return null
      return { add: task(id, 'shell', text(args.description), firstLine(text(args.command)), now, agentId) }
    }
    case 'Monitor': {
      const id = text(out.taskId)
      if (id === '') return null
      return { add: task(id, 'monitor', text(args.description), firstLine(text(args.command)), now, agentId) }
    }
    case 'Workflow': {
      const id = text(out.taskId)
      if (id === '') return null
      const name = text(out.workflowName) || text(args.name)
      return { add: task(id, 'workflow', text(out.summary) || name, name, now, agentId) }
    }
    case 'ScheduleWakeup': {
      if (out.stopped === true) return { remove: 'wakeup' }
      const at = typeof out.scheduledFor === 'number' ? out.scheduledFor : null
      if (at === null) return null
      const wakesAt = at < 1e12 ? at * 1000 : at
      return { add: task('wakeup', 'wakeup', text(args.reason) || 'Wake-up', firstLine(text(args.prompt)), now, agentId, wakesAt) }
    }
    case 'CronCreate': {
      const id = text(out.id)
      if (id === '') return null
      return { add: task(id, 'cron', firstLine(text(args.prompt)) || 'Scheduled task', text(out.humanSchedule), now, agentId) }
    }
    case 'CronDelete':
      return text(out.id) === '' ? null : { remove: text(out.id) }
    case 'TaskStop': {
      const id = text(out.task_id) || text(args.task_id)
      return id === '' ? null : { end: id, status: 'stopped' }
    }
    default:
      return null
  }
}

const tag = (body: string, name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body)?.[1]?.trim() ?? ''

// A finished task's notice: "<task-notification><task-id>…</task-id><status>completed</status>…".
export function parseNotification(body: string): { id: string; status: CampStatus; summary: string } | null {
  if (!body.includes('<task-notification>')) return null
  const id = tag(body, 'task-id')
  if (id === '') return null
  const said = tag(body, 'status').toLowerCase()
  const summary = tag(body, 'summary')
  const exit = /exit code (\d+)/i.exec(summary)?.[1]
  const status: CampStatus =
    /kill|stop|cancel/.test(said) ? 'stopped' : /fail|error/.test(said) || (exit !== undefined && exit !== '0') ? 'failed' : 'done'

  return { id, status, summary: clip(summary, 140) }
}

export function applyChange(tasks: readonly CampTask[], change: CampChange, now: number): CampTask[] {
  if ('add' in change) return [...tasks.filter(one => one.id !== change.add.id), change.add]
  if ('remove' in change) return tasks.filter(one => one.id !== change.remove)

  return tasks.map(one =>
    one.id === change.end && one.status === 'running'
      ? { ...one, status: change.status, endedAt: now, ...(change.summary ? { summary: change.summary } : {}) }
      : one,
  )
}

export type RunningSummary = { id: string; type: string; description: string; command?: string }
export type CronSummary = { id: string; schedule: string; recurring: boolean; prompt: string }

// At the end of a turn the engine lists what is still running and what is
// scheduled: anything of ours it no longer lists has finished; anything it
// lists that we missed (started before a reload) joins the camp.
export function reconcile(tasks: readonly CampTask[], running: readonly RunningSummary[], crons: readonly CronSummary[], now: number): CampTask[] {
  const live = new Set(running.map(one => one.id))
  const scheduled = new Set(crons.map(one => one.id))
  const kept = tasks.map(one => {
    if (one.status !== 'running') return one
    if (one.kind === 'wakeup') return one
    if (one.kind === 'cron') return one
    return live.has(one.id) ? one : { ...one, status: 'done' as const, endedAt: now }
  }).filter(one => one.kind !== 'cron' || scheduled.has(one.id))
  const known = new Set(kept.map(one => one.id))
  const kindOf = (type: string): CampKind | null => (type === 'shell' ? 'shell' : type === 'monitor' ? 'monitor' : type === 'workflow' ? 'workflow' : null)
  const missed = running
    .filter(one => !known.has(one.id) && kindOf(one.type) !== null)
    .map(one => task(one.id, kindOf(one.type) as CampKind, one.description, firstLine(one.command ?? ''), now))
  const crons_ = crons.filter(one => !known.has(one.id)).map(one => task(one.id, one.recurring ? 'cron' : 'wakeup', firstLine(one.prompt) || 'Scheduled task', one.schedule, now))

  return [...kept, ...missed, ...crons_]
}

// Finished tasks leave after a while; a wake-up leaves once it has fired.
export function pruneCamp(tasks: readonly CampTask[], now: number): CampTask[] {
  return tasks.filter(one => {
    if (one.status !== 'running') return now - (one.endedAt ?? now) < KEEP_FINISHED_MS
    if (one.kind === 'wakeup' && one.wakesAt !== undefined) return now < one.wakesAt + 60_000
    return true
  })
}

// The newest line worth showing: colour codes and blank lines dropped.
export function lastLine(output: string): string {
  // eslint-disable-next-line no-control-regex
  const lines = output.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '\n').split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = (lines[index] ?? '').trim()
    if (line !== '') return clip(line, 120)
  }
  return ''
}

// Where background output lives: <tmp>/claude-<uid>/<cwd as a slug>/<session>/tasks.
export const cwdSlug = (cwd: string) => cwd.replace(/[^A-Za-z0-9-]/g, '-')

const ICONS: Record<CampKind, ItemName> = { shell: 'staff', monitor: 'bow', workflow: 'banner', wakeup: 'coin', cron: 'banner' }
const ENDINGS: Record<Exclude<CampStatus, 'running'>, ItemName> = { done: 'chest', failed: 'skull', stopped: 'heart' }

export const campIcon = (one: CampTask) => (one.status === 'running' ? ICONS[one.kind] : ENDINGS[one.status])

export function untilWords(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  if (minutes < 1) return 'any moment'
  if (minutes < 60) return `in ${minutes}m`
  return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const RUNNING_VERB: Record<CampKind, string> = { shell: 'burning', monitor: 'on watch', workflow: 'marching', wakeup: 'wakes', cron: 'repeats' }

// The second line of a camp card: how long, or when, or how it ended.
export function campState(one: CampTask, now: number, elapsed: (ms: number) => string): string {
  if (one.status !== 'running') {
    const ago = elapsed(now - (one.endedAt ?? now))
    const word = one.status === 'done' ? 'done' : one.status === 'failed' ? 'failed' : 'stopped'
    return `${word} ${ago} ago${one.summary ? ` · ${one.summary}` : ''}`
  }
  if (one.kind === 'wakeup') return one.wakesAt === undefined ? 'scheduled' : `wakes ${untilWords(one.wakesAt, now)}`
  if (one.kind === 'cron') return `repeats · ${one.detail}`

  return `${RUNNING_VERB[one.kind]} ${elapsed(now - one.startedAt)}`
}

export const isRunningWork = (one: CampTask) => one.status === 'running' && (one.kind === 'shell' || one.kind === 'monitor' || one.kind === 'workflow')
