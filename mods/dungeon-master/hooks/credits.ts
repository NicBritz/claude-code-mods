// The credits the DM's Tome shows: every piece of art the mod did not make,
// who made it, under what licence, and what was changed. CREDITS.md and the
// files in licences/ hold the full texts.

// Who made the mod and which version this is. VERSION must match
// .claude-plugin/plugin.json (a test checks), so the Tome shows the version
// that is actually installed.
export const MOD = {
  name: 'Dungeon Master',
  version: '3.8.0',
  author: 'Nico Britz',
  authorUrl: 'https://github.com/NicBritz',
  licence: 'MIT',
  repository: 'https://github.com/NicBritz/claude-code-mods',
} as const

export type Credit = { what: string; who: string; licence: string; licenceUrl: string; source: string; changes: string }

export const CREDITS: readonly Credit[] = [
  {
    what: 'Heroes, the Overlord, the skull on the gravestones and tool-row items',
    who: '0x72, "16x16 DungeonTileset II"',
    licence: 'CC0 1.0 (public domain)',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'https://0x72.itch.io/dungeontileset-ii',
    changes: 'Some heroes recoloured, small weapons and instruments drawn in the pack\'s palette.',
  },
  {
    what: 'D&D icons and the d20',
    who: 'Lorc, Delapouite and Skoll, game-icons.net',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source: 'https://game-icons.net',
    changes: 'Recoloured to each theme; the d20 turns and shows a rolled number.',
  },
  {
    what: 'The "Fantasy" heading lettering',
    who: 'Natanael Gama, Cinzel Decorative Bold',
    licence: 'SIL Open Font Licence 1.1',
    licenceUrl: 'https://openfontlicense.org',
    source: 'https://fonts.google.com/specimen/Cinzel+Decorative',
    changes: 'Letter outlines converted to drawings; the converted font stays under the same licence and does not use the reserved name.',
  },
  {
    what: 'Sound effects: blades, coins, bells, doors and dice',
    who: 'Kenney, "RPG Audio" and "Impact Sounds"',
    licence: 'CC0 1.0 (public domain)',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'https://kenney.nl/assets/rpg-audio',
    changes: 'Trimmed, layered with horn and lute phrases made for this mod, and made quiet.',
  },
]

export const OWN_WORK = 'Everything else (the themes, the icon, the horn and lute phrases, the gravestones and the rest) was made for this mod by Nico Britz.'
