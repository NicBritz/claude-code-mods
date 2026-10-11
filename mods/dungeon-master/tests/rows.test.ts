import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { iconSvg } from '../hooks/icons'
import { readRealmAsk } from '../hooks/settings'
import { readTheme } from '../hooks/themes'
import { dataDirFrom, freshFiles } from '../hooks/realm'
import { callOf, clipLines, detailsMarkdown, fence, langOf, hintWords, resultOf, spinnerWords, toolWords } from '../hooks/words'

const SURFACES = ['desktop', 'terminal'] as const
const SCROLL = { offset: 0, bodyRows: 60 }
const IDLE = { isRunning: false, isErrored: false, isInterrupted: false }

// What sits beneath the plugin: the app's own drawing of every row.
function engine(on: On, stored?: Record<string, unknown>): void {
  mock.clock(on)
  mock.store(on, stored)
  on('session.start', () => ({ cwd: '/repo' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', () => ({ value: undefined }) as never)
  on('ui.invalidate', () => ({ value: undefined }))
  on('env.get', ($, e) => ({ value: (e as unknown as { name: string }).name === 'HOME' ? '/home/ada' : undefined }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const props = e.props as Record<string, unknown>
    const said = String(props.word ?? props.hint ?? (Array.isArray(props.modes) ? props.modes.join(' & ') : 'the app draws here'))
    return h(Text, null, `app: ${said}`) as RenderElement
  })
}

const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'dm', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

const toolRow = (surface: (typeof SURFACES)[number], tool: string, input: unknown, state = IDLE) => ({
  plugin: 'dungeon-master',
  surface,
  component: 'ToolUse' as const,
  requestId: 'toolu-1',
  props: { tool_use_id: 'toolu-1', tool, input, ...state },
})

describe('the realm draws around the chat', () => {
  test('a tool row becomes a stone row: verb in torch orange, plain detail beside it', async ($, on) => {
    engine(on)
    await start($)
    for (const surface of SURFACES) {
      const row = await $.ui.mount(toolRow(surface, 'Read', { file_path: '/repo/src/pricing.ts' }))
      expect(await row.find({ text: surface === 'terminal' ? /› Studied pricing\.ts/ : /Studied pricing\.ts/ })).toBeDefined()
      if (surface === 'desktop') expect((await row.find({ type: 'Svg' }))?.props.alt).toBe('Studied')
      const drawn = JSON.stringify(await row.find({ text: /Studied/ }))
      expect(drawn).toContain('#F0A04B')
      expect(drawn).toContain('#3B332B')
      await row.unmount()
    }
  })

  test('the working row, the hint line and the mode labels keep the app drawing them, in new words', async ($, on) => {
    engine(on)
    await start($)
    const props = { word: 'Creating notes.md', message: null, suffix: '…', mode: 'tool-use' as const }
    const spinner = await $.ui.mount({ plugin: 'dungeon-master', surface: 'desktop', component: 'Spinner', props })
    expect(await spinner.find({ text: /app: Forging notes\.md/ })).toBeDefined()
    await spinner.unmount()

    const hint = await $.ui.mount({ plugin: 'dungeon-master', surface: 'desktop', component: 'PromptHint', props: { isDraft: false, isWorking: true, hint: 'esc to interrupt' } })
    expect(await hint.find({ text: /app: esc to call the party back/ })).toBeDefined()
    await hint.unmount()

    const modes = await $.ui.mount({ plugin: 'dungeon-master', surface: 'desktop', component: 'SessionMode', props: { modes: ['plan mode'] } })
    expect(await modes.find({ text: /app: plan mode/ })).toBeDefined()
    await modes.unmount()
  })

  test('/realm rows off hands every row back to the app, and stays off after a restart', async ($, on) => {
    engine(on)
    await start($)
    expect((await run($, 'rows off')).text).toContain('off')
    const row = await $.ui.mount(toolRow('desktop', 'Read', { file_path: '/repo/a.ts' }))
    expect(await row.find({ text: /app: the app draws here/ })).toBeDefined()
    await row.unmount()

    await start($)
    const hint = await $.ui.mount({ plugin: 'dungeon-master', surface: 'desktop', component: 'PromptHint', props: { isDraft: false, isWorking: true, hint: 'esc to interrupt' } })
    expect(await hint.find({ text: /app: esc to interrupt/ })).toBeDefined()
    await hint.unmount()

    expect((await run($, 'rows on')).text).toContain('on')
  })

  test('click a stone row to see the call and what came back; click again to close it', async ($, on) => {
    engine(on)
    await start($)
    for (const surface of SURFACES) {
      const row = await $.ui.mount(toolRow(surface, 'Bash', { command: 'pnpm test --run', description: 'Run the tests' }))
      expect(await row.find({ type: 'Markdown' })).toBeUndefined()
      await row.unmount()
    }
    const closed = { ...toolRow('desktop', 'Bash', { command: 'pnpm test --run' }), props: { ...toolRow('desktop', 'Bash', { command: 'pnpm test --run' }).props, output: { stdout: '27 pass', stderr: '' } } }
    const row = await $.ui.mount(closed)
    expect((await row.find({ key: 'row:toolu-1' }))?.props.label).toBe('▸ Details')
    await row.press({ key: 'row:toolu-1' })
    const md = (await row.find({ type: 'Markdown' }))?.props.text
    expect(md).toBe('```bash\npnpm test --run\n```\n\n```\n27 pass\n```')
    expect((await row.find({ key: 'row:toolu-1' }))?.props.label).toBe('▾ Hide')
    await row.press({ key: 'row:toolu-1' })
    expect(await row.find({ type: 'Markdown' })).toBeUndefined()
    await row.unmount()
  })

  test('/realm theme restyles the rows and writes the shared file for every session', async ($, on) => {
    engine(on)
    const written: string[] = []
    on('fs.write', ($, e) => {
      written.push(`${String(e.path)} ${String(e.text)}`)
      return { value: undefined }
    })
    await start($)
    expect((await run($, 'theme celestial')).text).toContain('celestial')
    expect(written.join()).toContain('"theme": "celestial"')
    const row = await $.ui.mount(toolRow('desktop', 'Edit', { file_path: '/a/notes.md' }))
    const drawn = JSON.stringify(await row.find({ text: /Forged/ }))
    expect(drawn).toContain('#1B2A6B')
    expect((await row.find({ type: 'Svg' }))?.props).toMatchObject({ width: 20, height: 20, alt: 'Forged' })
    await row.unmount()
    expect((await run($, 'theme neon')).text).toContain('dungeon, tavern, underdark, dragonfire, frostkeep, feywild, arcane, tome, celestial, wildwood')
  })

  test('its status is a command for the person, not a tool for the model', async ($, on) => {
    engine(on)
    await start($)
    expect((await run($, 'status')).text).toContain('On: Strip above the message box')
  })

  test('a switch saved in an earlier session is honoured from the start', async ($, on) => {
    engine(on, { settings: { rows: false } })
    await start($)
    const row = await $.ui.mount(toolRow('desktop', 'Read', { file_path: '/repo/a.ts' }))
    expect(await row.find({ text: /app: the app draws here/ })).toBeDefined()
    await row.unmount()
  })
})

describe('the words', () => {
  test('each tool, running and done', () => {
    expect(toolWords('Edit', { file_path: '/a/notes.md' }, { ...IDLE, isRunning: true })).toMatchObject({ icon: '›', verb: 'Forging', detail: 'notes.md' })
    expect(toolWords('Bash', { command: 'pnpm test\nmore' }, IDLE)).toMatchObject({ icon: '›', verb: 'Cast', detail: 'pnpm test' })
    expect(toolWords('Bash', { command: 'x', description: 'Run the tests' }, IDLE).detail).toBe('Run the tests')
    expect(toolWords('Grep', { pattern: 'invoice' }, { ...IDLE, isRunning: true })).toMatchObject({ icon: '›', verb: 'Scouting', detail: 'invoice' })
    expect(toolWords('WebFetch', { url: 'https://docs.example.com/x' }, IDLE)).toMatchObject({ icon: '›', verb: 'Raven returned', detail: 'docs.example.com' })
    expect(toolWords('Agent', { description: 'Map billing' }, { ...IDLE, isRunning: true })).toMatchObject({ icon: '›', verb: 'Sending a hero', detail: 'Map billing' })
    expect(toolWords('mcp__github__create_pull_request', {}, IDLE)).toMatchObject({ icon: '›', verb: 'Used', detail: 'create pull request (github)' })
  })

  test('each action has its pixel item', () => {
    const item = (tool: string, state = IDLE) => toolWords(tool, {}, state).item
    expect(['Read', 'Edit', 'Bash', 'Grep', 'WebFetch', 'Agent', 'TodoWrite', 'mcp__x__y'].map(tool => item(tool))).toEqual([
      'chest', 'hammer', 'staff', 'bow', 'arrow', 'sword', 'coin', 'flask',
    ])
    expect(item('Read', { ...IDLE, isErrored: true })).toBe('skull')
    expect(item('Read', { ...IDLE, isInterrupted: true })).toBe('heart')
  })

  test('long weapons lie at 45 degrees; square items stand', () => {
    expect(iconSvg('sword')).toContain('rotate(45)')
    expect(iconSvg('chest')).not.toContain('rotate')
    expect(iconSvg('coin', 20)).toContain('width="20"')
  })

  test('the shared theme file, read leniently, and where it lives', () => {
    expect(readTheme('{"theme":"celestial"}')).toBe('celestial')
    expect(readTheme('{"theme":"neon"}')).toBe('dungeon')
    expect(readTheme('not json')).toBe('dungeon')
    expect(readTheme(null)).toBe('dungeon')
    expect(dataDirFrom('/Users/n', undefined)).toBe('/Users/n/.claude/dungeon-master')
    expect(dataDirFrom('/Users/n', '/srv/claude-config/')).toBe('/srv/claude-config/dungeon-master')
    expect(dataDirFrom(undefined, undefined)).toBeNull()
    expect(dataDirFrom('relative', 'also-relative')).toBeNull()
    const files = [
      { name: 'old.json', mtimeMs: 0 },
      { name: 'me.json', mtimeMs: 990_000 },
      { name: 'b.json', mtimeMs: 980_000 },
      { name: 'a.json', mtimeMs: 995_000 },
      { name: 'notes.txt', mtimeMs: 999_000 },
    ]
    expect(freshFiles(files, 1_000_000, 'me.json').map(one => one.name)).toEqual(['a.json', 'b.json'])
    expect(readRealmAsk('theme JRPG')).toEqual({ kind: 'theme', theme: 'jrpg' })
  })

  test('errors and interruptions say so plainly', () => {
    expect(toolWords('Read', { file_path: '/a/b.ts' }, { ...IDLE, isErrored: true })).toMatchObject({ icon: '!', verb: 'Failed', detail: 'studying b.ts' })
    expect(toolWords('Bash', { command: 'sleep 9' }, { ...IDLE, isInterrupted: true })).toMatchObject({ icon: '×', verb: 'Called back', detail: 'casting sleep 9' })
  })

  test('the working row by what the turn is doing', () => {
    expect(spinnerWords('Working', null, 'thinking')).toBe('Pondering')
    expect(spinnerWords('Working', null, 'responding')).toBe('Scribing the answer')
    expect(spinnerWords('Reading pricing.ts', null, 'tool-use')).toBe('Studying pricing.ts')
    expect(spinnerWords('Running pnpm test', null, 'tool-use')).toBe('Casting pnpm test')
    expect(spinnerWords('Working', null, 'tool-use')).toBe('On the quest')
    expect(spinnerWords('Compacting', 'Compacting conversation', 'tool-use')).toBe('Compacting conversation')
  })

  test('an opened row: the call in full, the result clipped', () => {
    expect(callOf('Read', { file_path: '/repo/src/pricing.ts' })).toBe('/repo/src/pricing.ts')
    expect(callOf('Grep', { pattern: 'invoice', path: 'src' })).toBe('invoice  in  src')
    expect(resultOf({ stdout: 'ok', stderr: 'warn' })).toBe('ok\nwarn')
    expect(resultOf({ file: { content: 'line' } })).toBe('line')
    expect(resultOf(undefined)).toBe('')
    const long = Array.from({ length: 50 }, (_, i) => `l${i}`).join('\n')
    expect(clipLines(long).split('\n')).toHaveLength(41)
    expect(clipLines(long).endsWith('… 10 more lines')).toBe(true)
  })

  test('details as markdown: bash, diffs, code by language, safe fences', () => {
    expect(detailsMarkdown('Edit', { file_path: '/a/notes.ts', old_string: 'a\nb', new_string: 'c' }, undefined)).toBe('`/a/notes.ts`\n\n```diff\n- a\n- b\n+ c\n```')
    expect(detailsMarkdown('Read', { file_path: '/a/x.py' }, { file: { content: 'print(1)' } })).toBe('`/a/x.py`\n\n```python\nprint(1)\n```')
    expect(detailsMarkdown('mcp__x__y', { a: 1 }, 'ok')).toBe('```json\n{\n  "a": 1\n}\n```\n\n```\nok\n```')
    expect(fence('has ``` inside')).toBe('````\nhas ``` inside\n````')
    expect(langOf('App.TSX')).toBe('tsx')
    expect(langOf('Makefile')).toBe('')
  })

  test('hints, modes and the switch', () => {
    expect(hintWords('esc to interrupt · ? for shortcuts')).toBe('esc to call the party back · ? for the spellbook')
    expect(hintWords('something new')).toBe('something new')
    expect(readRealmAsk('')).toEqual({ kind: 'open' })
    expect(readRealmAsk(' Dice OFF ')).toEqual({ kind: 'switch', key: 'dice', on: false })
    expect(readRealmAsk('sound on')).toEqual({ kind: 'switch', key: 'sound', on: true })
    expect(readRealmAsk('off')).toEqual({ kind: 'unknown' })
    expect(readRealmAsk('rows maybe')).toEqual({ kind: 'unknown' })
  })
})

describe('the rolling d20', () => {
  const spinner = { plugin: 'dungeon-master', surface: 'desktop' as const, component: 'Spinner' as const, props: { word: 'Thinking', message: null, suffix: '…', mode: 'thinking' as const } }

  test('tumbles beside the working line on the desktop, a fresh face as time passes', async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on)
    on('session.start', () => ({ cwd: '/repo' }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('tool.register', () => ({ value: undefined }) as never)
    on('ui.invalidate', () => ({ value: undefined }))
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, null, `app: ${String((e.props as { word?: string }).word)}`) as RenderElement
    })
    await start($)
    const faces = new Set<string>()
    for (let i = 0; i < 6; i++) {
      const row = await $.ui.mount(spinner)
      const die = await row.find({ type: 'Svg' })
      expect(die?.props.alt).toBe('A d20, rolling')
      expect(await row.find({ text: /app: / })).toBeDefined()
      faces.add(String(die?.props.source))
      await row.unmount()
      await clock.advance(250)
    }
    expect(faces.size).toBeGreaterThan(3)

    await run($, 'dice off')
    const plain = await $.ui.mount(spinner)
    expect(await plain.find({ type: 'Svg' })).toBeUndefined()
    await plain.unmount()
  })
})
