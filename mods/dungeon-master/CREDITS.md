# Credits

## Heroes and sounds

Hero sprites (`hooks/sprites.ts`) are converted from **16x16 DungeonTileset II** by 0x72,
https://0x72.itch.io/dungeontileset-ii, released under CC0 1.0 (public domain).
Credit is not required; it is given here because it is deserved.

The gravestones are drawn for this mod in the pack's own wall colours and outline, around the pack's skull.

The listing icon (`.claude-plugin/icon.png`, source `tools/icon.svg`), a d20 with pixel numbers, is drawn for this mod
and uses no one else's art.

The overlord is 0x72's `big_demon`, from the same pack.

The sound effects in `sounds/` are Kenney CC0 samples layered with short phrases synthesised for this mod; see "Sounds" below.

## D&D icons

The D&D icons (`hooks/inked.ts`, made by `tools/make-inked.py`) are from **game-icons.net**,
https://game-icons.net, under Creative Commons Attribution 3.0 (CC BY 3.0,
https://creativecommons.org/licenses/by/3.0/). Icons by **Lorc**
(crossed swords, broadsword, treasure map, cog, lever, campfire, knapsack, unfurled and tied
scrolls, tombstone, skull and crossbones, hourglass, ringing bell, dragon head), **Delapouite**
(castle, position marker, laurels trophy, magic potion, two coins, d20, spell book) and **Skoll**
(hearts, open treasure chest). Recoloured to each theme. Full licence: `licences/game-icons-license.txt`.

## Fantasy headings

The "Fantasy" heading lettering (`hooks/fantasy-font.ts`, made by `tools/make-font.py`) is converted
from **Cinzel Decorative Bold**, Copyright (c) 2012 Natanael Gama, with Reserved Font Name 'Cinzel',
under the SIL Open Font Licence 1.1. The converted outlines are a Modified Version under that licence,
are themselves licensed under it, and do not use the reserved name (the mod calls them "Fantasy").
Full licence: `licences/CinzelDecorative-OFL.txt`.

## Class heroes

The twelve class heroes (`hooks/sprites.ts`, made by `tools/make-heroes.py`) are all from
**16x16 DungeonTileset II** v1.7 by **0x72**, https://0x72.itch.io/dungeontileset-ii, under
CC0 1.0 (asset licence as stated on the pack's page; see `licences/0x72-DungeonTilesetII-CC0.txt`).
Bodies used: knight_m (Fighter), knight_f (Paladin), wizzard_m (Wizard), wizzard_f (Sorcerer),
elf_m (Ranger), elf_f (Bard), dwarf_m (Barbarian), orc_shaman (Druid), lizard_f (Monk),
doc (Rogue), necromancer (Warlock) and angel (Cleric). The Paladin, Sorcerer, Bard, Druid, Monk
and Rogue are recoloured for this mod, and the small held weapons (sword, mace, bow, lute, axe,
staff, dagger) are drawn for this mod in the pack's palette.

## Sounds

The seven sound effects in `sounds/` (made by `sounds/make-sounds.py`) use samples from two packs by
**Kenney** (www.kenney.nl), both under CC0 1.0 (public domain): **RPG Audio**,
https://kenney.nl/assets/rpg-audio, and **Impact Sounds** 1.0, https://kenney.nl/assets/impact-sounds.
Credit is not required; it is given here because it is deserved. Licence text from both packs:
`licences/Kenney-CC0.txt`.

- `set-out.wav`: drawKnife2 (RPG Audio), then a soft two-note horn call.
- `done.wav`: handleCoins2 (RPG Audio), then a four-note lute arpeggio.
- `needs-you.wav`: bookFlip2 (RPG Audio), then impactBell_heavy_001 (Impact Sounds).
- `error.wav`: impactSoft_heavy_000 (Impact Sounds), a low hum and a falling three-note lute phrase.
- `stopped.wav`: doorClose_4 (RPG Audio).
- `level-up.wav`: a horn fanfare and a strummed lute chord, with handleCoins (RPG Audio) underneath.
- `critical.wav`: impactWood_light_000 to _004 (Impact Sounds) as a die's bounces, then a strummed lute and horn sting.

Changed for this mod: decoded from .ogg, mixed to mono, resampled to 22.05 kHz, softened with a
low-pass filter, trimmed, layered and re-timed, and normalised to a quiet peak (1/8 of full scale).
The horn, lute and hum are synthesised by the script; no other samples are used.
