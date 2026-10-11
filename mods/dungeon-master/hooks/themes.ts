// The realm's looks, chosen in Settings and kept in
// ~/.claude/realm/settings.json with the rest of the switches. Every look is
// dark-backed: the desktop draws its buttons as light text on a see-through
// fill, so a light panel makes them unreadable (the old parchment did). Every
// text colour passes 4.5:1 on panel and card, white passes 14:1; `inset` is the opened row's details panel, where `code` and `codeDim` read
// at 10:1 or better, for long command and output text.

export const THEMES = {
  dungeon: { panel: '#3B332B', card: '#2E2822', frame: '#8C7A62', text: '#E8DCC4', name: '#F0A04B', dim: '#B4A68C', inset: '#1C1814', code: '#F5EEDF', codeDim: '#D9CBB0' },
  tavern: { panel: '#3A2618', card: '#2C1C11', frame: '#A0703C', text: '#F3E3C8', name: '#F5B651', dim: '#CDB08A', inset: '#1A0F08', code: '#FBF1DE', codeDim: '#E2CFAE' },
  underdark: { panel: '#1F1830', card: '#171126', frame: '#6B4FA0', text: '#E6DEF7', name: '#C9A2FF', dim: '#AC9ECB', inset: '#0D0918', code: '#F3EEFF', codeDim: '#CFC4EA' },
  dragonfire: { panel: '#2A1210', card: '#200C0B', frame: '#A3352A', text: '#F6E2D6', name: '#FF8F52', dim: '#D2A898', inset: '#120605', code: '#FFF1E8', codeDim: '#E6C4B6' },
  frostkeep: { panel: '#14243A', card: '#0F1C2E', frame: '#5C86B0', text: '#E3F0FB', name: '#9FD9FF', dim: '#A6C0D8', inset: '#08111D', code: '#F2F8FD', codeDim: '#C8DAEA' },
  feywild: { panel: '#12302B', card: '#0D2521', frame: '#3E9A86', text: '#E2F6EF', name: '#F4C3EA', dim: '#9DCABD', inset: '#06150F', code: '#F0FBF7', codeDim: '#C3E3D8' },
  arcane: { panel: '#1A1F3A', card: '#141831', frame: '#8C7BD0', text: '#ECE8FF', name: '#EBC86E', dim: '#AFA9D7', inset: '#0A0D20', code: '#F6F4FF', codeDim: '#D0CCEC' },
  tome: { panel: '#33261A', card: '#281D13', frame: '#B08D57', text: '#EFE2C0', name: '#E8B65E', dim: '#C6B088', inset: '#170F08', code: '#FAF1DA', codeDim: '#E0CFA8' },
  celestial: { panel: '#1B2A6B', card: '#14205A', frame: '#E8E4D8', text: '#FFFFFF', name: '#FFE08A', dim: '#AAB4E8', inset: '#0E1640', code: '#FFFFFF', codeDim: '#D7DDF7' },
  wildwood: { panel: '#16301F', card: '#10261A', frame: '#5B7F4A', text: '#E3EFD8', name: '#E9C46A', dim: '#9DB58C', inset: '#0A1A10', code: '#F0F7EA', codeDim: '#C9DDBB' },
} as const

// The same ten looks for an app in light mode: the app then draws its buttons
// for a light background, so the panel turns light too. Generated from each
// theme's frame and accent hue and checked like the dark ones: every text
// colour at least 4.6:1 on panel and card, code at least 7:1 on the inset.
export const LIGHT_THEMES: Record<keyof typeof THEMES, Palette> = {
  dungeon: { panel: '#F1EEE9', card: '#E7E1DA', frame: '#8C7A62', text: '#27221B', name: '#91500C', dim: '#6F614E', inset: '#F8F7F7', code: '#211B12', codeDim: '#604F39' },
  tavern: { panel: '#F3EDE7', card: '#EBE1D6', frame: '#A0703C', text: '#2E2214', name: '#8B5908', dim: '#7C5D3B', inset: '#F9F7F6', code: '#211A12', codeDim: '#604D39' },
  underdark: { panel: '#EBE8F3', card: '#DED7EA', frame: '#6B4FA0', text: '#1E162C', name: '#730EFF', dim: '#5B4389', inset: '#F7F6F9', code: '#171221', codeDim: '#473960' },
  dragonfire: { panel: '#F3E8E7', card: '#EBD8D6', frame: '#A3352A', text: '#2E1614', name: '#A93B00', dim: '#8A4942', inset: '#FAF6F5', code: '#211312', codeDim: '#603D39' },
  frostkeep: { panel: '#E8EDF3', card: '#D7E0EA', frame: '#5581AD', text: '#16212D', name: '#0063A4', dim: '#416386', inset: '#F6F7F9', code: '#121921', codeDim: '#394C60' },
  feywild: { panel: '#E7F3F1', card: '#D6EBE6', frame: '#3A8F7D', text: '#142E29', name: '#B52197', dim: '#356E62', inset: '#F6F9F8', code: '#12211E', codeDim: '#355A51' },
  arcane: { panel: '#E9E7F3', card: '#DAD6EB', frame: '#7F6CCB', text: '#19142E', name: '#735710', dim: '#51428A', inset: '#F6F6F9', code: '#151221', codeDim: '#413960' },
  tome: { panel: '#F3EEE8', card: '#EAE2D7', frame: '#9B7A49', text: '#2D2415', name: '#865C13', dim: '#79603A', inset: '#F9F8F6', code: '#211B12', codeDim: '#605139' },
  celestial: { panel: '#F2EFE9', card: '#E8E4D9', frame: '#908155', text: '#2A2519', name: '#805E00', dim: '#6D6241', inset: '#F8F8F6', code: '#211D12', codeDim: '#5D5337' },
  wildwood: { panel: '#EBF2E9', card: '#DEE8D8', frame: '#5B7F4A', text: '#1E2A18', name: '#7F5F13', dim: '#4C6A3E', inset: '#F7F8F6', code: '#172112', codeDim: '#415A35' },
}

// The palette for this theme in this mode.
export const paletteOf = (theme: ThemeName, isLight: boolean): Palette => (isLight ? LIGHT_THEMES[theme] : THEMES[theme])

// What each look is, in a few words, for the Settings page.
export const THEME_BLURBS: Record<keyof typeof THEMES, string> = {
  dungeon: 'Torchlit stone of the deep halls',
  tavern: 'Dark oak and ale by the hearth',
  underdark: 'Violet caverns below the world',
  dragonfire: "Ember and ash of a dragon's lair",
  frostkeep: 'Ice and moonlight on the northern walls',
  feywild: 'Twilight in the faerie glade',
  arcane: "A wizard's midnight tower",
  tome: 'Old leather and parchment ink',
  celestial: 'Silver and starlight of the upper planes',
  wildwood: "A ranger's deep forest",
}

export type ThemeName = keyof typeof THEMES
export type Palette = { readonly panel: string; readonly card: string; readonly frame: string; readonly text: string; readonly name: string; readonly dim: string; readonly inset: string; readonly code: string; readonly codeDim: string }

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[]
export const DEFAULT_THEME: ThemeName = 'dungeon'

export const isThemeName = (value: unknown): value is ThemeName => typeof value === 'string' && Object.hasOwn(THEMES, value)

// Looks that were retired, and what replaced them.
const RENAMED: Record<string, ThemeName> = { jrpg: 'celestial', forest: 'wildwood' }

export function asThemeName(value: unknown): ThemeName | null {
  if (isThemeName(value)) return value
  return typeof value === 'string' && Object.hasOwn(RENAMED, value) ? (RENAMED[value] ?? null) : null
}


// theme.json as written, read leniently: anything unknown is the default.
export function readTheme(text: string | null): ThemeName {
  if (text === null) return DEFAULT_THEME
  try {
    const value = (JSON.parse(text) as { theme?: unknown }).theme
    return asThemeName(value) ?? DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}
