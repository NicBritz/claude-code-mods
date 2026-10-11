import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { DEFAULT_SETTINGS, readSettings, settingsWords } from '../hooks/settings'

describe('the folder from before 3.0', () => {
  test('settings and names from <config>/realm are carried across once, never over newer ones', async ($, on) => {
    const written: Record<string, string> = {}
    mock.clock(on)
    mock.store(on)
    on('session.start', () => ({ cwd: '/repo' }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('tool.register', () => ({ value: undefined }) as never)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.status', () => ({ value: undefined }))
    on('env.get', ($, e) => ({ value: (e as unknown as { name: string }).name === 'HOME' ? '/home/ada' : undefined }) as never)
    on('fs.exists', ($, e) => ({ value: String(e.path) in written }) as never)
    on('fs.list', () => ({ value: [] }) as never)
    on('fs.read', ($, e) => {
      const path = String(e.path)
      if (path in written) return { value: written[path] } as never
      if (path === '/home/ada/.claude/realm/settings.json') return { value: JSON.stringify({ theme: 'forest', sound: false }) } as never
      throw new Error('ENOENT')
    })
    on('fs.write', ($, e) => {
      written[String(e.path)] = String(e.text)
      return { value: undefined }
    })
    await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
    const saved = readSettings(written['/home/ada/.claude/dungeon-master/settings.json'] ?? null)
    expect(saved).toMatchObject({ theme: 'wildwood', sound: false })
    expect(Object.keys(written).some(path => path.includes('/.claude/realm/'))).toBe(false)
  })
})

describe('the settings words', () => {
  test('read leniently: unknown keys and values fall back to the defaults', () => {
    expect(readSettings('not json')).toEqual(DEFAULT_SETTINGS)
    expect(readSettings({ theme: 'jrpg' }).theme).toBe('celestial')
    expect(readSettings({ theme: 'forest' }).theme).toBe('wildwood')
    expect(readSettings({ dice: 'yes', theme: 'neon', hidden: ['camp', 7], hud: false })).toEqual({ ...DEFAULT_SETTINGS, hidden: ['camp'], hud: false })
  })

  test('one line says what is on and off', () => {
    expect(settingsWords({ ...DEFAULT_SETTINGS, dice: false })).toContain('Off: Rolling d20')
    expect(settingsWords(DEFAULT_SETTINGS)).toContain('Theme: dungeon')
  })
})
