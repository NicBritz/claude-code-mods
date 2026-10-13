import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

import { MOD } from '../hooks/credits'
import { describeCall, elapsed, firstLine, softBreak } from '../hooks/activity'
import { dollars, priced, spend } from '../hooks/cost'
import { levelOf, progressBar, xpFor } from '../hooks/fame'
import { graveSvg } from '../hooks/graves'
import { applyChange, campFromCall, lastLine, parseNotification, pruneCamp, reconcile } from '../hooks/camp'
import { listed, newQuest, questGain, questTally, withCall } from '../hooks/quests'
import { crossing, resetsIn, staminaWords } from '../hooks/stamina'
import { contextBarSvg, contextBarText, contextWords, windowFor } from '../hooks/context'
import { FRAME_MS, HEROES, RUNE_WAVE, askPhrase, assignHero, heroSvg, overlordSvg } from '../hooks/heroes'
import { LOOP_FRAMES } from '../hooks/art'

const SURFACES = ['desktop', 'terminal'] as const

// Everything a drawing says, its pictures' alt text included (headings are
// drawn in the fantasy font, as pictures).
type Mounted = { findAll: (query: { type: string }) => Promise<unknown[]> }
const said = async (ui: Mounted) => JSON.stringify(await ui.findAll({ type: 'Box' })).replace(/\u200b/g, '')
const SCROLL = { offset: 0, bodyRows: 60 }

const pane = (surface: (typeof SURFACES)[number]) => ({
  plugin: 'dungeon-master',
  surface,
  component: 'Pane' as const,
  requestId: 'dungeon-master',
  props: { title: 'Dungeon Master', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: SCROLL, view: {} },
})

const band = (surface: (typeof SURFACES)[number]) => ({
  plugin: 'dungeon-master',
  surface,
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: true, maxRows: 4, bodyColumns: 80, scroll: SCROLL, view: {} },
})

// What sits beneath the plugin in a session, registered before the test calls $.
type Bench = { clock: MockClock; played: string[]; gains: number[]; stopped: string[]; orders: string[]; toasts: string[]; isPaneShown: { value: boolean }; allows: { value: boolean } }

function engine(on: On): Bench {
  const bench: Bench = { clock: mock.clock(on), played: [], gains: [], stopped: [], orders: [], toasts: [], isPaneShown: { value: false }, allows: { value: true } }
  mock.store(on)
  on('session.surface', () => ({ value: null }))
  on('ui.toast', ($, e) => {
    bench.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: bench.isPaneShown.value
      ? [{ id: 'dungeon-master', title: 'Dungeon Master', isShown: true, isFocused: false, isPlaced: true }]
      : [],
  }))
  on('audio.play', ($, e) => {
    bench.played.push(String(e.clip.asset))
    bench.gains.push(Number((e as unknown as { options?: { gain?: number } }).options?.gain ?? (e as unknown as { gain?: number }).gain ?? NaN))
    return { value: undefined }
  })
  on('tool.check', () => ({ decision: bench.allows.value ? 'allow' : 'ask' }))
  on('classic.Notification', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('agent.spawn', ($, e) => ({ model: 'sonnet', agentId: e.tool_use_id.replace('toolu-', '') }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'Read' }, () => ({ result: { content: 'file' } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'the engine draws here') as RenderElement
  })
  on('tool.call', { tool: 'TaskStop' }, ($, e) => {
    bench.stopped.push(String(e.task_id))
    return { result: { message: 'stopped' } }
  })
  on('tool.call', { tool: 'SendMessage' }, ($, e) => {
    bench.orders.push(`${String(e.to)}: ${e.message}`)
    return { result: { message: 'sent' } }
  })

  return bench
}

async function spawn($: Engine, agentId: string, description: string, type = 'Explore', parentAgentId?: string): Promise<void> {
  await $.agent.spawn({
    tool_use_id: `toolu-${agentId}`,
    prompt: 'Go.',
    description,
    subagentType: type,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: true,
    fork: false,
    ...(parentAgentId === undefined ? {} : { parentAgentId }),
  })
}

const USAGE = { input_tokens: 12_000, output_tokens: 3_000, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 0, model: 'claude-haiku-5-5' }

const complete = (agentId: string, reason: 'answer' | 'error' | 'aborted', answer: string, withUsage = false) => ({
  agentId,
  reason,
  answer,
  durationMs: 1200,
  isAborted: reason === 'aborted',
  turnId: `turn-${agentId}`,
  ...(withUsage ? { usage: USAGE } : {}),
})

// The app's notice that someone waits on a permission prompt.
const ask = (agentId?: string) => ({
  message: 'Claude needs your permission to run pnpm test',
  notification_type: 'permission_prompt',
  ...(agentId === undefined ? {} : { agent_id: agentId, agent_type: 'Explore' }),
})

describe('a hero follows its subagent', () => {
  test('sets out on spawn, asks for permission, then rests in the graveyard', async ($, on) => {
    const bench = engine(on)
    await spawn($, 'a1', 'Audit the pricing page')

    for (const surface of SURFACES) {
      const ui = await $.ui.mount(pane(surface))
      expect(await ui.find({ text: /Audit the pricing page/ })).toBeDefined()
      expect(await said(ui)).toMatch(/Your Party/)
      expect(await ui.find({ text: /1 hero on a quest/ })).toBeDefined()
      expect(await ui.find({ key: 'stop:a1' })).toBeDefined()
      if (surface === 'desktop') {
        const sizes = (await ui.findAll({ type: 'Svg' })).map(svg => `${String(svg.props.width)}x${String(svg.props.height)}`)
        expect(sizes.slice(-2)).toEqual(['40x75', '120x10'])
      }
      await ui.unmount()
    }

    await $.classic.Notification(ask('a1'))
    const asking = await $.ui.mount(pane('desktop'))
    expect(await asking.find({ text: /run pnpm test/ })).toBeDefined()
    expect(await asking.find({ text: /1 needs you/ })).toBeDefined()
    expect(await asking.find({ key: 'allow:a1' })).toBeUndefined()
    await asking.unmount()

    const strip = await $.ui.mount(band('desktop'))
    expect(await strip.find({ text: /1 needs you/ })).toBeDefined()
    expect(await strip.find({ key: 'open' })).toBeDefined()
    await strip.unmount()

    await $.turn.complete(complete('a1', 'answer', '## Findings\nThe annual toggle hides VAT.', true))
    const yard = await $.ui.mount(pane('desktop'))
    expect(await yard.find({ key: 'stop:a1' })).toBeUndefined()
    expect(await said(yard)).toMatch(/Graveyard/)
    expect(await yard.find({ type: 'Svg' })).toBeDefined()
    await yard.press({ key: 'visit:a1' })
    expect(await yard.find({ text: /Here lies/ })).toBeDefined()
    expect(await yard.find({ text: /Last words: The annual toggle hides VAT/ })).toBeDefined()
    expect(await yard.find({ text: /Quest complete/ })).toBeDefined()
    expect(await yard.find({ text: /\+10 XP/ })).toBeDefined()
    expect(await yard.find({ text: /Spent 55k tokens/ })).toBeDefined()
    await yard.press({ key: 'bury' })
    expect(await yard.find({ text: /Graveyard/ })).toBeUndefined()
    await yard.unmount()

    expect(bench.played).toEqual(['sounds/set-out.wav', 'sounds/needs-you.wav'])
  })

  test('last words still arrive when the stop is heard before the answer', async ($, on) => {
    engine(on)
    await spawn($, 'd4', 'Read the README')
    await $.classic.SubagentStop({ stop_hook_active: false, agent_id: 'd4', agent_transcript_path: '/tmp/t', agent_type: 'Explore' })
    await $.turn.complete(complete('d4', 'answer', 'The README covers setup.'))
    const ui = await $.ui.mount(pane('desktop'))
    await ui.press({ key: 'visit:d4' })
    expect(await ui.find({ text: /Last words: The README covers setup/ })).toBeDefined()
    await ui.unmount()
  })

  test('an error turn leaves a cracked stone with the reason', async ($, on) => {
    engine(on)
    await spawn($, 'b2', 'Fix the flaky test')
    await $.turn.complete(complete('b2', 'error', 'Overloaded, try again.'))
    const ui = await $.ui.mount(pane('desktop'))
    await ui.press({ key: 'visit:b2' })
    expect(await ui.find({ text: /Fell to an error/ })).toBeDefined()
    expect(await ui.find({ text: /Overloaded, try again/ })).toBeDefined()
    await ui.unmount()
  })

  test('Stop asks TaskStop to end the agent, and Clear graveyard tidies it away', async ($, on) => {
    const bench = engine(on)
    await spawn($, 'c3', 'Crawl the docs')
    const ui = await $.ui.mount(pane('desktop'))
    await ui.press({ key: 'stop:c3' })
    expect(bench.stopped).toContain('c3')
    expect(await said(ui)).toMatch(/Graveyard/)
    await ui.press({ key: 'clear' })
    expect(await ui.find({ text: /Crawl the docs/ })).toBeUndefined()
    expect(await ui.find({ text: /The tavern is quiet/ })).toBeDefined()
    await ui.unmount()
  })

  test('each live hero has its own border colour and the graveyard is framed in red', async ($, on) => {
    engine(on)
    await spawn($, 'e1', 'First quest')
    await spawn($, 'e2', 'Second quest')
    await spawn($, 'e3', 'Third quest')
    await $.turn.complete(complete('e3', 'answer', 'Done.'))
    const ui = await $.ui.mount(pane('desktop'))
    const colours = await Promise.all(['e1', 'e2'].map(async id => (await ui.find({ key: `hero:${id}` }))?.props.borderColor))
    expect(new Set(colours).size).toBe(2)
    for (const colour of colours) expect(colour).toMatch(/^#[0-9A-F]{6}$/)
    const frames = await ui.findAll({ type: 'Box' })
    expect(frames.some(box => box.props.borderColor === 'error')).toBe(true)
    expect((await ui.find({ type: 'Svg' }))?.props.isInteractive).toBeUndefined()
    await ui.unmount()
  })

  test('a subagent spawned by another follows its leader inside the leader card', async ($, on) => {
    engine(on)
    await spawn($, 'lead', 'Lead the expedition', 'general-purpose')
    await spawn($, 'help', 'Carry the maps', 'Explore', 'lead')
    const ui = await $.ui.mount(pane('desktop'))
    expect(await ui.find({ key: 'hero:lead' })).toBeDefined()
    expect(await ui.find({ key: 'hero:help' })).toBeUndefined()
    expect(await ui.find({ key: 'follower:help' })).toBeDefined()
    expect(await ui.find({ key: 'stop:help' })).toBeDefined()
    expect(await ui.find({ text: /2 heroes on a quest/ })).toBeDefined()
    await ui.unmount()
  })

  test('the strip is there before anyone sets out, with the Overlord and the way into the panel', async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(band(surface))
      expect(await ui.find({ key: 'open' })).toBeDefined()
      expect(await ui.find({ key: 'mute' })).toBeUndefined()
      expect((await ui.find({ key: 'open' }))?.props.label).toBe('Open DM screen')
      expect(await ui.find({ text: /The Overlord · Awaiting your command/ })).toBeDefined()
      await ui.unmount()
    }

    await $.turn.start({ text: 'Fix the bug', turnId: 'main-1' })
    const working = await $.ui.mount(band('desktop'))
    expect(await working.find({ text: /The Overlord · thinking/ })).toBeDefined()
    await working.unmount()
  })

  test('the strip says what your character is doing while heroes are out, and at work it steps on the frame timer', async ($, on) => {
    const bench = engine(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    await spawn($, 'a1', 'Audit the pricing page')
    await $.turn.start({ text: 'Fix the bug', turnId: 'main-1' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/src/pricing.ts' })

    const figureNow = async () => {
      const hud = await $.ui.mount(band('desktop'))
      const [figure] = await hud.findAll({ type: 'Svg' })
      const source = String(figure?.props.source)
      await hud.unmount()
      return source
    }
    const hud = await $.ui.mount(band('desktop'))
    expect(await hud.find({ text: /The Overlord · reading pricing\.ts.*1 hero on a quest/ })).toBeDefined()
    await hud.unmount()

    // A still frame, not a loop a rebuilt picture would start late.
    const first = await figureNow()
    expect(first).not.toContain('<animate')

    // A tool step between ticks redraws the very same picture: no jump.
    await $.tool.call({ tool: 'Read', file_path: '/repo/src/vat.ts' })
    expect(await figureNow()).toBe(first)

    // The next tick moves it on one frame.
    await bench.clock.advance(FRAME_MS)
    expect(await figureNow()).not.toBe(first)
  })

  test('at rest the strip animates inside its own picture, from the clock', async ($, on) => {
    const bench = engine(on)
    const loopMs = FRAME_MS * LOOP_FRAMES.length
    await bench.clock.advance(700)
    const hud = await $.ui.mount(band('desktop'))
    const [figure] = await hud.findAll({ type: 'Svg' })
    expect(String(figure?.props.source)).toContain(`begin="-${((bench.clock.now() % loopMs) / 1000).toFixed(3)}s"`)
    await hud.unmount()
  })

  test('the panel opens at the start of every session, once, before any subagent', async ($, on) => {
    engine(on)
    const opened: string[] = []
    on('ui.open', ($, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))

    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    expect(opened).toEqual(['dungeon-master'])

    // A reload runs session.start again; the panel is not pushed open twice.
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    await spawn($, 'a1', 'Audit the pricing page')
    expect(opened).toEqual(['dungeon-master'])
  })
})

describe('the overlord: the main thread', () => {
  test('lives on the strip alone: works through a turn, asks, and rests again', async ($, on) => {
    const bench = engine(on)
    const panel = await $.ui.mount(pane('desktop'))
    expect(await panel.find({ key: 'overlord' })).toBeUndefined()
    expect(await panel.find({ text: /Awaiting your command/ })).toBeUndefined()
    await panel.unmount()

    const idle = await $.ui.mount(band('desktop'))
    expect(await idle.find({ text: /The Overlord · Awaiting your command/ })).toBeDefined()
    await idle.unmount()

    await $.turn.start({ text: 'Fix the bug', turnId: 'main-1' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/src/pricing.ts' })
    const working = await $.ui.mount(band('desktop'))
    expect(await working.find({ text: /The Overlord · reading pricing\.ts/ })).toBeDefined()
    await working.unmount()

    await $.classic.Notification(ask())
    const asking = await $.ui.mount(band('desktop'))
    expect(await asking.find({ text: /The Overlord · needs you/ })).toBeDefined()
    await asking.unmount()

    await bench.clock.advance(2000)
    await $.turn.complete({ ...complete('x', 'answer', 'Fixed the rounding bug.', true), agentId: undefined, durationMs: 45_000 })
    const rested = await $.ui.mount(band('desktop'))
    expect(await rested.find({ text: /The Overlord · Awaiting your command/ })).toBeDefined()
    expect((await rested.find({ type: 'Svg' }))?.props).toMatchObject({ width: 62, height: 70, alt: 'The Overlord, your character' })
    await rested.unmount()

    expect(bench.played).toEqual(['sounds/needs-you.wav', 'sounds/done.wav'])
  })
})

const CHAT = [{ role: 'user' as const, text: 'Fix the bug', toolUses: [] }]

// Compactions the test holds open: `reached` resolves once the engine's own
// compaction has begun (every hook above it has run), `release` lets them finish.
function heldCompaction(on: On): { reached: (count: number) => Promise<void>; release: () => void } {
  let release = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  let begun = 0
  const waiting: Array<() => void> = []
  on('session.compact', async () => {
    begun += 1
    for (const wake of waiting.splice(0)) wake()
    await gate
    return { messages: CHAT }
  })
  const reached = async (count: number) => {
    while (begun < count) await new Promise<void>(resolve => waiting.push(resolve))
  }

  return { reached, release: () => release() }
}

describe('compaction: the scroll of memories', () => {
  test('the Overlord holds the scroll on the strip while the main conversation compacts', async ($, on) => {
    engine(on)
    const { reached, release } = heldCompaction(on)
    const running = $.session.compact({ trigger: 'manual', messages: CHAT })
    await reached(1)

    for (const surface of SURFACES) {
      const strip = await $.ui.mount(band(surface))
      expect(await strip.find({ text: /Condensing memories: The Overlord/ })).toBeDefined()
      await strip.unmount()
    }

    release()
    await running
    const after = await $.ui.mount(band('desktop'))
    expect(await after.find({ text: /Condensing memories/ })).toBeUndefined()
    expect(await after.find({ text: /Awaiting your command/ })).toBeDefined()
    await after.unmount()
  })

  test('a subagent compacting its own conversation shows it on its own card, and a precompute shows nothing', async ($, on) => {
    engine(on)
    const { reached, release } = heldCompaction(on)
    await spawn($, 'a1', 'Map the billing module')
    await spawn($, 'a2', 'Read the tests')

    const ahead = $.session.compact({ trigger: 'precompute', agentId: 'a2', messages: CHAT })
    const running = $.session.compact({ trigger: 'auto', agentId: 'a1', messages: CHAT })
    await reached(2)

    const view = await $.ui.mount(pane('desktop'))
    const card = await view.find({ key: 'hero:a1' })
    expect(JSON.stringify(card)).toContain('Condensing memories')
    expect(JSON.stringify(await view.find({ key: 'hero:a2' }))).not.toContain('Condensing memories')
    await view.unmount()

    release()
    await Promise.all([running, ahead])
    const after = await $.ui.mount(pane('desktop'))
    expect(await after.find({ text: /Condensing memories/ })).toBeUndefined()
    await after.unmount()
  })

  test('the runes spiral in and the scroll glows as each wave lands', () => {
    const frames = Array.from({ length: RUNE_WAVE }, (_, frame) => heroSvg(0, false, frame, undefined, true))
    expect(new Set(frames).size).toBe(RUNE_WAVE)
    for (const svg of frames) expect(svg).toContain('#F5DEB3')
    expect(frames.filter(svg => svg.includes('<rect x="3" y="-1"'))).toHaveLength(2)
    expect(heroSvg(0, false, 0)).not.toContain('#F5DEB3')
    expect(overlordSvg('working', 0, true)).toContain('#F5DEB3')
    expect(overlordSvg('working', 0)).not.toContain('#F5DEB3')
  })
})

// One model request of a turn, answered over `input` tokens of context.
async function step($: Engine, input: number, agentId?: string): Promise<void> {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 3, ...(agentId === undefined ? {} : { agentId }) })
  for await (const _ of stream) {
    // the chunks pass through; only the result matters here
  }
  await stream.result
}

function stepsAnswerOver(on: On): void {
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 2_000, output_tokens: 500, cache_read_input_tokens: 148_000, cache_creation_input_tokens: 0, model: e.model },
    }
  })
}

describe('the context bar', () => {
  test('a subagent bar drains with each response and refills after it compacts', async ($, on) => {
    engine(on)
    stepsAnswerOver(on)
    on('session.compact', () => ({ messages: CHAT, tokensBefore: 150_000, tokensAfter: 20_000 }))
    await spawn($, 'a1', 'Map the billing module')

    const fresh = await $.ui.mount(pane('desktop'))
    expect(JSON.stringify(await fresh.find({ key: 'hero:a1' }))).toContain('Context: fresh')
    await fresh.unmount()

    await step($, 150_000, 'a1')
    const low = await $.ui.mount(pane('desktop'))
    expect(JSON.stringify(await low.find({ key: 'hero:a1' }))).toContain('Context 25% left · 150k of 200k')
    await low.unmount()

    await $.session.compact({ trigger: 'auto', agentId: 'a1', messages: CHAT })
    const after = await $.ui.mount(pane('desktop'))
    expect(JSON.stringify(await after.find({ key: 'hero:a1' }))).toContain('Context 90% left · 20k of 200k')
    await after.unmount()
  })

  test('the Overlord reads the engine own figure, on the strip', async ($, on) => {
    engine(on)
    stepsAnswerOver(on)
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 400_000, window: 1_000_000, percent: 40 }, rateLimits: {}, cost: { usd: 0 } } }) as never)
    await step($, 150_000)

    const hud = await $.ui.mount(band('desktop'))
    expect(await hud.find({ text: /Context 60% left · 400k of 1\.0M/ })).toBeDefined()
    await hud.unmount()
    const strip = await $.ui.mount(band('terminal'))
    expect(await strip.find({ text: /60% context left/ })).toBeDefined()
    await strip.unmount()
  })

  test('the bar: green, amber, crimson by what is left; violet while condensing; ten blocks in a terminal', () => {
    const at = (used: number) => ({ tokens: used, window: 100, model: 'm' })
    expect(contextBarSvg(at(10), 0, false)).toContain('#22C55E')
    expect(contextBarSvg(at(60), 0, false)).toContain('#F59E0B')
    expect(contextBarSvg(at(90), 0, false)).toContain('#DC2626')
    expect(contextBarSvg(at(90), 0, true)).toContain('#8B5CF6')
    expect(contextBarText(at(30), false)).toBe('Context ▰▰▰▰▰▰▰▱▱▱')
    expect(contextWords(null, false)).toBe('Context: fresh')
    expect(contextWords(at(30), true)).toBe('Context: condensing')
    expect(windowFor('claude-opus-5-5[1m]', null)).toBe(1_000_000)
    expect(windowFor('claude-haiku-5-5', { tokens: 1, window: 1_000_000, model: 'claude-opus-5-5' })).toBe(200_000)
    expect(windowFor('claude-opus-5-5', { tokens: 1, window: 1_000_000, model: 'claude-opus-5-5' })).toBe(1_000_000)
  })
})

describe('the HUD above the prompt', () => {
  test('a dungeon-stone panel with the Overlord, its words and its context bar', async ($, on) => {
    engine(on)
    const hud = await $.ui.mount(band('desktop'))
    const drawn = JSON.stringify(await hud.find({ text: /Awaiting your command/ }))
    expect(drawn).toContain('#3B332B')
    expect((await hud.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt))).toEqual(['The Overlord, your character', 'Context: fresh'])
    expect(await hud.find({ key: 'open' })).toBeDefined()
    await hud.unmount()
  })
})

// A shared realm folder held in memory: what each session's files say.
function realmFiles(on: On, files: Record<string, string>): Record<string, string> {
  on('fs.read', ($, e) => {
    const path = String(e.path)
    const hit = Object.entries(files).find(([name]) => path.endsWith(name))
    if (!hit) throw new Error('ENOENT')
    return { value: hit[1] } as never
  })
  on('fs.write', ($, e) => {
    files[String(e.path).replace(/^.*\/\.claude\/dungeon-master\//, '')] = String(e.text)
    return { value: undefined }
  })
  on('fs.list', () => ({
    value: Object.keys(files)
      .filter(name => name.startsWith('sessions/'))
      .map(name => {
        // A file's modified time is when it was last checked in.
        let at = 0
        try {
          at = Number((JSON.parse(files[name] ?? '{}') as { updatedAt?: number }).updatedAt ?? 0)
        } catch {
          at = 0
        }
        return { name: name.slice('sessions/'.length), kind: 'file', size: 1, mtimeMs: at, isLink: false }
      }),
  }) as never)
  on('session.id', () => ({ value: 'me' }) as never)
  on('env.get', ($, e) => ({ value: (e as unknown as { name: string }).name === 'HOME' ? '/Users/n' : 'local_me' }) as never)
  return files
}

describe('the realm: every open session, and the shared look', () => {
  test('other sessions show as kingdoms, the one that needs you first; this one checks itself in', async ($, on) => {
    const bench = engine(on)
    await bench.clock.advance(1_000_000)
    const now = 1_000_000
    const files = realmFiles(on, {
      'sessions/a.json': JSON.stringify({ id: 'a', name: 'arc-field', quest: 'Fix the sheet', status: 'working', activity: 'editing App.tsx', context: { tokens: 50_000, window: 200_000, model: 'm' }, isCompacting: false, party: 1, link: 'claude://claude.ai/epitaxy/local_aaa', updatedAt: now - 1000 }),
      'sessions/b.json': JSON.stringify({ id: 'b', name: 'ci-speed', quest: '', status: 'waiting', activity: '', context: null, isCompacting: false, party: 0, updatedAt: now - 2000 }),
      'sessions/old.json': JSON.stringify({ id: 'old', name: 'gone', quest: '', status: 'idle', activity: '', context: null, isCompacting: false, party: 0, updatedAt: now - 10 * 60_000 }),
    })
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    const opened: string[][] = []
    on('process.run', ($, e) => {
      opened.push([...(e.argv as string[])])
      return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
    })
    await $.session.start({ cwd: '/Users/n/repos/Riverford', surface: 'desktop', isInteractive: true })

    const view = await $.ui.mount(pane('desktop'))
    expect(await view.find({ key: 'realm:a' })).toBeUndefined()
    await view.press({ key: 'view-map' })
    expect(await said(view)).toMatch(/The Realm Map/)
    expect(await view.find({ text: /1 needs you · 1 working/ })).toBeDefined()
    const order = (await view.findAll({ type: 'Box' })).map(box => String(box.key ?? '')).filter(key => key.startsWith('band:') || key.startsWith('realm:'))
    expect(order).toEqual(['band:waiting', 'realm:b', 'band:working', 'realm:a'])
    expect(await view.find({ key: 'realm:here' })).toBeUndefined()
    const a = JSON.stringify(await view.find({ key: 'realm:a' }))
    expect(a).toContain('Fix the sheet')
    expect(a).toContain('arc-field')
    expect((await view.find({ key: 'realm-go:a' }))?.props.label).toBe('Go ↗')
    expect(JSON.stringify(await view.find({ key: 'realm:b' }))).toContain('Needs you')
    expect(JSON.stringify(await view.find({ key: 'realm:a' }))).toContain('Context 75% left')
    expect(await view.find({ key: 'realm:old' })).toBeUndefined()
    expect(await view.find({ key: 'realm-go:b' })).toBeUndefined()
    await view.press({ key: 'realm-go:a' })
    expect(opened.filter(argv => argv[0] === 'open')).toEqual([['open', 'claude://claude.ai/epitaxy/local_aaa']])
    await view.unmount()

    expect(JSON.parse(files['sessions/local_me.json'] ?? '{}')).toMatchObject({ id: 'local_me', name: 'Riverford', status: 'idle', link: 'claude://claude.ai/epitaxy/local_me' })
  })

  test('background helpers in hidden folders stay off the map', async ($, on) => {
    engine(on)
    const files = realmFiles(on, {})
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/Users/n/.claude-mem/observer-sessions', surface: null, isInteractive: false })
    expect(Object.keys(files).filter(name => name.startsWith('sessions/'))).toEqual([])
  })

  test('the shared settings file restyles the panel and the HUD', async ($, on) => {
    engine(on)
    realmFiles(on, { 'settings.json': JSON.stringify({ theme: 'tome' }) })
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
    const view = await $.ui.mount(pane('desktop'))
    expect(await said(view)).toContain('#E8B65E')
    await view.unmount()
    const hud = await $.ui.mount(band('desktop'))
    expect(JSON.stringify(await hud.find({ text: /Awaiting your command/ }))).toContain('#EFE2C0')
    await hud.unmount()
  })
})

describe('stamina and the quest log', () => {
  test('the plan windows show as stamina in the HUD, with a warning when one crosses 80%', async ($, on) => {
    const bench = engine(on)
    stepsAnswerOver(on)
    const toasts = bench.toasts
    let week = 70
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        context: { tokens: 100_000, window: 1_000_000, percent: 10 },
        rateLimits: [
          { kind: 'seven_day', percentUsed: week },
          { kind: 'five_hour', percentUsed: 23 },
        ],
        cost: { usd: 0 },
      },
    }) as never)
    await step($, 1)
    const hud = await $.ui.mount(band('desktop'))
    const order = (await hud.findAll({ type: 'Box' })).map(box => String(box.key ?? '')).filter(key => key.startsWith('stamina:'))
    expect(order).toEqual(['stamina:five_hour', 'stamina:seven_day'])
    expect(await hud.find({ text: /5-hour 77% left/ })).toBeDefined()
    expect(await hud.find({ text: /Week 30% left/ })).toBeDefined()
    await hud.unmount()
    expect(toasts).toEqual([])

    week = 82
    await step($, 1)
    expect(toasts).toEqual(['Week limit 80% used. Week 18% left.'])
    await step($, 1)
    expect(toasts).toHaveLength(1)
  })

  test('each main-thread turn leaves a receipt in the quest log', async ($, on) => {
    engine(on)
    on('tool.call', { tool: 'Edit' }, () => ({ result: { content: 'ok' } }))
    await $.turn.start({ text: 'Fix the rounding bug\nmore detail', turnId: 'main-1' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/src/pricing.ts' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/src/pricing.ts' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/pricing.ts', old_string: 'a', new_string: 'b' } as never)
    await $.classic.Notification(ask())
    await $.turn.complete({ ...complete('x', 'answer', 'Fixed it.'), agentId: undefined, durationMs: 65_000 })

    const view = await $.ui.mount(pane('desktop'))
    expect(await said(view)).toMatch(/Quest log/)
    expect(await view.find({ text: /the last 1/ })).toBeDefined()
    const card = JSON.stringify(await view.find({ text: /Quest 1/ }))
    expect(card).toContain('Fix the rounding bug')
    expect(await view.find({ text: /^1 read$/ })).toBeDefined()
    expect(await view.find({ text: /^1 forged$/ })).toBeDefined()
    expect((await view.findAll({ type: 'Svg' })).some(svg => svg.props.alt === '1 ask')).toBe(true)
    expect(await view.find({ text: /Forged pricing\.ts/ })).toBeDefined()
    expect(await view.find({ text: /1m 05s/ })).toBeDefined()
    await view.unmount()
  })

  test('the words for stamina and quests', () => {
    const now = Date.parse('2026-10-10T12:00:00Z')
    expect(resetsIn('2026-10-10T14:10:00Z', now)).toBe('in 2h 10m')
    expect(resetsIn('2026-10-13T16:00:00Z', now)).toBe('in 3d 4h')
    expect(resetsIn('2026-10-10T11:00:00Z', now)).toBe('')
    expect(staminaWords({ kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-10T12:45:00Z' }, now)).toBe('5-hour 77% left · resets in 45m')
    expect(crossing(70, 82)).toBe(80)
    expect(crossing(70, 97)).toBe(95)
    expect(crossing(82, 85)).toBeNull()
    expect(crossing(undefined, 10)).toBeNull()
    let q = newQuest(3, 'Ship it', 0)
    q = withCall(q, 'Bash', { command: 'pnpm test', description: 'Run the tests' }, false)
    q = withCall(q, 'Grep', { pattern: 'x' }, true)
    expect(questTally(q)).toBe('1 cast · 1 scout · 1 failed')
    expect(questTally(newQuest(1, '', 0))).toBe('Words only, no tools')
    expect(questGain({ ...q, contextGained: 12_000 })).toBe('+12k context')
    expect(questGain({ ...q, contextGained: -5 })).toBe('context condensed')
    expect(listed(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c and 2 more')
  })
})

describe('the camp: background work', () => {
  test('a background command joins the camp, shows its newest output, finishes, and can be stopped', async ($, on) => {
    const bench = engine(on)
    let output = 'starting\n'
    on('session.id', () => ({ value: 'sess-1' }) as never)
    on('fs.list', ($, e) => ({ value: String(e.path) === '/private/tmp' ? [{ name: 'claude-501', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] : [] }) as never)
    on('fs.exists', ($, e) => ({ value: String(e.path).endsWith('/-repo/sess-1/tasks') }) as never)
    on('fs.stat', () => ({ value: { kind: 'file', size: output.length, mtimeMs: 0 } }) as never)
    on('fs.read', ($, e) => {
      if (!String(e.path).endsWith('/claude-501/-repo/sess-1/tasks/bg1.output')) throw new Error('ENOENT')
      return { value: output } as never
    })
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } }) as never)
    on('prompt.submit', ($, e) => ({ text: e.text }) as never)
    await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

    await $.tool.call({ tool: 'Bash', command: 'pnpm test --run', description: 'Run the tests', run_in_background: true } as never)
    output = 'starting\n\u001b[32m✓ 412 passed\u001b[0m · running bookings.spec.ts\n'
    await bench.clock.advance(5000)

    const view = await $.ui.mount(pane('desktop'))
    expect(await said(view)).toMatch(/The camp/)
    expect(await view.find({ text: /1 at work in the background/ })).toBeDefined()
    const card = JSON.stringify(await view.find({ key: 'camp:bg1' }))
    expect(card).toContain('Run the tests')
    expect(card).toContain('burning')
    expect(card).toContain('✓ 412 passed · running bookings.spec.ts')
    await view.unmount()
    const hud = await $.ui.mount(band('desktop'))
    expect(await hud.find({ text: /1 in camp/ })).toBeDefined()
    await hud.unmount()

    await $.prompt.submit({
      text: '<task-notification>\n<task-id>bg1</task-id>\n<status>completed</status>\n<summary>Background command "Run the tests" completed (exit code 1)</summary>\n</task-notification>',
      origin: { kind: 'task-notification' },
    } as never)
    const after = await $.ui.mount(pane('desktop'))
    const done = JSON.stringify(await after.find({ key: 'camp:bg1' }))
    expect(done).toContain('"alt":"failed"')
    expect(done).toContain('failed')
    expect(await after.find({ key: 'camp-stop:bg1' })).toBeUndefined()
    await after.unmount()
    expect(bench.played).toContain('sounds/error.wav')
  })

  test('Stop on a camp card asks TaskStop to end it', async ($, on) => {
    const bench = engine(on)
    on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 'm1', timeoutMs: 0 } }) as never)
    await $.tool.call({ tool: 'Monitor', description: 'Watching CI on PR 391', command: 'gh pr checks 391 --watch' } as never)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'camp-stop:m1' })
    await view.unmount()
    expect(bench.stopped).toEqual(['m1'])
    const after = await $.ui.mount(pane('desktop'))
    expect(JSON.stringify(await after.find({ key: 'camp:m1' }))).toContain('stopped')
    await after.unmount()
  })

  test('the rules: what starts, ends and lingers', () => {
    const now = Date.parse('2026-10-10T12:00:00Z')
    expect(campFromCall('Bash', { command: 'ls' }, { stdout: 'x', stderr: '', interrupted: false }, now)).toBeNull()
    const wake = campFromCall('ScheduleWakeup', { reason: 'check the deploy', prompt: 'look', delaySeconds: 600 }, { scheduledFor: now + 600_000, clampedDelaySeconds: 600, wasClamped: false }, now)
    expect(wake).toMatchObject({ add: { id: 'wakeup', kind: 'wakeup', title: 'check the deploy', wakesAt: now + 600_000 } })
    expect(campFromCall('CronCreate', { prompt: 'morning report' }, { id: 'c1', humanSchedule: 'every weekday at 9', recurring: true }, now)).toMatchObject({ add: { kind: 'cron', title: 'morning report', detail: 'every weekday at 9' } })
    expect(campFromCall('TaskStop', { task_id: 'bg1' }, { message: 'ok', task_id: 'bg1', task_type: 'shell' }, now)).toEqual({ end: 'bg1', status: 'stopped' })
    expect(parseNotification('<task-notification><task-id>w1</task-id><status>completed</status><summary>Workflow done</summary></task-notification>')).toEqual({ id: 'w1', status: 'done', summary: 'Workflow done' })
    expect(parseNotification('<task-notification><task-id>b2</task-id><status>killed</status></task-notification>')?.status).toBe('stopped')
    expect(parseNotification('just a message')).toBeNull()

    const one = (id: string) => ({ id, kind: 'shell' as const, title: id, detail: '', status: 'running' as const, startedAt: 0, endedAt: null, lastLine: '' })
    const reconciled = reconcile([one('a'), one('b')], [{ id: 'a', type: 'shell', description: 'a' }, { id: 'z', type: 'monitor', description: 'late' }], [{ id: 'c9', schedule: '0 9 * * *', recurring: true, prompt: 'report' }], now)
    expect(reconciled.map(t => `${t.id}:${t.status}:${t.kind}`)).toEqual(['a:running:shell', 'b:done:shell', 'z:running:monitor', 'c9:running:cron'])
    const finished = applyChange([one('a')], { end: 'a', status: 'done' }, now)
    expect(pruneCamp(finished, now + 4 * 60_000)).toHaveLength(1)
    expect(pruneCamp(finished, now + 6 * 60_000)).toHaveLength(0)
    expect(lastLine('one\n\u001b[31mtwo\u001b[0m\n\n')).toBe('two')
  })
})

describe('folding the party page', () => {
  test('the quest log folds away and stays folded', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'Fix it', turnId: 'm1' })
    await $.turn.complete({ ...complete('x', 'answer', 'Done.'), agentId: undefined, durationMs: 2000 })
    const view = await $.ui.mount(pane('desktop'))
    expect(await view.find({ text: /Quest 1/ })).toBeDefined()
    expect((await view.find({ key: 'fold:quests' }))?.props.label).toBe('▾')
    await view.press({ key: 'fold:quests' })
    expect(await view.find({ text: /Quest 1/ })).toBeUndefined()
    expect(await said(view)).toMatch(/Quest log/)
    await view.unmount()
    const again = await $.ui.mount(pane('desktop'))
    expect(await again.find({ text: /Quest 1/ })).toBeUndefined()
    await again.unmount()
  })
})

describe('settings', () => {
  test('the ⚙ page switches panel sections, and the choice is kept', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'Fix it', turnId: 'm1' })
    await $.turn.complete({ ...complete('x', 'answer', 'Done.'), agentId: undefined, durationMs: 2000 })
    await spawn($, 'a1', 'Map the billing module')

    const view = await $.ui.mount(pane('desktop'))
    expect(await view.find({ key: 'switch:section-quests' })).toBeUndefined()
    await view.press({ key: 'view-settings' })
    expect(await said(view)).toMatch(/The DM's Tome/)
    expect((await view.find({ key: 'switch:section-quests' }))?.props.label).toBe('On')
    await view.press({ key: 'switch:section-quests' })
    await view.press({ key: 'switch:section-party' })
    expect((await view.find({ key: 'switch:section-quests' }))?.props.label).toBe('Off')
    await view.press({ key: 'view-party' })
    expect(await said(view)).not.toMatch(/Quest log/)
    expect(await view.find({ key: 'hero:a1' })).toBeUndefined()
    await view.press({ key: 'view-settings' })
    await view.press({ key: 'switch:section-party' })
    await view.press({ key: 'view-party' })
    expect(await view.find({ key: 'hero:a1' })).toBeDefined()
    await view.unmount()
    const again = await $.ui.mount(pane('desktop'))
    expect(await said(again)).not.toMatch(/Quest log/)
    await again.unmount()
  })

  test('every switch is on the page, and Sounds off silences the chimes', async ($, on) => {
    const bench = engine(on)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-settings' })
    for (const key of ['hud', 'rows', 'dice', 'sound', 'panelAtStart']) {
      expect((await view.find({ key: `switch:${key}` }))?.props.label).toBe('On')
    }
    await view.press({ key: 'switch:sound' })
    expect((await view.find({ key: 'switch:sound' }))?.props.label).toBe('Off')
    await view.press({ key: 'theme:wildwood' })
    expect((await view.find({ key: 'theme:wildwood' }))?.props.variant).toBe('primary')
    expect(await view.find({ key: 'icons:pixel' })).toBeUndefined()
    await view.press({ key: 'font:app' })
    expect(await view.find({ text: /^The DM's Tome$/ })).toBeDefined()
    await view.unmount()
    await spawn($, 'a1', 'Map the billing module')
    expect(bench.played).toEqual([])
  })

  test('your character can be renamed and given a hero look, and the strip follows', async ($, on) => {
    engine(on)
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    const run = (args: string) => $.command.run({ command: 'dm', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
    expect((await run('name Brannoc the Bold')).text).toContain('Brannoc the Bold')
    const strip = await $.ui.mount(band('desktop'))
    expect(await strip.find({ text: /Brannoc the Bold · Awaiting your command/ })).toBeDefined()
    await strip.unmount()

    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-settings' })
    await view.input({ key: 'character-name', text: '  Thessaly\u0007   Moonwhisper  ' })
    expect(JSON.stringify(await view.find({ key: 'character-name' }))).toContain('Thessaly Moonwhisper')
    expect(await view.find({ text: /This is your character/ })).toBeDefined()
    await view.press({ key: 'look-next' })
    await view.press({ key: 'look-next' })
    await view.press({ key: 'look-next' })
    expect(await view.find({ text: /Wizard · 4 of 13/ })).toBeDefined()
    expect(await view.find({ text: /^INT$/ })).toBeDefined()
    expect(await view.find({ text: /^18 \(\+4\)$/ })).toBeDefined()
    await view.press({ key: 'look-prev' })
    await view.press({ key: 'look-next' })
    await view.press({ key: 'look-choose' })
    expect(await view.find({ text: /This is your character/ })).toBeDefined()
    expect(await view.find({ key: 'look-choose' })).toBeUndefined()
    await view.unmount()
    const hud = await $.ui.mount(band('desktop'))
    const art = await hud.find({ type: 'Svg' })
    expect(art?.props).toMatchObject({ width: 40, alt: 'Thessaly Moonwhisper, your character' })
    // Cropped to the figure: shorter than the full 75px box, same scale.
    expect(Number(art?.props.height)).toBeLessThan(75)
    expect(String(art?.props.source)).not.toContain('viewBox="0 -2 16 30"')
    await hud.unmount()

    expect((await run('name')).text).toBe('Your character is Thessaly Moonwhisper. Use /dm name <name> to rename it.')
  })

  test('the strip toggles the panel: Open panel, then Close panel', async ($, on) => {
    engine(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.close', () => ({ value: undefined }) as never)
    const strip = await $.ui.mount(band('desktop'))
    expect((await strip.find({ key: 'open' }))?.props.label).toBe('Open DM screen')
    await strip.press({ key: 'open' })
    expect((await strip.find({ key: 'open' }))?.props.label).toBe('Close DM screen')
    await strip.press({ key: 'open' })
    expect((await strip.find({ key: 'open' }))?.props.label).toBe('Open DM screen')
    await strip.unmount()
  })

  test('the Tome names every source of art with its licence, and links them', async ($, on) => {
    engine(on)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-settings' })
    expect(await said(view)).not.toContain('Lorc, Delapouite and Skoll')
    await view.press({ key: 'fold:tome-credits' })
    const page = await said(view)
    for (const part of ['0x72', 'CC0 1.0', 'Lorc, Delapouite and Skoll', 'CC BY 3.0', 'Cinzel Decorative', 'SIL Open Font Licence 1.1', 'Kenney', 'made for this mod']) {
      expect(page).toContain(part)
    }
    const links = (await view.findAll({ type: 'Link' })).map(link => String(link.props.href))
    expect(links).toContain('https://creativecommons.org/licenses/by/3.0/')
    expect(links).toContain('https://game-icons.net')
    expect(links.every(href => href.startsWith('https://'))).toBe(true)
    await view.unmount()
  })

  test('the strip can be handed back to the app', async ($, on) => {
    engine(on)
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    await $.command.run({ command: 'dm', args: 'hud off', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
    const strip = await $.ui.mount(band('desktop'))
    expect(await strip.find({ key: 'open' })).toBeUndefined()
    await strip.unmount()
  })

  test('the panel stays shut at the start when switched off', async ($, on) => {
    engine(on)
    const opened: string[] = []
    on('ui.open', ($, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.command.run({ command: 'dm', args: 'panel off', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    expect(opened).toEqual([])
  })
})

describe('/pals demo', () => {
  test('plays the bars and both compactions, then tidies itself away', async ($, on) => {
    const bench = engine(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const run = await $.command.run({ command: 'dm', args: 'demo', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
    expect(run.text).toContain('demo')

    const card = async (key: string) => {
      const view = await $.ui.mount(pane('desktop'))
      const text = JSON.stringify(await view.find({ key })).replace(/\u200b/g, '')
      await view.unmount()
      return text
    }
    expect(await card('hero:demo-1')).toContain('Context 65% left')
    expect(await card('camp:demo-camp-server')).toContain('the forge burns hot')
    const strip = async () => {
      const hud = await $.ui.mount(band('desktop'))
      const text = JSON.stringify(await hud.findAll({ type: 'Text' }))
      await hud.unmount()
      return text
    }
    expect(await strip()).toContain('Context 18% left')

    await bench.clock.advance(9000)
    expect(await card('hero:demo-3')).toContain('Condensing memories')
    expect(await strip()).toContain('Condensing memories')

    await bench.clock.advance(14_000)
    expect(await card('hero:demo-3')).toContain('Context 88% left')
    expect(await strip()).toContain('Context 91% left')
    expect(await card('camp:demo-camp-tests')).toContain('418 coins')

    await bench.clock.advance(18_000)
    const view = await $.ui.mount(pane('desktop'))
    expect(await view.find({ key: 'hero:demo-1' })).toBeUndefined()
    await view.unmount()
    expect(await strip()).toContain('Context: fresh')
  })
})

describe('what the person does from the panel', () => {
  test('Sounds off in Settings silences every sound, and back on again', async ($, on) => {
    const bench = engine(on)
    await spawn($, 'm1', 'First quest')
    {
      const ui = await $.ui.mount(pane('desktop'))
      await ui.press({ key: 'view-settings' })
      await ui.press({ key: 'switch:sound' })
      await ui.unmount()
    }

    await bench.clock.advance(5000)
    await spawn($, 'm2', 'Second quest')
    await $.classic.Notification(ask('m2'))
    await $.turn.complete(complete('m1', 'answer', 'Done.'))
    expect(bench.played).toEqual(['sounds/set-out.wav'])

    const ui = await $.ui.mount(pane('desktop'))
    await ui.press({ key: 'view-settings' })
    expect((await ui.find({ key: 'switch:sound' }))?.props.label).toBe('Off')
    await ui.press({ key: 'switch:sound' })
    expect((await ui.find({ key: 'switch:sound' }))?.props.label).toBe('On')
    await ui.unmount()
  })

  test('a permission request shows on the card and is always left to the app\'s own prompt', async ($, on) => {
    const bench = engine(on)
    bench.isPaneShown.value = true
    await spawn($, 'p3', 'Fetch a page')
    expect(await $.classic.Notification(ask('p3'))).toEqual({})
    const ui = await $.ui.mount(pane('desktop'))
    expect(await ui.find({ key: 'allow:p3' })).toBeUndefined()
    expect(await ui.find({ text: /1 needs you/ })).toBeDefined()
    expect(await ui.find({ text: /Asks:/ })).toBeDefined()
    await ui.unmount()
  })

  test('showcase draws only made-up content: no real hero, prompt or session shows', async ($, on) => {
    engine(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await spawn($, 'real1', 'Fix the secret billing bug')
    await $.turn.start({ turnId: 't1', text: 'Private: rotate the payroll keys' } as never)
    const run = await $.command.run({ command: 'dm', args: 'showcase', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
    expect(run.text).toContain('Showcase')
    const ui = await $.ui.mount(pane('desktop'))
    const party = await said(ui)
    expect(party).not.toMatch(/secret billing|payroll/)
    expect(party).toMatch(/Demo: guard the eastern gate/)
    await ui.press({ key: 'view-map' })
    const map = await said(ui)
    expect(map).not.toMatch(/secret billing|payroll/)
    expect(map).toMatch(/Riverford watchtower|riverford/i)
    await ui.unmount()
  })

  test('the panel only calls tools the rules allow, so nothing goes to a checker that costs tokens', async ($, on) => {
    const bench = engine(on)
    bench.allows.value = false
    await spawn($, 'o1', 'Survey the code')
    const ui = await $.ui.mount(pane('desktop'))
    expect(await ui.find({ key: 'orders:o1' })).toBeUndefined()
    await ui.press({ key: 'stop:o1' })
    expect(bench.stopped).toEqual([])
    expect(bench.toasts.join()).toContain('"TaskStop" to permissions.allow')
    await ui.unmount()
  })

  test('a finished quest earns its hero XP in the hall of fame', async ($, on) => {
    engine(on)
    await spawn($, 'f1', 'Scout the docs')
    await $.turn.complete(complete('f1', 'answer', 'Done.', true))
    const ui = await $.ui.mount(pane('desktop'))
    await ui.press({ key: 'view-fame' })
    expect(await said(ui)).toMatch(/Hall of Heroes/)
    expect(await ui.find({ text: /10 \/ 25 XP/ })).toBeDefined()
    expect(await said(ui)).not.toMatch(/tokens/)
    const hero = (await ui.findAll({ type: 'Button' })).map(b => String(b.key ?? '')).find(key => key.startsWith('fame-open:'))
    expect(hero).toBeDefined()
    await ui.press({ key: hero ?? '' })
    expect(await ui.find({ text: /Quests won/ })).toBeDefined()
    expect(await ui.find({ text: /15 XP to go/ })).toBeDefined()
    expect(await ui.findAll({ type: 'Text', text: /^Not yet called on a quest/ })).toHaveLength(HEROES.length - 1)
    await ui.press({ key: 'forget' })
    expect(await ui.findAll({ type: 'Text', text: /^Not yet called on a quest/ })).toHaveLength(HEROES.length - 1)
    await ui.press({ key: 'forget-yes' })
    expect(await ui.findAll({ type: 'Text', text: /^Not yet called on a quest/ })).toHaveLength(HEROES.length)
    await ui.unmount()
  })
})

describe('the party and the words', () => {
  test('live heroes are all different, and scouts explore', () => {
    const taken: number[] = []
    for (let i = 0; i < HEROES.length; i += 1) taken.push(assignHero(`agent-${i}`, 'general-purpose', taken))
    expect(new Set(taken).size).toBe(HEROES.length)
    expect(['Ranger', 'Rogue']).toContain(HEROES[assignHero('x', 'Explore', [])]?.title)
  })

  test('every hero and every stone draws', () => {
    for (let hero = 0; hero < HEROES.length; hero += 1) {
      for (const [isWaiting, frame] of [[false, 0], [false, 3], [true, 0], [true, 7]] as const) {
        const svg = heroSvg(hero, isWaiting, frame)
        expect(svg).toStartWith('<svg')
        expect(svg).toEndWith('</svg>')
        expect(svg).not.toMatch(/undefined|NaN/)
        expect(svg.length).toBeLessThan(131072)
      }
    }
    for (const ending of ['done', 'error', 'stopped'] as const) expect(graveSvg(ending)).not.toMatch(/undefined|NaN/)
  })

  test('a working hero walks: successive frames draw different sprites', () => {
    const frames = new Set([0, 1, 2, 3].map(frame => heroSvg(0, false, frame)))
    expect(frames.size).toBe(4)
    expect(heroSvg(0, false, 4)).toBe(heroSvg(0, false, 0))
  })

  test('costs follow the price table, and an unknown model shows tokens alone', () => {
    const haiku = priced(USAGE, 'claude-haiku-5-5')
    expect(Math.abs((haiku.cost ?? 0) - (12_000 * 0.1 + 40_000 * 0.01 + 3_000 * 0.5) / 1_000_000)).toBeLessThan(1e-12)
    expect(spend(haiku)).toBe('55k tokens ≈ <$0.01')
    const opus = priced({ ...USAGE, cache_creation_input_tokens: 10_000 }, 'claude-opus-5-5')
    expect(Math.abs((opus.cost ?? 0) - (12_000 * 4 + 10_000 * 5 + 40_000 * 0.2 + 3_000 * 20) / 1_000_000)).toBeLessThan(1e-12)
    expect(spend(priced(USAGE, 'some-other-model'))).toBe('55k tokens')
    expect(dollars(1.234)).toBe('≈ $1.23')
  })

  test('XP and levels', () => {
    expect(xpFor('done', 0)).toBe(10)
    expect(xpFor('done', 100)).toBe(30)
    expect(xpFor('stopped', 9)).toBe(2)
    expect([0, 24, 25, 99, 100, 225].map(levelOf)).toEqual([1, 1, 2, 2, 3, 4])
    expect(progressBar(0)).toBe('▱▱▱▱▱▱▱▱▱▱')
  })

  test('tool calls and asks read as plain words, and long words can wrap', () => {
    expect(describeCall('Read', { file_path: '/repo/apps/pricing.ts' })).toBe('reading pricing.ts')
    expect(describeCall('Bash', { command: 'pnpm test\nmore' })).toBe('running pnpm test')
    expect(describeCall('Bash', { command: 'sleep 5', description: 'Pause five seconds' })).toBe('pause five seconds')
    expect(describeCall('mcp__github__create_pull_request', {})).toBe('using create pull request (github)')
    expect(askPhrase('Edit', { file_path: '/a/b/c.ts' })).toBe('edit c.ts')
    expect(firstLine('\n## Heading\n- the finding')).toBe('the finding')
    expect(firstLine('## Only a heading')).toBe('Only a heading')
    expect(elapsed(65_000)).toBe('1m 05s')
    expect(softBreak('apps/arc-station/src/spine/registry/apps.ts')).toContain('/​')
    expect(softBreak('short words stay as they are')).toBe('short words stay as they are')
  })
})

describe('the map: every session, named by the app, and closable', () => {
  const APP = [
    { sessionId: 'local_aaa', title: 'Fix the field sheet', isArchived: false, lastActivityAt: '2026-10-11T08:00:00.000Z' },
    { sessionId: 'local_old', title: 'VAT registration', isArchived: false, lastActivityAt: '2026-10-04T15:06:07.687Z' },
    { sessionId: 'local_pin', title: 'App store submission', isArchived: false, pinned: true, lastActivityAt: '2026-09-25T10:05:54.992Z' },
  ]

  function appTools(on: On): { archived: string[] } {
    const calls = { archived: [] as string[] }
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__list_sessions' }, () => ({ result: [{ type: 'text', text: JSON.stringify(APP) }] }) as never)
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__archive_session' }, ($, e) => {
      calls.archived.push(String((e as unknown as { session_id: string }).session_id))
      return { result: [{ type: 'text', text: 'archived' }] } as never
    })
    return calls
  }

  test('idle sessions are one line each with the app titles; asleep ones fold away; Close asks once more, then archives', async ($, on) => {
    const bench = engine(on)
    await bench.clock.advance(1_000_000)
    realmFiles(on, {
      'sessions/a.json': JSON.stringify({ id: 'a', name: 'Riverford', opening: '<pasted_content id="x">', quest: '', status: 'idle', activity: '', context: null, isCompacting: false, party: 0, link: 'claude://claude.ai/epitaxy/local_aaa', updatedAt: 1_000_000 - 1000 }),
      'sessions/a-old.json': JSON.stringify({ id: 'a-old', name: 'Riverford', quest: '', status: 'idle', activity: '', context: null, isCompacting: false, party: 0, link: 'claude://claude.ai/epitaxy/local_aaa', updatedAt: 1_000_000 - 5000 }),
    })
    const calls = appTools(on)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start({ cwd: '/repo/Riverford', surface: 'desktop', isInteractive: true })

    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    expect(await view.find({ text: /1 pinned · 1 idle · 1 asleep/ })).toBeDefined()
    expect((await view.findAll({ type: 'Text' })).filter(t => /Fix the field sheet/.test(JSON.stringify(t)))).toHaveLength(1)
    expect(await said(view)).not.toContain('pasted_content')
    expect(await said(view)).not.toContain('Resting')
    expect((await view.find({ key: 'close:local_aaa' }))?.props.label).toBe('Archive')
    expect(await view.find({ key: 'archive-help-box' })).toBeUndefined()
    await view.press({ key: 'archive-help' })
    expect(JSON.stringify(await view.find({ key: 'archive-help-box' }))).toContain('mcp__ccd_session_mgmt__archive_session')
    await view.press({ key: 'archive-help' })
    expect(await view.find({ key: 'archive-help-box' })).toBeUndefined()
    expect(await view.find({ text: /VAT registration/ })).toBeUndefined()

    await view.press({ key: 'fold:asleep' })
    expect(await view.find({ text: /VAT registration/ })).toBeDefined()
    expect(await view.find({ text: /last active/ })).toBeDefined()
    expect(await view.find({ key: 'close:local_pin' })).toBeUndefined()

    await view.press({ key: 'close:local_old' })
    expect(calls.archived).toEqual(['local_old'])
    expect(await view.find({ text: /VAT registration/ })).toBeUndefined()
    expect(bench.toasts.at(-1)).toContain('Archived VAT registration')
    await view.unmount()
  })

  test('a refusal or silence from the app says so, and the session stays', async ($, on) => {
    const bench = engine(on)
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__list_sessions' }, () => ({ result: [{ type: 'text', text: JSON.stringify([{ sessionId: 'local_busy', title: 'Busy one', isArchived: false }, { sessionId: 'local_quiet', title: 'Quiet one', isArchived: false }]) }] }) as never)
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__archive_session' }, async ($, e) => {
      if ((e as unknown as { session_id: string }).session_id === 'local_busy') return { result: [{ type: 'text', text: 'Session is still working and was not archived.' }] } as never
      await new Promise(() => undefined)
      return { result: [] } as never
    })
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    await view.press({ key: 'fold:asleep' })
    await view.press({ key: 'close:local_busy' })
    expect(bench.toasts.at(-1)).toContain("Couldn't archive Busy one")
    expect(await view.find({ text: /Busy one/ })).toBeDefined()
    const pressing = view.press({ key: 'close:local_quiet' })
    await bench.clock.advance(21_000)
    await pressing
    expect(bench.toasts.at(-1)).toContain('no answer from the app')
    await view.unmount()
  })

  test('Archive all asks once more, then archives every asleep session but the pinned one', async ($, on) => {
    engine(on)
    const calls = appTools(on)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    expect((await view.find({ key: 'close-all:asleep' }))?.props.label).toBe('Archive all 2')
    await view.press({ key: 'close-all:asleep' })
    expect(calls.archived).toEqual([])
    expect((await view.find({ key: 'close-all-yes:asleep' }))?.props.label).toBe('Really archive 2?')
    await view.press({ key: 'close-all-yes:asleep' })
    expect(calls.archived.sort()).toEqual(['local_aaa', 'local_old'])
    expect(await view.find({ key: 'close-all:asleep' })).toBeUndefined()
    await view.unmount()
  })

  test('idle rows keep their places while check-ins come and go', async ($, on) => {
    const bench = engine(on)
    await bench.clock.advance(1_000_000)
    const row = (id: string, title: string, at: number) =>
      JSON.stringify({ id, name: 'Riverford', opening: title, quest: '', status: 'idle', activity: '', context: null, isCompacting: false, party: 0, updatedAt: at })
    const files = realmFiles(on, { 'sessions/z.json': row('z', 'Zebra work', 999_000), 'sessions/a.json': row('a', 'Alpha work', 998_000), 'sessions/m.json': row('m', 'Middle work', 997_000) })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start({ cwd: '/repo/Riverford', surface: 'desktop', isInteractive: true })
    const order = async () => {
      const view = await $.ui.mount(pane('desktop'))
      await view.press({ key: 'view-map' })
      const keys = (await view.findAll({ type: 'Box' })).map(box => String(box.key ?? '')).filter(key => key.startsWith('row:'))
      await view.unmount()
      return keys
    }
    expect(await order()).toEqual(['row:a', 'row:m', 'row:z'])
    files['sessions/m.json'] = row('m', 'Middle work', 1_000_500)
    await bench.clock.advance(5000)
    expect(await order()).toEqual(['row:a', 'row:m', 'row:z'])
  })

  test('archived sessions fold into their own list, and Restore brings one back', async ($, on) => {
    const bench = engine(on)
    const restored: string[] = []
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__list_sessions' }, () =>
      ({
        result: [{ type: 'text', text: JSON.stringify([...APP, { sessionId: 'local_gone', title: 'Old smoke test', isArchived: true, lastActivityAt: '2026-10-01T10:00:00.000Z' }]) }],
      }) as never,
    )
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__unarchive_session' }, ($, e) => {
      restored.push(String((e as unknown as { session_id: string }).session_id))
      return { result: [{ type: 'text', text: 'Restored session local_gone.' }] } as never
    })
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    expect(await said(view)).toMatch(/Archived/)
    expect(await view.find({ text: /Old smoke test/ })).toBeUndefined()
    await view.press({ key: 'fold:archived' })
    expect(await view.find({ text: /Old smoke test/ })).toBeDefined()
    await view.press({ key: 'restore:local_gone' })
    expect(restored).toEqual(['local_gone'])
    expect(bench.toasts.at(-1)).toContain('Restored Old smoke test')
    expect(await view.find({ key: 'restore:local_gone' })).toBeUndefined()
    await view.unmount()
  })

  test('a session the app keeps says so in plain words', async ($, on) => {
    const bench = engine(on)
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__list_sessions' }, () => ({ result: [{ type: 'text', text: JSON.stringify([{ sessionId: 'local_keep', title: 'Entedi Time sheets', isArchived: false }]) }] }) as never)
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__archive_session' }, () =>
      ({ result: [{ type: 'text', text: '"Error: Session local_keep (\\"Entedi Time sheets\\") was not archived: the app is keeping it for the user (pinned or in use)."' }] }) as never,
    )
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    await view.press({ key: 'fold:asleep' })
    await view.press({ key: 'close:local_keep' })
    expect(bench.toasts.at(-1)).toContain('the app keeps this one')
    await view.unmount()
  })

  test('pinned sessions, and ones the app refused, sit in their own Pinned band with no Archive', async ($, on) => {
    engine(on)
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__list_sessions' }, () =>
      ({
        result: [{ type: 'text', text: JSON.stringify([...APP, { sessionId: 'local_keep', title: 'Entedi Time sheets', isArchived: false }]) }],
      }) as never,
    )
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__archive_session' }, () =>
      ({ result: [{ type: 'text', text: '"Error: Session local_keep was not archived: the app is keeping it for the user (pinned or in use)."' }] }) as never,
    )
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    expect(await view.find({ text: /1 pinned/ })).toBeDefined()
    expect(await view.find({ key: 'row:pinned-local_pin' })).toBeDefined()
    expect(await view.find({ key: 'close:local_pin' })).toBeUndefined()
    await view.press({ key: 'fold:asleep' })
    await view.press({ key: 'close:local_keep' })
    expect(await view.find({ key: 'row:pinned-local_keep' })).toBeDefined()
    expect(await view.find({ key: 'close:local_keep' })).toBeUndefined()
    expect(await view.find({ text: /2 pinned/ })).toBeDefined()
    await view.unmount()
  })

  test('a list too big for one answer is read from the file the app saved it to', async ($, on) => {
    engine(on)
    const saved = '/Users/n/.claude/projects/x/tool-results/mcp-ccd_session_mgmt-list_sessions-1.txt'
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__list_sessions' }, () =>
      ({ result: [{ type: 'text', text: `Error: result (131,378 characters across 3,551 lines) exceeds maximum allowed tokens. Output has been saved to ${saved}.\nFormat: Plain text` }] }) as never,
    )
    on('fs.stat', () => ({ value: { size: 2000, kind: 'file', mtimeMs: 0, isLink: false } }) as never)
    on('env.get', ($, e) => ({ value: (e as unknown as { name: string }).name === 'HOME' ? '/Users/n' : undefined }) as never)

    on('fs.read', ($, e) => {
      if (String(e.path) !== saved) throw new Error('ENOENT')
      return { value: JSON.stringify([...APP, { sessionId: 'local_gone', title: 'Old smoke test', isArchived: true }]) } as never
    })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    expect(await view.find({ text: /1 pinned · 2 asleep/ })).toBeDefined()
    expect(await view.find({ key: 'row:pinned-local_pin' })).toBeDefined()
    await view.press({ key: 'fold:archived' })
    expect(await view.find({ text: /Old smoke test/ })).toBeDefined()
    await view.unmount()
  })

  test('every section folds and unfolds, and stays as you left it', async ($, on) => {
    engine(on)
    appTools(on)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    expect(await view.find({ key: 'row:pinned-local_pin' })).toBeDefined()
    expect((await view.find({ key: 'fold:pinned' }))?.props.label).toBe('▾')
    expect((await view.find({ key: 'fold:asleep' }))?.props.label).toBe('▸')
    await view.press({ key: 'fold:pinned' })
    expect(await view.find({ key: 'row:pinned-local_pin' })).toBeUndefined()
    expect(await view.find({ text: /1 · kept by the app/ })).toBeDefined()
    await view.unmount()
    const again = await $.ui.mount(pane('desktop'))
    expect(await again.find({ key: 'row:pinned-local_pin' })).toBeUndefined()
    await again.press({ key: 'fold:pinned' })
    expect(await again.find({ key: 'row:pinned-local_pin' })).toBeDefined()
    await again.unmount()
  })

  test('a long section shows 20 rows at a time, with a button for more', async ($, on) => {
    engine(on)
    const many = Array.from({ length: 45 }, (_, i) => ({ sessionId: `local_s${String(i).padStart(2, '0')}`, title: `Session ${String(i).padStart(2, '0')}`, isArchived: false }))
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__list_sessions' }, () => ({ result: [{ type: 'text', text: JSON.stringify(many) }] }) as never)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    await view.press({ key: 'fold:asleep' })
    const rows = async () => (await view.findAll({ type: 'Box' })).filter(box => String(box.key ?? '').startsWith('row:local_s')).length
    expect(await rows()).toBe(20)
    expect((await view.find({ key: 'more-rows:asleep' }))?.props.label).toBe('Show 20 more (25 left)')
    await view.press({ key: 'more-rows:asleep' })
    expect(await rows()).toBe(40)
    await view.press({ key: 'more-rows:asleep' })
    expect(await rows()).toBe(45)
    expect(await view.find({ key: 'more-rows:asleep' })).toBeUndefined()
    await view.press({ key: 'fold:asleep' })
    expect(await rows()).toBe(0)
    await view.press({ key: 'fold:asleep' })
    expect(await rows()).toBe(45)
    await view.unmount()
  })

  test('the map’s own calls never count as the Overlord’s work', async ($, on) => {
    engine(on)
    appTools(on)
    await $.turn.start({ text: 'Fix it', turnId: 'm1' })
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    await view.unmount()
    const strip = await $.ui.mount(band('desktop'))
    expect(await strip.find({ text: /list_sessions/ })).toBeUndefined()
    await strip.unmount()
  })
})


describe('glory: volume, critical rolls, levels, achievements and names', () => {
  const steps = async ($: Engine, agentId: string, count: number) => {
    for (let i = 0; i < count; i++) await $.tool.call({ tool: 'Read', file_path: `/repo/f${i}.ts`, agentId } as never)
  }

  test('the volume sets how loud every sound plays, and Test plays one', async ($, on) => {
    const bench = engine(on)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-settings' })
    await view.press({ key: 'volume-down' })
    await view.press({ key: 'volume-down' })
    expect(await view.find({ text: /^40%: how loud/ })).toBeDefined()
    await view.press({ key: 'volume-test' })
    await view.unmount()
    expect(bench.played.at(-1)).toBe('sounds/done.wav')
    expect(Math.round((bench.gains.at(-1) ?? 0) * 100)).toBe(40)
  })

  test('a long quest won rolls a natural 20; a fallen hero rolls a natural 1', async ($, on) => {
    const bench = engine(on)
    await spawn($, 'c1', 'Rebuild the index')
    await steps($, 'c1', 20)
    await $.turn.complete(complete('c1', 'answer', 'Done.'))
    expect(bench.toasts.some(text => text.startsWith('Natural 20!'))).toBe(true)
    expect(bench.played).toContain('sounds/critical.wav')
    const strip = await $.ui.mount(band('desktop'))
    expect(await strip.find({ text: /Natural 20!/ })).toBeDefined()
    expect((await strip.find({ type: 'Svg' }))?.props.alt).toBe('The Overlord, your character')
    await strip.unmount()
    await bench.clock.advance(7000)
    const later = await $.ui.mount(band('desktop'))
    expect(await later.find({ text: /Natural 20!/ })).toBeUndefined()
    await later.unmount()

    await spawn($, 'c2', 'Try the impossible')
    await $.turn.complete(complete('c2', 'error', 'It broke.'))
    expect(bench.toasts.some(text => text.startsWith('Natural 1.'))).toBe(true)
  })

  test('reaching a new level plays the fanfare and says so', async ($, on) => {
    const bench = engine(on)
    for (const id of ['l1', 'l2', 'l3', 'l4']) {
      await spawn($, id, `Errand ${id}`)
      await steps($, id, 20)
      await $.turn.complete(complete(id, 'answer', 'Done.'))
      await bench.clock.advance(5000)
    }
    const levelled = bench.toasts.filter(text => / reached level 2!$/.test(text))
    expect(levelled.length).toBeGreaterThan(0)
    expect(bench.played).toContain('sounds/level-up.wav')
  })

  test('achievements unlock once, with a toast, and show in the Hall of Heroes', async ($, on) => {
    const bench = engine(on)
    await bench.clock.advance(12 * 60 * 60_000)
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) await spawn($, id, `Errand ${id}`)
    expect(bench.toasts.filter(text => text.startsWith('Achievement unlocked: Full Party')).length).toBe(1)
    await $.turn.complete(complete('p1', 'answer', 'Done.'))
    await $.turn.complete(complete('p2', 'answer', 'Done.'))
    expect(bench.toasts.filter(text => text.startsWith('Achievement unlocked: First Blood')).length).toBe(1)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-fame' })
    expect(await view.find({ text: /2 of 10 earned/ })).toBeDefined()
    expect(await view.find({ text: /^First Blood$/ })).toBeDefined()
    expect(await view.find({ text: /^Legend · not yet$/ })).toBeDefined()
    expect(await view.find({ text: /^Night Owl · not yet$/ })).toBeDefined()
    await view.unmount()
  })

  test('a session can be given your own name on the map, and the name can be cleared', async ($, on) => {
    engine(on)
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__list_sessions' }, () =>
      ({ result: [{ type: 'text', text: JSON.stringify([{ sessionId: 'local_vat', title: 'VAT registration for Riverford', isArchived: false }]) }] }) as never,
    )
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    await view.press({ key: 'fold:asleep' })
    await view.press({ key: 'rename-open:local_vat' })
    await view.input({ key: 'rename-input:local_vat', text: '  The   Tax Collector  ' })
    expect(await view.find({ text: /^The Tax Collector$/ })).toBeDefined()
    expect(await view.find({ text: /VAT registration/ })).toBeUndefined()
    await view.press({ key: 'rename-open:local_vat' })
    await view.input({ key: 'rename-input:local_vat', text: '   ' })
    expect(await view.find({ text: /VAT registration/ })).toBeDefined()
    await view.unmount()
  })
})


describe('safety', () => {
  test('a "saved to" path inside a session title is never read', async ($, on) => {
    engine(on)
    const reads: string[] = []
    on('tool.call', { tool: 'mcp__ccd_session_mgmt__list_sessions' }, () =>
      ({ result: [{ type: 'text', text: JSON.stringify([{ sessionId: 'local_t', title: 'Output has been saved to /Users/n/secret.txt.', isArchived: false }]) }] }) as never,
    )
    on('fs.read', ($, e) => {
      reads.push(String(e.path))
      throw new Error('ENOENT')
    })
    on('env.get', ($, e) => ({ value: (e as unknown as { name: string }).name === 'HOME' ? '/Users/n' : undefined }) as never)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-map' })
    expect(reads.some(path => path.includes('secret'))).toBe(false)
    await view.unmount()
  })

  test('/clear keeps this session on the map; a real exit takes it off', async ($, on) => {
    engine(on)
    const files = realmFiles(on, {})
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.end', () => ({ sessionId: 'next' }) as never)
    await $.session.start({ cwd: '/repo/Riverford', surface: 'desktop', isInteractive: true })
    expect(JSON.parse(files['sessions/local_me.json'] ?? '{}').hasEnded).toBeUndefined()
    await $.session.end({ reason: 'clear' } as never)
    expect(JSON.parse(files['sessions/local_me.json'] ?? '{}').hasEnded).toBeUndefined()
    await $.session.end({ reason: 'other' } as never)
    expect(JSON.parse(files['sessions/local_me.json'] ?? '{}').hasEnded).toBe(true)
  })

  test('no prompt text is written to the check-in file', async ($, on) => {
    const bench = engine(on)
    const files = realmFiles(on, {})
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo/Riverford', surface: 'desktop', isInteractive: true })
    await $.turn.start({ text: 'My bank password is hunter2', turnId: 't1' })
    await bench.clock.advance(6000)
    expect(files['sessions/local_me.json']).toBeDefined()
    expect(Object.values(files).join('\n')).not.toContain('hunter2')
  })
})


describe('steady clicks', () => {
  test('at work the party page heroes step on the frame timer, and a redraw between ticks changes nothing', async ($, on) => {
    const bench = engine(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    await spawn($, 'w1', 'Walk the walls')
    const heroNow = async () => {
      const view = await $.ui.mount(pane('desktop'))
      const hero = (await view.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).includes(' the '))
      const source = String(hero?.props.source)
      await view.unmount()
      return source
    }
    const first = await heroNow()
    expect(first).not.toContain('<animate')
    expect(await heroNow()).toBe(first)
    await bench.clock.advance(FRAME_MS)
    expect(await heroNow()).not.toBe(first)
  })

  test('the gravestone being read is framed and marked', async ($, on) => {
    engine(on)
    await spawn($, 'g1', 'Brave the crypt')
    await $.turn.complete(complete('g1', 'answer', 'Done.'))
    const view = await $.ui.mount(pane('desktop'))
    const key = (await view.findAll({ type: 'Button' })).map(b => String(b.key ?? '')).find(k => k.startsWith('visit:')) ?? ''
    const before = String((await view.find({ key }))?.props.label)
    await view.press({ key })
    expect(String((await view.find({ key }))?.props.label)).toBe(`▾ ${before}`)
    expect((await view.find({ key }))?.props.variant).toBe('primary')
    await view.unmount()
  })
})


describe('light mode and accessibility', () => {
  test('the DM screen always follows the app: a light app gets the light version of the theme', async ($, on) => {
    engine(on)
    on('env.get', ($, e) => ({ value: (e as unknown as { name: string }).name === 'HOME' ? '/Users/n' : undefined }) as never)
    on('fs.read', ($, e) => {
      if (String(e.path) === '/Users/n/Library/Application Support/Claude/config.json') return { value: JSON.stringify({ userThemeMode: 'light' }) } as never
      throw new Error('ENOENT')
    })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
    const view = await $.ui.mount(pane('desktop'))
    const root = await view.findAll({ type: 'Box' })
    expect(String(root[0]?.props.backgroundColor)).toBe('#F1EEE9')
    await view.press({ key: 'view-settings' })
    expect(await view.find({ key: 'panel-mode:dark' })).toBeUndefined()
    await view.unmount()
  })

  test('no button anywhere is drawn dimmed', async ($, on) => {
    engine(on)
    await spawn($, 'b1', 'Count the buttons')
    for (const page of ['view-party', 'view-map', 'view-fame', 'view-settings']) {
      const view = await $.ui.mount(pane('desktop'))
      await view.press({ key: page })
      for (const button of await view.findAll({ type: 'Button' })) expect(button.props.dimColor).toBeUndefined()
      await view.unmount()
    }
    const strip = await $.ui.mount(band('desktop'))
    for (const button of await strip.findAll({ type: 'Button' })) expect(button.props.dimColor).toBeUndefined()
    await strip.unmount()
  })

  test('every palette, dark and light, keeps text readable (WCAG AA)', async () => {
    const { THEMES, LIGHT_THEMES } = await import('../hooks/themes')
    const lum = (hex: string) => {
      const c = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
      return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0)
    }
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)]
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    for (const set of [THEMES, LIGHT_THEMES]) {
      for (const look of Object.values(set)) {
        for (const text of [look.text, look.name, look.dim]) {
          expect(ratio(text, look.panel)).toBeGreaterThan(4.5)
          expect(ratio(text, look.card)).toBeGreaterThan(4.5)
        }
        expect(ratio(look.code, look.inset)).toBeGreaterThan(7)
        expect(ratio(look.codeDim, look.inset)).toBeGreaterThan(4.5)
      }
    }
  })
})


describe('one breakpoint', () => {
  test('every row of words and buttons flips together at the breakpoint', async ($, on) => {
    engine(on)
    const at = (columns: number) => ({ ...pane('desktop'), props: { ...pane('desktop').props, bodyColumns: columns } })
    for (const [columns, direction] of [[50, 'column'], [100, 'row']] as const) {
      const view = await $.ui.mount(at(columns))
      await view.press({ key: 'view-settings' })
      const rows = (await view.findAll({ type: 'Box' })).filter(box => /^setting:|^volume$/.test(String(box.key ?? '')))
      expect(rows.length).toBeGreaterThan(5)
      expect(rows.every(box => box.props.flexDirection === direction)).toBe(true)
      await view.unmount()
    }
  })
})


describe('the Tome folds', () => {
  test('every section folds except Choose your character', async ($, on) => {
    engine(on)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-settings' })
    expect(await view.find({ key: 'fold:tome-character' })).toBeUndefined()
    for (const key of ['fold:tome-At the table', 'fold:tome-The look', 'fold:tome-The DM screen', 'fold:tome-sections', 'fold:tome-credits']) {
      expect(await view.find({ key })).toBeDefined()
    }
    expect(await view.find({ key: 'switch:dice' })).toBeDefined()
    await view.press({ key: 'fold:tome-At the table' })
    expect(await view.find({ key: 'switch:dice' })).toBeUndefined()
    expect(await view.find({ key: 'look-next' })).toBeDefined()
    await view.unmount()
  })
})

describe('the version', () => {
  test('the Tome shows the version and who made the mod', async ($, on) => {
    expect(MOD.version).toMatch(/^\d+\.\d+\.\d+$/)
    engine(on)
    const view = await $.ui.mount(pane('desktop'))
    await view.press({ key: 'view-settings' })
    expect(await view.find({ text: `${MOD.name} ${MOD.version}, made by ${MOD.author}. To update: claude plugin update dungeon-master@nicbritz-mods` })).toBeDefined()
    await view.unmount()
  })
})
