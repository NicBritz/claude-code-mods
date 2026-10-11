# Furrowfield: design

A cosy pixel farm for Claude Code, the second mod in `NicBritz/claude-code-mods`. Your helpers are farmhands,
your sessions are fields, and finished work becomes harvests and coins you spend to grow a farm of your own
over weeks.

Status: agreed in conversation on 2026-10-11, awaiting review of this document.

## Goals

- **Free to run.** No tokens, no model calls, nothing added to Claude's prompt. Same house rules as Dungeon
  Master.
- **Popular and cosy.** A farm people want to come back to: visible growth, harvest payoffs, animals,
  seasons, unlocks, and no punishment for being away.
- **A full theme.** It fills the same slots as Dungeon Master (panel, strip, spinner, tool rows). People pick
  Furrowfield *or* Dungeon Master; the README says running both stacks two strips.
- **Directory-ready from day one.** It passes the Anthropic plugin directory's validation with no blockers, and
  the README answers every policy hold.

## Non-goals (first version)

- Anything that costs tokens: no Orders, no messages to helpers.
- Panel Allow / Deny on permission requests (the directory blocks any permission hook).
- Crops that die, debts, or other failure states.
- More than 6 crops, 4 animals, 6 buildings and 4 seasons. More can come in later versions.
- Running both Furrowfield and Dungeon Master as one combined experience.

## How it's built

Furrowfield starts from Dungeon Master's code. The proven, theme-free parts are copied into `mods/furrowfield/`:
- helper tracking;
- the session map rules;
- context bars;
- the camp, here called the shed;
- the quest log, here the day's log;
- settings handling;
- light/dark following;
- the "only tools your rules allow" gate;
- showcase mode;
- the single-breakpoint layout.

The D&D layer is then replaced by a farm layer, and the new farm game is added on top.

The two mods can't share code: the directory needs everything a plugin runs to be inside its own folder.

## What's on screen

| Place | Furrowfield |
|---|---|
| Strip above the message box | You, the farmer (chosen look and name), working while Claude works; the water can (context left); the 5-hour and weekly plan limits; Open / Close farm |
| Spinner | A seed that sprouts, grows and blooms while Claude thinks |
| Tool rows | Told as farm jobs, each with its own farm icon. Read: *Inspected*. Edit / Write: *Tilled*. Bash: *Ploughed*. Grep / Glob: *Foraged*. WebFetch: *Sent for*. |
| Panel: **The Farm** | A pixel scene of your farm in the current season: plots with their crops, your animals and buildings. **Harvest** and **Collect** buttons; **the General Store** below |
| Panel: **Farmhands** | Helpers at work as farmhands with context bars and Stop; **the shed** (background commands); **the day's log** (your recent turns); **the compost heap** (failed or stopped jobs) |
| Panel: **Fields** | Every Claude session in the app as a field, grouped as Dungeon Master's Realm Map is: Pinned, Needs you, Working, Idle, Fallow (asleep), Archived. Go, Archive, Restore, Name. |
| Panel: **The Barn** | Harvest totals, coins, farmhand levels and records, achievements |
| Panel: **The Almanac** | Settings: your farmer (look and name), sounds and volume, theme, hemisphere, sections shown, credits and licences |

## The farm game

| Piece | Rule |
|---|---|
| Coins | Earned only from work. Each helper job won is a **harvest**, worth 5 to 15 coins by length. Each of your finished turns is a **chore**, worth 1 to 2 coins. A long job won is a **prize giant pumpkin** (+25 coins, a fanfare, and the strip announces it). |
| Plots | Start with 4. Buy more in the store at 20 coins each, up to 16. |
| Crops | Buy seeds, then plant them in an empty plot. A planted crop moves one stage per finished turn of yours: seed, sprout, growing, ripe. Ripe crops wait for **Harvest**, which pays more than the seed cost. Crops never wither. |
| Animals | Chicken, sheep, cow and pig. Each needs its building first: coop, pen, barn, sty. On each calendar day you work, each animal makes one item (egg, wool, milk, truffle) to **Collect** for coins. |
| Buildings | Coop, pen, barn, sty, silo and windmill, plus the farmhouse, which upgrades in three steps. Buildings unlock animals and decorate the farm. |
| Seasons | They follow the local calendar: spring is March to May, and so on. The Almanac can flip them for the southern hemisphere. A season changes the ground colours and which seeds the store sells. |
| Farmhands | Helpers get farm names and looks in fixed slots, and level up from their jobs as Dungeon Master's heroes do. |
| Achievements | 10 to earn: First Harvest, Green Thumb (50 harvests), Prize Pumpkin, Full Coop, Tractor Time (5 helpers at once), Every Season, Homesteader (farmhouse fully upgraded), Early Bird (a turn before 7 am), Big Spender (500 coins spent), Hard Times (a compost heap of 10). |

The first version's content is listed in the next two tables. Exact prices and yields are set in one table in
code, so they can be tuned.

| Crop | Season | Seed cost | Harvest |
|---|---|---|---|
| Carrot | spring, autumn | 2 | 5 |
| Turnip | spring, winter | 2 | 5 |
| Tomato | summer | 4 | 10 |
| Wheat | summer, autumn | 3 | 8 |
| Cabbage | autumn, winter | 3 | 8 |
| Sunflower | summer | 5 | 12 |

These six crops are taken from the Kenney pack. Final picks depend on which have full growth stages.

| Animal (building) | Daily item | Building cost | Animal cost |
|---|---|---|---|
| Chicken (coop) | egg, 2 | 30 | 10 |
| Sheep (pen) | wool, 4 | 50 | 25 |
| Cow (barn) | milk, 6 | 80 | 40 |
| Pig (sty) | truffle, 8 | 120 | 60 |

The silo (100) and windmill (150) are decoration and prestige. The farmhouse upgrades cost 60, 150 and 300.

## Data

- **One farm across all sessions.** Farm state lives in the mod's store, under coins, plots, animals,
  buildings, achievements and records. Every write reads the latest and merges, so two sessions earning at
  once never lose coins.
- **Coins are counted once.** Each harvest or chore is keyed by its agent or turn id, so a reload never pays
  twice.
- **Files.** `~/.claude/furrowfield/` (or `$CLAUDE_CONFIG_DIR/furrowfield/`) holds:
  - `prefs.json`;
  - `names.json` (field names);
  - `sessions/<id>.json` (check-ins for the Fields page; never prompts).

  The word "settings" is deliberately not used in any file name.

## Art, sound and lettering

| What | Source | Licence |
|---|---|---|
| Crops, barn, farmers, cow, sheep, chicken, tools, fences, tiles | Kenney **Tiny Farm** and **Tiny Town** | CC0 |
| Farmer walk frames, pig, tractor, windmill, silo, sty | Drawn for this mod in Kenney's palette | ours (MIT) |
| Listing icon | A sprouting seedling, drawn for this mod | ours (MIT) |
| UI icons (barn, tractor, wheat, watering can, scarecrow and more) | game-icons.net: Delapouite, Lorc, Skoll | CC BY 3.0, credited |
| Headings | **Pixelify Sans**, converted to outlines like DM's Cinzel | OFL 1.1 |
| Sounds: rooster, cluck, moo, baa, oink, watering, tractor | freesound.org uploads verified CC0 (listed in CREDITS.md) | CC0 |
| Sounds: harvest chime, coins, jingles | Kenney audio packs | CC0 |

The art is converted to SVG path data by a script in `tools/`, as with Dungeon Master. No raw zips go in the
repo, and every file stays under the directory's 256 KiB limit.

## Themes

Five themes, each with a light and a dark version. They follow the app and are contrast-checked as Dungeon
Master's are: **Meadow**, **Harvest Gold**, **Orchard**, **Frost** and **Twilight**. Buttons stay plain,
because the app draws them.

## Safety and the directory

- It has no permission hook, no parameter named `on`, and every hook passes its event on unchanged.
- Tools it calls itself: `list_sessions`, `archive_session`, `unarchive_session` and `TaskStop`. Each is called
  only when the person's allow rules permit it. Otherwise the button says which rule to add.
- The only programs it runs are `defaults read -g AppleInterfaceStyle` and `open <claude:// link>`, each a
  fixed command.
- README images use Markdown syntax.
- `plugin.json` has the licence, homepage, repository, documentation, support and privacy links, and the icon.
- The README has a "What it keeps and reads" section covering every file, program, tool and event.

## Testing

- Unit tests:
  - coins (no double pay, merging);
  - crop growth stages;
  - store purchases and refusals (not enough coins, missing building, out-of-season seed);
  - daily animal produce;
  - seasons for both hemispheres;
  - achievements.
- Panel tests, ported from Dungeon Master:
  - single-click buttons;
  - folding;
  - the narrow layout;
  - showcase showing only made-up content;
  - the token-free tool gate.
- Before release: `claude plugin validate`, then the directory's Validate in the developer portal with
  zero blockers.

## Release

- Add the mod to the repo's `marketplace.json` and the root README's table.
- Take screenshots in `/farm showcase`, checked for anything private.
- Submit to the directory as a second plugin bundle (`mods/furrowfield`), with auto-publish off and a
  scheduled check.
