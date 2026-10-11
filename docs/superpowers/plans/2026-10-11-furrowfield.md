# Furrowfield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Furrowfield, a free-to-run cosy pixel farm mod for Claude Code (`/farm`), forked from Dungeon
Master, and ship it in `NicBritz/claude-code-mods`.

**Architecture:** The plan has five stages:
1. Copy `mods/dungeon-master` to `mods/furrowfield` and rename it, so the first commit is DM under a new name with
   every test green.
2. Add the farm game as one pure, fully tested module (`hooks/farm.ts`). It holds a merge-safe ledger, and every
   rule in the module is a function from state to state.
3. Wire the farm module into `register.tsx`.
4. Replace the D&D layer (art, words, themes, sounds) with the farm layer.
5. Add the two new panel pages: The Farm and the General Store.

**Tech Stack:**
- TypeScript Claude Code mod (function hooks, `register.tsx`, `claude-code` API, `claude-code/testing`);
- Python 3 generator scripts in `tools/`;
- SVG art;
- WAV sounds.

**Spec:** `docs/superpowers/specs/2026-10-11-furrowfield-design.md`

## Global Constraints

**Running cost and permissions**
- No tokens: no `prompt.compose`, no `$.model`, no `$.agent` calls that start work, no registered tools, no
  `SendMessage`.
- No permission hook of any kind (`classic.PermissionRequest`, `tool.check` hooks), no parameter or variable
  named `on`, and every hook ends `return next(e)` or returns `next`'s result unchanged.
- Plugin-initiated tool calls go through `toolIsAllowed` (as in DM 3.7): only when `tool.check` says `allow`.
- Programs run: only `['defaults','read','-g','AppleInterfaceStyle']` and `['open', <claude:// link>]`.

**Names and files**
- Names: plugin `furrowfield`, display "Furrowfield", command `farm`, pane id `furrowfield`, state plugin key
  `furrowfield`.
- Data folder `~/.claude/furrowfield/` (or `$CLAUDE_CONFIG_DIR/furrowfield/`). Files: `prefs.json`,
  `names.json`, `sessions/<id>.json`. Never a file named `settings*`.
- Every non-image file under 256 KiB, the plugin under 512 files, and no `.DS_Store`.
- README images use Markdown `![alt](path)` only.

**Writing and look**
- Copy rules (Nico's):
  - no em dashes in any user-facing string;
  - plain words, no jargon;
  - buttons plain-string labels;
  - no `dimColor`;
  - text contrast at least 4.5:1, and 3:1 for large text and bars.
- Layout: one breakpoint (`NARROW_COLUMNS` = 64) for the panel and one for the strip (`NARROW_STRIP_COLUMNS` = 90).

**Assets**
- Art licences: Kenney Tiny Farm and Tiny Town (CC0), game-icons.net (CC BY 3.0, credited), Pixelify Sans (OFL
  1.1), freesound/Kenney sounds (CC0). Everything else is drawn for the mod.

**Game numbers (from the spec)**
- Prices: plot 20; buildings coop 30, pen 50, barn 80, sty 120, silo 100, windmill 150; farmhouse 60 / 150 /
  300; animals chicken 10, sheep 25, cow 40, pig 60.
- Produce: egg 2, wool 4, milk 6, truffle 8.
- Crops (seed / harvest): carrot 2/5, turnip 2/5, tomato 4/10, wheat 3/8, cabbage 3/8, sunflower 5/12.
- Earnings: chore 1 (2 for a turn of a minute or more); helper harvest 5 to 15 by length; prize pumpkin +25.
- Rules decided in planning, where the spec is silent:
  - a building houses up to 4 of its animal;
  - uncollected produce waits, up to 3 per animal;
  - plots cap at 16.

## Review Focus

1. **Two sessions earning at the same moment.** Neither session's coins are lost, and nothing is paid twice.
   Pinned by the `mergeFarm` tests in Task 2 and the store-merge test in Task 3.
2. **A reload or `/clear` mid-turn.** The same turn or helper is paid once only. Pinned by the `earn`
   id-dedupe test (Task 2) and the reload test (Task 3).
3. **A damaged or hand-edited store value or `prefs.json`.** The farm loads with sensible defaults instead of
   crashing. Pinned by the `readFarm` leniency test (Task 2).
4. **Produce across midnight and time zones.** A day is the person's local calendar day, and a turn at 23:59
   followed by one at 00:01 is two days. Pinned by the `dayKey` / `waitingProduce` test (Task 2).
5. **A narrow panel with 16 plots and many animals.** The farm scene and store wrap with no horizontal
   overflow. Pinned by the narrow-layout test in Task 6.

---

## File map (`mods/furrowfield/`)

| File | Responsibility | Origin |
|---|---|---|
| `.claude-plugin/plugin.json`, `.claude-plugin/icon.png` | Manifest with links and licence; own seedling icon | new |
| `hooks/hooks.json` | `{ "modules": ["./register.tsx"] }` | copied |
| `hooks/register.tsx` | Every hook and drawing (the engine only follows `$` inside this file) | forked from DM |
| `hooks/farm.ts` | **The farm game:** ledger, coins, plots, crops, animals, buildings, seasons, store rules | new |
| `hooks/farm-achievements.ts` | The 10 farm achievements and their checks | replaces `achievements.ts` |
| `hooks/farmhands.ts` | 12 farmhands (names, looks, sprite keys, voice lines), `farmhandSvg`, `farmerSvg` | replaces `heroes.ts` |
| `hooks/farm-sprites.ts` | Generated SVG path data: Kenney crops (stages), animals, buildings, farmers, tiles | generated, replaces `sprites.ts` |
| `hooks/own-sprites.ts` | Hand-drawn: pig, tractor, windmill, silo, sty, farmer walk frames | new, replaces `graves.ts` |
| `hooks/scene.ts` | `farmSceneSvg(farm, season, now)`: the farm page picture | new |
| `hooks/art.ts` | Icons, headings, `seedPicture` (spinner), `animatedSvg` | forked |
| `hooks/inked.ts`, `hooks/pixel-font.ts` | Generated game-icons subset; Pixelify Sans outlines | regenerated |
| `hooks/themes.ts` | Meadow, Harvest Gold, Orchard, Frost, Twilight, each light and dark | forked |
| `hooks/words.ts` | Tool steps as farm jobs | forked |
| `hooks/context.ts` | Water-can wording for the context bar | forked |
| `hooks/showcase.ts` | Made-up farmhands, fields, log, compost and a made-up farm | forked |
| `hooks/credits.ts`, `CREDITS.md`, `licences/` | Farm credits | rewritten |
| `hooks/realm.ts`, `camp.ts`, `quests.ts`, `rules.ts`, `stamina.ts`, `cost.ts`, `activity.ts`, `settings.ts`, `characters.ts`, `fame.ts`, `icons.ts`, `items.ts` | Theme-free logic, renamed where words appear | copied |
| `tools/make-farm.py`, `tools/make-inked.py`, `tools/make-font.py`, `tools/icon.svg` | Generators and icon source | new and forked |
| `sounds/*.wav`, `sounds/make-sounds.py` | Farm sounds | new |
| `tests/*.test.ts` | Ported DM tests, plus `farm.test.ts`, `scene.test.ts`, `store.test.ts` | forked and new |
| `README.md`, `LICENSE` | Listing text with the disclosure section; MIT | rewritten |

Repo root: `.claude-plugin/marketplace.json` (add an entry) and `README.md` (add a table row).

Commands used throughout (run from the repo root, `~/Documents/repos/claude-code-mods`):
- Tests: `claude plugin test mods/furrowfield`
- Validate: `claude plugin validate mods/furrowfield`
- Types: `npx -y -p typescript@5.6 tsc -p <scratch>/tc-farm/tsconfig.json`. That tsconfig extends
  `mods/furrowfield/.claude-plugin/types/tsconfig.json` and includes `hooks`, `types` and `tests`.

---

### Task 1: Fork Dungeon Master as Furrowfield

**Files:**
- Create: `mods/furrowfield/**` (a copy of `mods/dungeon-master/**` without `media/` and `.claude-plugin/types/`)
- Modify: every renamed string listed below

**Interfaces:**
- Produces: a loading mod named `furrowfield` with `/farm`, pane `furrowfield`, data folder
  `~/.claude/furrowfield/` and `prefs.json`, behaving exactly like DM 3.7. All later tasks build on it.

- [ ] **Step 1: Copy the folder**

```bash
cd ~/Documents/repos/claude-code-mods
rsync -a --exclude '.claude-plugin/types' --exclude 'media' mods/dungeon-master/ mods/furrowfield/
```

- [ ] **Step 2: Rename identifiers**

```bash
cd mods/furrowfield
grep -rl "dungeon-master" hooks types tests .claude-plugin | xargs sed -i '' 's/dungeon-master/furrowfield/g'
grep -rl "command: 'dm'" hooks tests | xargs sed -i '' "s/command: 'dm'/command: 'farm'/g"
sed -i '' "s/name: 'dm'/name: 'farm'/; s/const TITLE = 'Dungeon Master'/const TITLE = 'Furrowfield'/" hooks/register.tsx
sed -i '' 's#`\${config}/dungeon-master`#`${config}/furrowfield`#' hooks/realm.ts
grep -rl "settings.json" hooks tests | xargs sed -i '' 's/settings\.json/prefs.json/g'
```

Then remove the one-off adoption of `~/.claude/realm`: delete `adoptEarlierFolder` and its call in
`register.tsx`, and delete the test "settings and names from <config>/realm are carried across once" in
`tests/settings.test.ts`.

In `.claude-plugin/plugin.json`, set:
- `"name": "furrowfield"`, `"version": "0.1.0"`;
- the description: "A cosy pixel farm for Claude Code: your helpers are farmhands, your sessions are fields,
  and finished work grows a farm of your own. No tokens used.";
- `homepage` / `documentationUrl` / `privacyPolicyUrl` to `.../tree/main/mods/furrowfield...`;
- the keywords: `["farm","cozy","pixel-art","subagents","sessions","theme"]`.

Then delete `.claude-plugin/icon.png`; Task 9 draws the new one.

- [ ] **Step 3: Make the test text follow the rename**

Run: `claude plugin test mods/furrowfield`

Expected: failures only where tests assert the strings "/dm", "Dungeon Master" or "DM screen". Update those
assertions to "/farm" and "Furrowfield", and keep the words "DM screen" for now; Task 5 renames them.

- [ ] **Step 4: Run tests, types and validate**

Run: `claude plugin test mods/furrowfield && claude plugin validate mods/furrowfield`

Expected: all pass (99 tests) and "✔ Validation passed".

- [ ] **Step 5: Commit**

```bash
git add mods/furrowfield && git commit -m "Furrowfield: start from Dungeon Master 3.7 under its own name"
```

---

### Task 2: The farm game module

**Files:**
- Create: `mods/furrowfield/hooks/farm.ts`
- Test: `mods/furrowfield/tests/farm.test.ts`

**Interfaces:**
- Produces (exact exports):
  - types `CropId`, `AnimalId`, `BuildingId`, `Season`, `Hemisphere`, `Earning`, `Purchase`, `Plot`, `Farm`,
    `Outcome`;
  - the tables `CROPS`, `ANIMALS`, `BUILDINGS`, `HOUSE_COSTS`;
  - the constants `PLOT_COST`, `MAX_PLOTS`, `START_PLOTS`, `PRIZE_COINS`, `MAX_WAITING`, `PER_BUILDING`;
  - the functions:
    - setup and storage: `emptyFarm()`, `readFarm(value: unknown): Farm`, `mergeFarm(a: Farm, b: Farm): Farm`;
    - money and earning: `coinsOf(farm): number`,
      `earn(farm, id: string, kind: Earning['kind'], coins: number, at: number): Farm`,
      `choreCoins(durationMs: number): number`, `harvestCoins(durationMs: number): number`;
    - calendar: `seasonOf(epochMs: number, hemisphere: Hemisphere): Season`, `dayKey(epochMs: number): string`;
    - crops and plots: `stageOf(farm, plotId): 0|1|2|3`,
      `plant(farm, plotId, crop, at, hemisphere): Outcome`, `harvest(farm, plotId, at): Outcome`,
      `buyPlot(farm, at): Outcome`, `seedsInSeason(season): CropId[]`;
    - buildings and animals: `buyBuilding(farm, id, at): Outcome`, `buyAnimal(farm, kind, at): Outcome`,
      `houseLevel(farm): 0|1|2|3`;
    - produce: `waitingProduce(farm, animalId, now): number`, `collect(farm, animalId, now): Outcome`.

Design: a farm is a **ledger**. Money is never stored as one number: `earned` and `spent` are records keyed by
event id, so merging two sessions is a union, and paying the same event twice is impossible. Plots and animals
are records with `updatedAt`, so on a merge the latest write of each one wins.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/farm.test.ts
import { describe, expect, test } from 'claude-code/testing'

import {
  CROPS, MAX_PLOTS, PLOT_COST, START_PLOTS, buyAnimal, buyBuilding, buyPlot, choreCoins, coinsOf, collect, dayKey,
  earn, emptyFarm, harvest, harvestCoins, houseLevel, mergeFarm, plant, readFarm, seasonOf, seedsInSeason, stageOf,
  waitingProduce, type Farm, type Outcome,
} from '../hooks/farm'

const JUNE = new Date(2026, 5, 15, 12).getTime()
const ok = (outcome: Outcome): Farm => {
  if (!outcome.ok) throw new Error(outcome.why)
  return outcome.farm
}
const rich = (farm: Farm, coins = 1000) => earn(farm, 'gift', 'chore', coins, 0)

describe('coins', () => {
  test('a new farm has 4 empty plots and no coins', () => {
    const farm = emptyFarm()
    expect(coinsOf(farm)).toBe(0)
    expect(Object.keys(farm.plots)).toHaveLength(START_PLOTS)
    expect(Object.values(farm.plots).every(plot => plot.crop === null)).toBe(true)
  })

  test('the same event pays once, however often it is reported', () => {
    let farm = earn(emptyFarm(), 'chore:t1', 'chore', 2, JUNE)
    farm = earn(farm, 'chore:t1', 'chore', 2, JUNE + 5)
    expect(coinsOf(farm)).toBe(2)
  })

  test('chores pay 1, or 2 for a turn of a minute or more; harvests 5 to 15 by length', () => {
    expect(choreCoins(20_000)).toBe(1)
    expect(choreCoins(60_000)).toBe(2)
    expect(harvestCoins(10_000)).toBe(5)
    expect(harvestCoins(5 * 60_000)).toBeGreaterThan(5)
    expect(harvestCoins(5 * 60 * 60_000)).toBe(15)
  })

  test('two sessions that earned and spent at once merge without losing either', () => {
    const base = rich(emptyFarm(), 100)
    const a = ok(buyPlot(earn(base, 'chore:a', 'chore', 1, JUNE), JUNE))
    const b = earn(base, 'harvest:b', 'harvest', 9, JUNE + 1)
    const merged = mergeFarm(a, b)
    expect(coinsOf(merged)).toBe(100 + 1 + 9 - PLOT_COST)
    expect(Object.keys(merged.plots)).toHaveLength(START_PLOTS + 1)
    expect(mergeFarm(b, a)).toEqual(merged)
  })

  test('a damaged store value loads as a fresh farm, keeping what is readable', () => {
    expect(coinsOf(readFarm('nonsense'))).toBe(0)
    expect(Object.keys(readFarm(null).plots)).toHaveLength(START_PLOTS)
    const kept = readFarm({ earned: { 'chore:x': { kind: 'chore', coins: 2, at: 1 }, bad: { coins: 'lots' } }, plots: 7 })
    expect(coinsOf(kept)).toBe(2)
    expect(Object.keys(kept.plots)).toHaveLength(START_PLOTS)
  })
})

describe('crops', () => {
  test('a crop grows one stage per chore after planting, and waits when ripe', () => {
    let farm = ok(plant(rich(emptyFarm()), 'p1', 'tomato', JUNE, 'north'))
    expect(stageOf(farm, 'p1')).toBe(0)
    farm = earn(farm, 'chore:1', 'chore', 1, JUNE + 1)
    farm = earn(farm, 'chore:2', 'chore', 1, JUNE + 2)
    expect(stageOf(farm, 'p1')).toBe(2)
    for (let n = 3; n < 10; n += 1) farm = earn(farm, `chore:${n}`, 'chore', 1, JUNE + n)
    expect(stageOf(farm, 'p1')).toBe(3)
  })

  test('harvest pays the crop and empties the plot; only a ripe crop can be harvested', () => {
    let farm = ok(plant(rich(emptyFarm(), 4), 'p1', 'tomato', JUNE, 'north'))
    expect(harvest(farm, 'p1', JUNE).ok).toBe(false)
    for (let n = 1; n <= 3; n += 1) farm = earn(farm, `chore:${n}`, 'chore', 0, JUNE + n)
    farm = ok(harvest(farm, 'p1', JUNE + 10))
    expect(coinsOf(farm)).toBe(CROPS.tomato.harvest)
    expect(farm.plots.p1?.crop).toBeNull()
  })

  test('the store refuses: too few coins, a full plot, a seed out of season', () => {
    expect(plant(emptyFarm(), 'p1', 'tomato', JUNE, 'north')).toMatchObject({ ok: false, why: expect.stringMatching(/coins/) })
    const planted = ok(plant(rich(emptyFarm()), 'p1', 'tomato', JUNE, 'north'))
    expect(plant(planted, 'p1', 'tomato', JUNE, 'north')).toMatchObject({ ok: false, why: expect.stringMatching(/already/) })
    expect(plant(rich(emptyFarm()), 'p2', 'turnip', JUNE, 'north')).toMatchObject({ ok: false, why: expect.stringMatching(/season/) })
  })

  test('plots stop at 16', () => {
    let farm = rich(emptyFarm(), 10_000)
    for (let n = START_PLOTS; n < MAX_PLOTS; n += 1) farm = ok(buyPlot(farm, JUNE + n))
    expect(buyPlot(farm, JUNE + 99)).toMatchObject({ ok: false })
  })
})

describe('seasons', () => {
  test('follow the calendar, flipped for the south', () => {
    expect(seasonOf(new Date(2026, 3, 1).getTime(), 'north')).toBe('spring')
    expect(seasonOf(JUNE, 'north')).toBe('summer')
    expect(seasonOf(new Date(2026, 9, 1).getTime(), 'north')).toBe('autumn')
    expect(seasonOf(new Date(2026, 0, 1).getTime(), 'north')).toBe('winter')
    expect(seasonOf(JUNE, 'south')).toBe('winter')
    expect(seedsInSeason('summer')).toEqual(['tomato', 'wheat', 'sunflower'])
  })
})

describe('animals and buildings', () => {
  test('an animal needs its building, and a building holds 4', () => {
    let farm = rich(emptyFarm())
    expect(buyAnimal(farm, 'chicken', JUNE)).toMatchObject({ ok: false, why: expect.stringMatching(/coop/i) })
    farm = ok(buyBuilding(farm, 'coop', JUNE))
    for (let n = 0; n < 4; n += 1) farm = ok(buyAnimal(farm, 'chicken', JUNE + n))
    expect(buyAnimal(farm, 'chicken', JUNE + 9)).toMatchObject({ ok: false, why: expect.stringMatching(/full/) })
    expect(buyBuilding(farm, 'coop', JUNE)).toMatchObject({ ok: false, why: expect.stringMatching(/already/) })
  })

  test('the farmhouse upgrades in order', () => {
    let farm = rich(emptyFarm())
    expect(houseLevel(farm)).toBe(0)
    expect(buyBuilding(farm, 'house-2', JUNE).ok).toBe(false)
    farm = ok(buyBuilding(farm, 'house-1', JUNE))
    farm = ok(buyBuilding(farm, 'house-2', JUNE))
    expect(houseLevel(farm)).toBe(2)
  })

  test('produce comes once per calendar day worked, waits up to 3, and pays on collect', () => {
    let farm = ok(buyAnimal(ok(buyBuilding(rich(emptyFarm(), 40), 'coop', JUNE)), 'chicken', JUNE))
    const chicken = Object.keys(farm.animals)[0] ?? ''
    const late = new Date(2026, 5, 15, 23, 59).getTime()
    const early = new Date(2026, 5, 16, 0, 1).getTime()
    expect(dayKey(late)).not.toBe(dayKey(early))
    farm = earn(farm, 'chore:late', 'chore', 0, late)
    farm = earn(farm, 'chore:early', 'chore', 0, early)
    expect(waitingProduce(farm, chicken, early)).toBe(2)
    for (let d = 17; d < 25; d += 1) farm = earn(farm, `chore:${d}`, 'chore', 0, new Date(2026, 5, d, 9).getTime())
    const now = new Date(2026, 5, 25, 9).getTime()
    expect(waitingProduce(farm, chicken, now)).toBe(3)
    const before = coinsOf(farm)
    farm = ok(collect(farm, chicken, now))
    expect(coinsOf(farm)).toBe(before + 3 * 2)
    expect(waitingProduce(farm, chicken, now)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `claude plugin test mods/furrowfield`

Expected: FAIL in `tests/farm.test.ts`, "Cannot find module '../hooks/farm'".

- [ ] **Step 3: Write `hooks/farm.ts`**

```ts
// The farm game: a ledger of what was earned and spent (keyed by event, so
// two sessions merge by union and nothing is paid twice), plots, animals and
// buildings, and the rules of the General Store. Pure: no $, no clock.

export type CropId = 'carrot' | 'turnip' | 'tomato' | 'wheat' | 'cabbage' | 'sunflower'
export type AnimalId = 'chicken' | 'sheep' | 'cow' | 'pig'
export type BuildingId = 'coop' | 'pen' | 'barn' | 'sty' | 'silo' | 'windmill' | 'house-1' | 'house-2' | 'house-3'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type Hemisphere = 'north' | 'south'

export type Earning = { kind: 'chore' | 'harvest' | 'prize' | 'crop' | 'produce'; coins: number; at: number }
export type Purchase = { item: string; coins: number; at: number }
export type Plot = { crop: CropId | null; plantedAt: number; updatedAt: number }
export type Animal = { kind: AnimalId; boughtAt: number }
export type Farm = {
  earned: Record<string, Earning>
  spent: Record<string, Purchase>
  plots: Record<string, Plot>
  animals: Record<string, Animal>
  buildings: Record<string, { boughtAt: number }>
  collected: Record<string, number> // `${animalId}:${dayKey}` -> when
}
export type Outcome = { ok: true; farm: Farm } | { ok: false; why: string }

export const CROPS: Record<CropId, { seed: number; harvest: number; seasons: readonly Season[]; label: string }> = {
  carrot: { seed: 2, harvest: 5, seasons: ['spring', 'autumn'], label: 'Carrot' },
  turnip: { seed: 2, harvest: 5, seasons: ['spring', 'winter'], label: 'Turnip' },
  tomato: { seed: 4, harvest: 10, seasons: ['summer'], label: 'Tomato' },
  wheat: { seed: 3, harvest: 8, seasons: ['summer', 'autumn'], label: 'Wheat' },
  cabbage: { seed: 3, harvest: 8, seasons: ['autumn', 'winter'], label: 'Cabbage' },
  sunflower: { seed: 5, harvest: 12, seasons: ['summer'], label: 'Sunflower' },
}
export const ANIMALS: Record<AnimalId, { cost: number; home: BuildingId; item: string; itemCoins: number; label: string }> = {
  chicken: { cost: 10, home: 'coop', item: 'egg', itemCoins: 2, label: 'Chicken' },
  sheep: { cost: 25, home: 'pen', item: 'wool', itemCoins: 4, label: 'Sheep' },
  cow: { cost: 40, home: 'barn', item: 'milk', itemCoins: 6, label: 'Cow' },
  pig: { cost: 60, home: 'sty', item: 'truffle', itemCoins: 8, label: 'Pig' },
}
export const BUILDINGS: Record<BuildingId, { cost: number; label: string; needs?: BuildingId }> = {
  coop: { cost: 30, label: 'Coop' },
  pen: { cost: 50, label: 'Sheep pen' },
  barn: { cost: 80, label: 'Barn' },
  sty: { cost: 120, label: 'Pigsty' },
  silo: { cost: 100, label: 'Silo' },
  windmill: { cost: 150, label: 'Windmill' },
  'house-1': { cost: 60, label: 'Farmhouse' },
  'house-2': { cost: 150, label: 'Farmhouse, second floor', needs: 'house-1' },
  'house-3': { cost: 300, label: 'Farmhouse, the grand porch', needs: 'house-2' },
}
export const HOUSE_COSTS = [60, 150, 300] as const
export const PLOT_COST = 20
export const START_PLOTS = 4
export const MAX_PLOTS = 16
export const PRIZE_COINS = 25
export const MAX_WAITING = 3
export const PER_BUILDING = 4
const RIPE = 3

const SEASON_ORDER: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']

export function emptyFarm(): Farm {
  const plots: Record<string, Plot> = {}
  for (let n = 1; n <= START_PLOTS; n += 1) plots[`p${n}`] = { crop: null, plantedAt: 0, updatedAt: 0 }
  return { earned: {}, spent: {}, plots, animals: {}, buildings: {}, collected: {} }
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const pick = <T>(value: unknown, keep: (one: unknown) => one is T): Record<string, T> => {
  const out: Record<string, T> = {}
  if (!isRecord(value)) return out
  for (const [key, one] of Object.entries(value)) if (keep(one)) out[key] = one
  return out
}

// Whatever the store held, a farm: unreadable parts fall back, readable ones stay.
export function readFarm(value: unknown): Farm {
  const fresh = emptyFarm()
  if (!isRecord(value)) return fresh
  const earned = pick(value.earned, (one): one is Earning => isRecord(one) && isNumber(one.coins) && isNumber(one.at) && typeof one.kind === 'string')
  const spent = pick(value.spent, (one): one is Purchase => isRecord(one) && isNumber(one.coins) && isNumber(one.at) && typeof one.item === 'string')
  const plots = pick(value.plots, (one): one is Plot => isRecord(one) && (one.crop === null || (typeof one.crop === 'string' && Object.hasOwn(CROPS, one.crop))) && isNumber(one.plantedAt) && isNumber(one.updatedAt))
  const animals = pick(value.animals, (one): one is Animal => isRecord(one) && typeof one.kind === 'string' && Object.hasOwn(ANIMALS, one.kind) && isNumber(one.boughtAt))
  const buildings = pick(value.buildings, (one): one is { boughtAt: number } => isRecord(one) && isNumber(one.boughtAt))
  const collected = pick(value.collected, isNumber)
  return { earned, spent, plots: Object.keys(plots).length >= START_PLOTS ? plots : fresh.plots, animals, buildings, collected }
}

const newest = <T extends { updatedAt: number }>(a: Record<string, T>, b: Record<string, T>) => {
  const out = { ...a }
  for (const [key, one] of Object.entries(b)) {
    const mine = out[key]
    if (mine === undefined || one.updatedAt > mine.updatedAt) out[key] = one
  }
  return out
}

// Two copies of the farm (two sessions), as one: every earning and purchase
// from both, and for each plot the latest write. Order does not matter.
export function mergeFarm(a: Farm, b: Farm): Farm {
  return {
    earned: { ...a.earned, ...b.earned },
    spent: { ...a.spent, ...b.spent },
    plots: sortKeys(newest(a.plots, b.plots)),
    animals: sortKeys({ ...a.animals, ...b.animals }),
    buildings: sortKeys({ ...a.buildings, ...b.buildings }),
    collected: sortKeys({ ...a.collected, ...b.collected }),
  }
}
const sortKeys = <T>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(record).sort(([x], [y]) => x.localeCompare(y)))

export const coinsOf = (farm: Farm) =>
  Object.values(farm.earned).reduce((sum, one) => sum + one.coins, 0) - Object.values(farm.spent).reduce((sum, one) => sum + one.coins, 0)

export function earn(farm: Farm, id: string, kind: Earning['kind'], coins: number, at: number): Farm {
  if (Object.hasOwn(farm.earned, id)) return farm
  return { ...farm, earned: { ...farm.earned, [id]: { kind, coins, at } } }
}

export const choreCoins = (durationMs: number) => (durationMs >= 60_000 ? 2 : 1)
export const harvestCoins = (durationMs: number) => Math.max(5, Math.min(15, 5 + Math.floor(durationMs / (2 * 60_000))))

export function seasonOf(epochMs: number, hemisphere: Hemisphere): Season {
  const month = new Date(epochMs).getMonth() // 0 = January
  const north = month >= 2 && month <= 4 ? 0 : month >= 5 && month <= 7 ? 1 : month >= 8 && month <= 10 ? 2 : 3
  return SEASON_ORDER[(north + (hemisphere === 'south' ? 2 : 0)) % 4] ?? 'spring'
}

export const seedsInSeason = (season: Season): CropId[] => (Object.keys(CROPS) as CropId[]).filter(id => CROPS[id].seasons.includes(season))

// The person's local calendar day.
export function dayKey(epochMs: number): string {
  const day = new Date(epochMs)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

const chores = (farm: Farm) => Object.values(farm.earned).filter(one => one.kind === 'chore')

export function stageOf(farm: Farm, plotId: string): 0 | 1 | 2 | 3 {
  const plot = farm.plots[plotId]
  if (plot === undefined || plot.crop === null) return 0
  const grown = chores(farm).filter(one => one.at > plot.plantedAt).length
  return Math.min(RIPE, grown) as 0 | 1 | 2 | 3
}

const spend = (farm: Farm, item: string, coins: number, at: number): Outcome => {
  if (coinsOf(farm) < coins) return { ok: false, why: `That costs ${coins} coins; you have ${coinsOf(farm)}.` }
  let key = `${item}:${at}`
  while (Object.hasOwn(farm.spent, key)) key += "'"
  return { ok: true, farm: { ...farm, spent: { ...farm.spent, [key]: { item, coins, at } } } }
}

export function plant(farm: Farm, plotId: string, crop: CropId, at: number, hemisphere: Hemisphere): Outcome {
  const plot = farm.plots[plotId]
  if (plot === undefined) return { ok: false, why: 'There is no such plot.' }
  if (plot.crop !== null) return { ok: false, why: 'That plot is already planted.' }
  if (!CROPS[crop].seasons.includes(seasonOf(at, hemisphere))) return { ok: false, why: `${CROPS[crop].label} is out of season.` }
  const paid = spend(farm, `seed:${crop}`, CROPS[crop].seed, at)
  if (!paid.ok) return paid
  return { ok: true, farm: { ...paid.farm, plots: { ...paid.farm.plots, [plotId]: { crop, plantedAt: at, updatedAt: at } } } }
}

export function harvest(farm: Farm, plotId: string, at: number): Outcome {
  const plot = farm.plots[plotId]
  if (plot === undefined || plot.crop === null) return { ok: false, why: 'Nothing is growing there.' }
  if (stageOf(farm, plotId) < RIPE) return { ok: false, why: 'It is not ripe yet.' }
  const paid = earn(farm, `crop:${plotId}:${plot.plantedAt}`, 'crop', CROPS[plot.crop].harvest, at)
  return { ok: true, farm: { ...paid, plots: { ...paid.plots, [plotId]: { crop: null, plantedAt: 0, updatedAt: at } } } }
}

export function buyPlot(farm: Farm, at: number): Outcome {
  const count = Object.keys(farm.plots).length
  if (count >= MAX_PLOTS) return { ok: false, why: `The farm has all ${MAX_PLOTS} plots.` }
  const paid = spend(farm, 'plot', PLOT_COST, at)
  if (!paid.ok) return paid
  let n = count + 1
  while (Object.hasOwn(paid.farm.plots, `p${n}`)) n += 1
  return { ok: true, farm: { ...paid.farm, plots: { ...paid.farm.plots, [`p${n}`]: { crop: null, plantedAt: 0, updatedAt: at } } } }
}

export function houseLevel(farm: Farm): 0 | 1 | 2 | 3 {
  return Object.hasOwn(farm.buildings, 'house-3') ? 3 : Object.hasOwn(farm.buildings, 'house-2') ? 2 : Object.hasOwn(farm.buildings, 'house-1') ? 1 : 0
}

export function buyBuilding(farm: Farm, id: BuildingId, at: number): Outcome {
  const building = BUILDINGS[id]
  if (Object.hasOwn(farm.buildings, id)) return { ok: false, why: `You already have the ${building.label.toLowerCase()}.` }
  if (building.needs !== undefined && !Object.hasOwn(farm.buildings, building.needs)) return { ok: false, why: `Build the ${BUILDINGS[building.needs].label.toLowerCase()} first.` }
  const paid = spend(farm, `building:${id}`, building.cost, at)
  if (!paid.ok) return paid
  return { ok: true, farm: { ...paid.farm, buildings: { ...paid.farm.buildings, [id]: { boughtAt: at } } } }
}

export function buyAnimal(farm: Farm, kind: AnimalId, at: number): Outcome {
  const animal = ANIMALS[kind]
  if (!Object.hasOwn(farm.buildings, animal.home)) return { ok: false, why: `A ${animal.label.toLowerCase()} needs a ${BUILDINGS[animal.home].label.toLowerCase()} first.` }
  const housed = Object.values(farm.animals).filter(one => one.kind === kind).length
  if (housed >= PER_BUILDING) return { ok: false, why: `The ${BUILDINGS[animal.home].label.toLowerCase()} is full.` }
  const paid = spend(farm, `animal:${kind}`, animal.cost, at)
  if (!paid.ok) return paid
  let n = housed + 1
  while (Object.hasOwn(paid.farm.animals, `${kind}-${n}`)) n += 1
  return { ok: true, farm: { ...paid.farm, animals: { ...paid.farm.animals, [`${kind}-${n}`]: { kind, boughtAt: at } } } }
}

// Days worked since the animal arrived, not yet collected, at most 3.
const waitingDays = (farm: Farm, animalId: string, now: number): string[] => {
  const animal = farm.animals[animalId]
  if (animal === undefined) return []
  const days = new Set(chores(farm).filter(one => one.at >= animal.boughtAt && one.at <= now).map(one => dayKey(one.at)))
  return [...days].filter(day => !Object.hasOwn(farm.collected, `${animalId}:${day}`)).sort().slice(-MAX_WAITING)
}

export const waitingProduce = (farm: Farm, animalId: string, now: number) => waitingDays(farm, animalId, now).length

export function collect(farm: Farm, animalId: string, now: number): Outcome {
  const animal = farm.animals[animalId]
  if (animal === undefined) return { ok: false, why: 'There is no such animal.' }
  const days = waitingDays(farm, animalId, now)
  if (days.length === 0) return { ok: false, why: 'Nothing to collect yet.' }
  let next = farm
  const collected = { ...farm.collected }
  // Every worked day up to now counts as handled, so older ones past the cap do not come back.
  const allDays = new Set(chores(farm).filter(one => one.at >= animal.boughtAt && one.at <= now).map(one => dayKey(one.at)))
  for (const day of allDays) collected[`${animalId}:${day}`] = now
  for (const day of days) next = earn(next, `produce:${animalId}:${day}`, 'produce', ANIMALS[animal.kind].itemCoins, now)
  return { ok: true, farm: { ...next, collected } }
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `claude plugin test mods/furrowfield`

Expected: PASS, including every `tests/farm.test.ts` case.

- [ ] **Step 5: Commit**

```bash
git add mods/furrowfield/hooks/farm.ts mods/furrowfield/tests/farm.test.ts && git commit -m "Furrowfield: the farm game rules"
```

---

### Task 3: Earn coins from real work and keep one farm across sessions

**Files:**
- Modify: `mods/furrowfield/hooks/register.tsx` (new atom `farm`, `changeFarm`, earnings in `turn.complete` and
  `finish`, prize in `criticalRoll`)
- Modify: `mods/furrowfield/types/index.d.ts` (`farm: Farm` in `PluginState['furrowfield']`)
- Test: `mods/furrowfield/tests/pals.test.ts` (new `describe('the farm earns')`)

**Interfaces:**
- Consumes from Task 2: `Farm`, `readFarm`, `mergeFarm`, `earn`, `choreCoins`, `harvestCoins`, `PRIZE_COINS`.
- Produces: `const farm = atom({ plugin: 'furrowfield', key: 'farm' } as const, emptyFarm())`;
  `async function changeFarm($: Engine, fn: (now: Farm) => Farm): Promise<Farm>`, which reads the store, merges
  it with memory, applies `fn`, writes the store and updates the atom; `const STORE_FARM = 'farm'`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('the farm earns', () => {
  test('a finished turn is a chore, a won helper job a harvest, each paid once', async ($, on) => {
    const bench = engine(on)
    await $.turn.complete({ ...complete('x', 'answer', 'Done.'), agentId: undefined, turnId: 'turn-1', durationMs: 90_000 } as never)
    await $.turn.complete({ ...complete('x', 'answer', 'Done.'), agentId: undefined, turnId: 'turn-1', durationMs: 90_000 } as never)
    await spawn($, 'h1', 'Survey the field')
    await bench.clock.advance(3 * 60_000)
    await $.turn.complete(complete('h1', 'answer', 'Surveyed.'))
    const stored = readFarm(await $.store.get('farm'))
    expect(Object.keys(stored.earned).sort()).toEqual(['chore:turn-1', 'harvest:h1'])
    expect(coinsOf(stored)).toBe(2 + harvestCoins(3 * 60_000))
  })

  test('coins another session saved meanwhile are kept when this one earns', async ($, on) => {
    engine(on)
    await $.store.set('farm', earn(emptyFarm(), 'chore:elsewhere', 'chore', 7, 1))
    await $.turn.complete({ ...complete('x', 'answer', 'Done.'), agentId: undefined, turnId: 'turn-2', durationMs: 1000 } as never)
    expect(coinsOf(readFarm(await $.store.get('farm')))).toBe(7 + 1)
  })

  test('a failed or stopped helper job earns nothing', async ($, on) => {
    engine(on)
    await spawn($, 'h2', 'Mend the fence')
    await $.turn.complete(complete('h2', 'error', 'The fence fell over.'))
    expect(coinsOf(readFarm(await $.store.get('farm')))).toBe(0)
  })
})
```

Add `import { coinsOf, earn, emptyFarm, harvestCoins, readFarm } from '../hooks/farm'` to the top of
`tests/pals.test.ts`.

- [ ] **Step 2: Run the tests and see them fail**

Run: `claude plugin test mods/furrowfield`

Expected: FAIL. `stored.earned` is `{}`.

- [ ] **Step 3: Implement**

In `register.tsx`, beside the other atoms:

```tsx
import { PRIZE_COINS, choreCoins, earn, emptyFarm, harvestCoins, mergeFarm, readFarm, type Farm } from './farm'

const STORE_FARM = 'farm'
// The one farm all sessions share: the store holds it, this atom draws it.
const farm = atom({ plugin: 'furrowfield', key: 'farm' } as const, emptyFarm())

// Every change reads the store first and merges, so a coin another session
// earned meanwhile is never lost.
async function changeFarm($: Engine, fn: (now: Farm) => Farm): Promise<Farm> {
  const stored = readFarm(await $.store.get(STORE_FARM).catch(() => undefined))
  const next = fn(mergeFarm(stored, await read($, farm)))
  await $.store.set(STORE_FARM, next).catch(() => undefined)
  await update($, farm, () => next)
  return next
}
```

In the `turn.complete` hook, in the branch where `agentId === undefined` (the main thread), before
`return next(e)`:

```tsx
await changeFarm($, now => earn(now, `chore:${e.turnId}`, 'chore', choreCoins(e.durationMs ?? 0), Date.now())).catch(() => undefined)
```

Use `await $.clock.now()` instead of `Date.now()` (the clock is mocked in tests); the same applies in all the
snippets below.

In `finish($, id, status, lastWords)`, inside the branch where a quest ended for the first time with status
`'done'`:

```tsx
const ran = (pal.endedAt ?? now) - pal.startedAt
await changeFarm($, current => earn(current, `harvest:${id}`, 'harvest', harvestCoins(ran), now)).catch(() => undefined)
```

In `criticalRoll`, when the face is 20:

```tsx
await changeFarm($, current => earn(current, `prize:${who}:${now}`, 'prize', PRIZE_COINS, now)).catch(() => undefined)
```

In `restore($)` (session start), load the farm:

```tsx
await update($, farm, () => readFarm(stored)) // stored = await $.store.get(STORE_FARM)
```

In `types/index.d.ts`, add `farm: import('../hooks/farm').Farm` to the state contract.

- [ ] **Step 4: Run the tests and see them pass**

Run: `claude plugin test mods/furrowfield`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mods/furrowfield && git commit -m "Furrowfield: real work earns coins, one farm across sessions"
```

---

### Task 4: Farm art from Kenney, plus our own drawings

**Files:**
- Create:
  - `mods/furrowfield/tools/make-farm.py`;
  - `mods/furrowfield/hooks/farm-sprites.ts` (generated);
  - `mods/furrowfield/hooks/own-sprites.ts`.
- Delete:
  - `hooks/sprites.ts`, `hooks/graves.ts`;
  - `tools/make-heroes.py`, `tools/make-items.py`;
  - `licences/0x72*`.
- Test: `mods/furrowfield/tests/art.test.ts` (rewritten)

**Interfaces:**
- Produces from `farm-sprites.ts`:
  - `CROP_STAGES: Record<CropId, readonly [string, string, string, string]>`;
  - `ANIMAL_ART: Record<'chicken'|'sheep'|'cow', readonly string[]>`;
  - `BUILDING_ART: Record<'coop'|'pen'|'barn'|'house-1'|'house-2'|'house-3', string>`;
  - `FARMERS: readonly { idle: readonly string[] }[]` (at least 2 looks from Kenney);
  - `TILES: { soil: string; grass: string; fence: string }`.

  Each string is the inner SVG of a 16 by 16 picture (`<path>` runs, as `sprites.ts` was).
- Produces from `own-sprites.ts`:
  - `PIG: readonly string[]`, `TRACTOR: readonly string[]`, `WINDMILL: readonly string[]` (4 frames, sails turning);
  - `SILO: string`, `STY: string`;
  - `FARMER_WALK: readonly (readonly string[])[]` (4 frames per farmer look).

- [ ] **Step 1: Download the packs into the scratchpad**

These go into the scratchpad, never the repo.

```bash
S=<scratchpad>/farm-art && mkdir -p $S && cd $S
curl -L -o tiny-farm.zip https://kenney.nl/media/pages/assets/tiny-farm/<current-hash>/kenney_tiny-farm.zip   # take the link from https://kenney.nl/assets/tiny-farm
curl -L -o tiny-town.zip https://kenney.nl/media/pages/assets/tiny-town/<current-hash>/kenney_tiny-town.zip
mkdir farm town && unzip -q tiny-farm.zip -d farm && unzip -q tiny-town.zip -d town
cat farm/License.txt | head -5   # confirm "Creative Commons Zero, CC0"
```

- [ ] **Step 2: Write the converter**

`tools/make-farm.py` reads the 16 by 16 tiles named in its `PICKS` table and writes one `<path>` per colour run.
It is the same run encoding as `make-heroes.py`: `M<x> <y>h<w>v1h-<w>z`, filled with the pixel's hex. It then
writes `hooks/farm-sprites.ts` with a header comment naming the pack, its URL and CC0.

`PICKS` maps each name to a tile file, chosen by looking at `farm/Tilemap/tilemap_packed.png` and
`farm/Tiles/tile_*.png`:
- `CROP_STAGES[crop]`: 4 tiles per crop;
- `ANIMAL_ART`, `BUILDING_ART`, `FARMERS`, `TILES`.

Only tiles that exist go in. If a crop lacks 4 stages, swap it for one that has them, and record the swap in
the spec's crop table and in `CROPS` in `hooks/farm.ts`.

Run it: `cd mods/furrowfield && python3 -I tools/make-farm.py <scratchpad>/farm-art`

- [ ] **Step 3: Draw our own sprites**

In `own-sprites.ts`, use the same run encoding and only Kenney's palette, sampled from the pack PNGs with
Python. The drawings are:
- the pig (2 idle frames);
- the tractor (2 frames, wheel turning);
- the windmill (4 frames, sails turning);
- the silo and the sty;
- for each Kenney farmer, a 4-frame walk made from its idle by shifting the legs one pixel.

Add a top comment: "Drawn for Furrowfield in the Kenney Tiny Farm palette."

- [ ] **Step 4: Rewrite `tests/art.test.ts` and run it**

```ts
import { describe, expect, test } from 'claude-code/testing'

import { CROPS, type CropId } from '../hooks/farm'
import { ANIMAL_ART, BUILDING_ART, CROP_STAGES, FARMERS, TILES } from '../hooks/farm-sprites'
import { FARMER_WALK, PIG, SILO, STY, TRACTOR, WINDMILL } from '../hooks/own-sprites'

const runs = (art: string) => [...art.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) }))
const inside = (art: string) => runs(art).every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= 16 && r.y < 16)

describe('farm art', () => {
  test('every crop has 4 stages on the 16 by 16 grid, and every stage differs', () => {
    for (const crop of Object.keys(CROPS) as CropId[]) {
      const stages = CROP_STAGES[crop]
      expect(stages).toHaveLength(4)
      expect(new Set(stages).size).toBe(4)
      expect(stages.every(inside)).toBe(true)
    }
  })

  test('animals, buildings, farmers and tiles are drawn and stay on the grid', () => {
    const all = [...Object.values(ANIMAL_ART).flat(), ...Object.values(BUILDING_ART), ...FARMERS.flatMap(f => f.idle), ...Object.values(TILES), ...PIG, ...TRACTOR, ...WINDMILL, SILO, STY, ...FARMER_WALK.flat()]
    expect(all.every(art => art.length > 0 && inside(art))).toBe(true)
    expect(FARMER_WALK).toHaveLength(FARMERS.length)
    expect(WINDMILL).toHaveLength(4)
  })
})
```

Run: `claude plugin test mods/furrowfield`

Expected: PASS for `art.test.ts`. Other suites fail where they import `sprites.ts` / `graves.ts`; Task 5 replaces
those imports. Do not commit until Task 5's tests pass.

---

### Task 5: The farm layer: farmhands, words, themes, icons, lettering, spinner, sounds

**Files:**
- Create:
  - `hooks/farmhands.ts` (replaces `heroes.ts`);
  - `hooks/farm-achievements.ts` (replaces `achievements.ts`);
  - `hooks/pixel-font.ts` (replaces `fantasy-font.ts`).
- Modify:
  - `hooks/words.ts`, `hooks/context.ts`, `hooks/themes.ts`, `hooks/art.ts`, `hooks/characters.ts`;
  - `hooks/showcase.ts`, `hooks/credits.ts`, `hooks/register.tsx`;
  - `tools/make-inked.py`, `tools/make-font.py`, `types/index.d.ts`.
- Create: `sounds/*.wav`, `sounds/make-sounds.py`, `licences/kenney-license.txt`,
  `licences/pixelify-sans-OFL.txt`, `licences/freesound-cc0.txt`.
- Test: port `tests/heroes.test.ts` to `tests/farmhands.test.ts`; update `tests/rows.test.ts`,
  `tests/pals.test.ts` and `tests/settings.test.ts`.

**Interfaces:**
- Produces from `farmhands.ts`:
  - `FARMHANDS: readonly { name: string; title: string; look: number; voice: { ask(what: string): string; done: string; fell: string } }[]`
    (12 entries, fixed slots, each title a farm job: Ploughhand, Shepherd, Milkmaid, Beekeeper, Orchardist,
    Stablehand, Gardener, Fisher, Miller, Forager, Woodcutter, Scarecrow-maker);
  - `farmhandOf(slot): Farmhand`;
  - `farmhandSvg(slot, isWaiting, frame, size, isCompacting, scrollY?)`, with the same signature as `heroSvg`
    so the call sites only change name;
  - `farmerSvg(status, frame, isCompacting, scrollY?)`, replacing `overlordSvg`;
  - `assignFarmhand` (same rules as `assignHero`).
- Produces from `farm-achievements.ts`: the 10 ids from the spec, with the same `Achievement` shape and
  `readEarned` as `achievements.ts`.
- Produces from `art.ts`:
  - `seedPicture(frame, size, colours)`, the spinner: 8 frames from seed to sprout to bud to bloom to a sway,
    drawn with `CROP_STAGES.sunflower` plus 4 in-between frames of its own;
  - `GlyphName` gains `wheat`, `barn`, `tractor`, `watering-can`, `scarecrow`, `seedling`, `coins`, `sickle`,
    `windmill`, `cow`, `chicken`, `pitchfork`.

- [ ] **Step 1: Write the failing tests**

Port `tests/heroes.test.ts` to `tests/farmhands.test.ts`. The test names and checks stay; the subject changes:
- 12 farmhands, one per title, in fixed slots;
- every voice line short, with no em dash;
- compaction moves the bees ("thoughts") frame to frame, and the hat sits inside the cropped strip picture.

Change `rows.test.ts` expectations:
- `Forged` becomes `Tilled`, `Cast` becomes `Ploughed`, `Studied` becomes `Inspected`, `Scouted` becomes
  `Foraged`;
- the theme list is `meadow, harvest-gold, orchard, frost, twilight`.

Change `pals.test.ts`:
- `The Overlord` becomes `The Farmer`;
- `heroes on a quest` becomes `farmhands at work`;
- `Hall of Heroes` becomes `The Barn`;
- `graveyard` becomes `compost heap`;
- `Realm Map` becomes `Fields`;
- `DM's Tome` becomes `The Almanac`.

The settings test uses the theme names above and `mainName` default "The Farmer".

Run: `claude plugin test mods/furrowfield`

Expected: FAIL on the renamed strings.

- [ ] **Step 2: Words and context**

In `words.ts`, change `TOOL_VERBS` to:

| Tool | Running | Done | Glyph |
|---|---|---|---|
| Read | Inspecting | Inspected | `seedling` |
| Edit / MultiEdit / Write | Tilling | Tilled | `pitchfork` |
| Bash | Ploughing | Ploughed | `tractor` |
| Grep / Glob | Foraging | Foraged | `wheat` |
| WebFetch / WebSearch | Sending for | Sent for | `windmill` |
| Task / Agent | Hiring | Hired | `scarecrow` |
| fallback | Tending | Tended | `sickle` |

In `context.ts`:
- `contextWords` reads "Water: 64% left · 72k of 200k";
- compaction reads "Water: drawing from the well";
- `CONDENSING` becomes "Drawing water".

- [ ] **Step 3: Themes**

`themes.ts` defines `THEMES` with five dark palettes:
- `meadow`: soft greens on deep loam;
- `harvest-gold`: wheat gold on barn brown;
- `orchard`: apple red on bark;
- `frost`: icy blue on night slate;
- `twilight`: lavender on dusk navy.

Each has the same fields as DM's palettes. `LIGHT_THEMES` is generated by the existing generator and
contrast-checked by the existing test. Set `RENAMED = {}` and `THEME_BLURBS` to one farm line each.

- [ ] **Step 4: Icons and lettering**

Edit `tools/make-inked.py`'s list to the game-icons farm set:
- Delapouite: barn, farm-tractor, windmill, watering-can, seedling, coins, sickle, pitchfork, cow, chicken,
  farmer, house, sun-cloud;
- Lorc: wheat, sprout, scarecrow, field, scythe.

Regenerate `hooks/inked.ts`.

Then run `tools/make-font.py`:
- point it at Pixelify Sans Bold (google/fonts `ofl/pixelifysans/PixelifySans[wght].ttf` at weight 700);
- export the name `PIXEL` in `hooks/pixel-font.ts`;
- point `headingPicture` at it.

Pixelify Sans has no Reserved Font Name, so the converted outlines may keep the name.

- [ ] **Step 5: Farmhands and the farmer**

`farmhands.ts` builds on `FARMERS`, `FARMER_WALK` and recolours. It uses the existing recolour technique from
`make-heroes.py`: palette swaps of the Kenney farmers give 12 distinct looks.

Compaction draws three bees circling into a jar above the head. It mirrors `condensing`: the same RUNE_WAVE
timing and `scrollY` parameter, with bees as yellow and black 1-pixel pairs.

- [ ] **Step 6: Swap the call sites**

In `register.tsx`, `characters.ts` and `showcase.ts`:
- `heroOf` → `farmhandOf`;
- `heroSvg` → `farmhandSvg`;
- `overlordSvg` → `farmerSvg`;
- `assignHero` → `assignFarmhand`;
- `diePicture` → `seedPicture` (the spinner);
- the crit die → the prize pumpkin (`CROP_STAGES` has no pumpkin, so draw a 16 by 16 pumpkin in
  `own-sprites.ts` as `PUMPKIN` and use it).

Rename the visible words:

| Old | New |
|---|---|
| Your Party | Farmhands |
| The camp | The shed |
| Quest log | The day's log |
| Graveyard | The compost heap |
| The Realm Map | Fields |
| Asleep | Fallow |
| Hall of Heroes | The Barn |
| The DM's Tome | The Almanac |
| Open/Close DM screen | Open farm / Close farm |
| Overlord | The Farmer (default name) |

The heading glyphs are `field`, `barn`, `pitchfork` and `scarecrow`.

- [ ] **Step 7: Sounds**

`sounds/make-sounds.py` fetches each CC0 source from the spec's sound table, trims it to 1.5 s or less with a
fade, mixes it to mono 22.05 kHz 16-bit and writes the WAVs:

| File | Source |
|---|---|
| `set-out.wav` | tractor start |
| `done.wav` | harvest chime + coins |
| `needs-you.wav` | rooster |
| `error.wav` | a low cow moo |
| `stopped.wav` | sheep |
| `level-up.wav` | Kenney jingle |
| `critical.wav` | coins + jingle |
| `cluck.wav`, `oink.wav` | for Collect |

`CREDITS.md` lists each source URL, author and licence.

- [ ] **Step 8: Run tests and validate**

Run: `claude plugin test mods/furrowfield && claude plugin validate mods/furrowfield`

Expected: all pass, and "✔ Validation passed". `grep -rn "Overlord\|dungeon\|Dungeon\|hero" mods/furrowfield/hooks`
returns only code comments that explain where a part came from.

- [ ] **Step 9: Commit**

```bash
git add -A mods/furrowfield && git commit -m "Furrowfield: farmhands, farm words, themes, icons, lettering and sounds"
```

---

### Task 6: The Farm page and the General Store

**Files:**
- Create: `mods/furrowfield/hooks/scene.ts`
- Modify:
  - `mods/furrowfield/hooks/register.tsx`: the view `'farm'` as the first page, the store section, and the
    Harvest / Collect / Buy handlers;
  - `mods/furrowfield/hooks/settings.ts`: a `hemisphere: Hemisphere` setting, default `'north'`, with the
    `/farm hemisphere north|south` command.
- Test: `mods/furrowfield/tests/scene.test.ts`, `mods/furrowfield/tests/store.test.ts`

**Interfaces:**
- Consumes:
  - `Farm`, `stageOf`, `seasonOf`, `seedsInSeason`, `plant`, `harvest`, `buyPlot`, `buyBuilding`, `buyAnimal`,
    `collect`, `waitingProduce`, `houseLevel`, `coinsOf`, `CROPS`, `ANIMALS`, `BUILDINGS` (Task 2);
  - `changeFarm` (Task 3);
  - the sprites (Task 4).
- Produces:
  - from `scene.ts`:
    `farmSceneSvg(farm: Farm, season: Season, now: number, width: number): { svg: string; width: number; height: number }`;
  - `act` keys in the panel:
    - `plant:<plotId>:<crop>`;
    - `harvest:<plotId>`;
    - `collect:<animalId>`;
    - `buy-plot`;
    - `buy-building:<id>`;
    - `buy-animal:<kind>`;
    - `view-farm`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/scene.test.ts
import { describe, expect, test } from 'claude-code/testing'

import { buyAnimal, buyBuilding, buyPlot, earn, emptyFarm, plant, type Farm, type Outcome } from '../hooks/farm'
import { farmSceneSvg } from '../hooks/scene'

const ok = (o: Outcome): Farm => { if (!o.ok) throw new Error(o.why); return o.farm }
const JUNE = new Date(2026, 5, 15, 12).getTime()

describe('the farm scene', () => {
  test('draws one plot per plot, the season ground, and each animal and building', () => {
    let farm = earn(emptyFarm(), 'gift', 'chore', 500, 0)
    farm = ok(plant(farm, 'p1', 'tomato', JUNE, 'north'))
    farm = ok(buyAnimal(ok(buyBuilding(farm, 'coop', JUNE)), 'chicken', JUNE))
    const scene = farmSceneSvg(farm, 'summer', JUNE, 320)
    expect(scene.width).toBe(320)
    expect(scene.svg.match(/data-plot=/g)).toHaveLength(4)
    expect(scene.svg).toContain('data-building="coop"')
    expect(scene.svg).toContain('data-animal="chicken-1"')
    expect(scene.svg).toContain('data-season="summer"')
  })

  test('narrow widths wrap plots into more rows instead of overflowing', () => {
    let farm = earn(emptyFarm(), 'gift', 'chore', 10_000, 0)
    for (let n = 0; n < 12; n += 1) farm = ok(buyPlot(farm, JUNE + n))
    const wide = farmSceneSvg(farm, 'summer', JUNE, 480)
    const narrow = farmSceneSvg(farm, 'summer', JUNE, 200)
    expect(narrow.width).toBe(200)
    expect(narrow.height).toBeGreaterThan(wide.height)
  })
})
```

```ts
// tests/store.test.ts: panel tests, using pals.test.ts's engine/pane helpers (move them to tests/helpers.ts first)
import { describe, expect, test } from 'claude-code/testing'

import { coinsOf, earn, emptyFarm, readFarm } from '../hooks/farm'
import { engine, pane, said } from './helpers'

describe('the General Store', () => {
  test('buying a seed and planting it takes one press, and the coins drop', async ($, on) => {
    engine(on)
    await $.store.set('farm', earn(emptyFarm(), 'gift', 'chore', 20, 0))
    const ui = await $.ui.mount(pane('desktop'))
    await ui.press({ key: 'view-farm' })
    const seed = (await ui.findAll({ type: 'Button' })).map(b => String(b.key)).find(k => k.startsWith('plant:p1:'))
    expect(seed).toBeDefined()
    await ui.press({ key: seed ?? '' })
    expect(coinsOf(readFarm(await $.store.get('farm')))).toBeLessThan(20)
    await ui.unmount()
  })

  test('things you cannot afford say why instead of failing silently', async ($, on) => {
    const bench = engine(on)
    const ui = await $.ui.mount(pane('desktop'))
    await ui.press({ key: 'view-farm' })
    await ui.press({ key: 'buy-building:windmill' })
    expect(bench.toasts.join()).toMatch(/costs 150 coins/)
    await ui.unmount()
  })

  test('the farm page fits a narrow panel', async ($, on) => {
    engine(on)
    await $.store.set('farm', earn(emptyFarm(), 'gift', 'chore', 10_000, 0))
    const ui = await $.ui.mount({ ...pane('desktop'), props: { ...pane('desktop').props, bodyColumns: 40 } })
    await ui.press({ key: 'view-farm' })
    expect(await said(ui)).toMatch(/General Store/)
    await ui.unmount()
  })
})
```

Run: `claude plugin test mods/furrowfield`

Expected: FAIL. `../hooks/scene` is missing, and so is the key `view-farm`.

- [ ] **Step 2: Write `hooks/scene.ts`**

```ts
// The Farm page's picture: the season's ground, a row of buildings, the
// plots in rows that wrap to the width, and the animals by their homes.
// One SVG, pixel art at 2x, each part tagged (data-*) so tests can find it.

import { BUILDINGS, stageOf, type BuildingId, type Farm, type Season } from './farm'
import { ANIMAL_ART, BUILDING_ART, CROP_STAGES, TILES } from './farm-sprites'
import { PIG, SILO, STY, WINDMILL } from './own-sprites'

const CELL = 32 // one 16px tile at 2x
const GROUND: Record<Season, string> = { spring: '#7FC66B', summer: '#5FAE4E', autumn: '#B5893F', winter: '#DDE6EE' }

const tile = (art: string, x: number, y: number, tag: string) =>
  `<g ${tag} transform="translate(${x} ${y}) scale(2)" shape-rendering="crispEdges">${art}</g>`

export function farmSceneSvg(farm: Farm, season: Season, now: number, width: number) {
  const perRow = Math.max(2, Math.floor((width - CELL) / CELL))
  const ownArt: Partial<Record<BuildingId, string>> = { silo: SILO, sty: STY, windmill: WINDMILL[Math.floor(now / 400) % WINDMILL.length] ?? '' }
  const buildings = (Object.keys(BUILDINGS) as BuildingId[]).filter(id => Object.hasOwn(farm.buildings, id))
  const plots = Object.keys(farm.plots).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  const animals = Object.entries(farm.animals)
  const rowsOf = (count: number) => Math.max(1, Math.ceil(count / perRow))
  const buildingRows = buildings.length === 0 ? 0 : rowsOf(buildings.length)
  const plotTop = CELL / 2 + buildingRows * CELL
  const animalTop = plotTop + rowsOf(plots.length) * CELL + CELL / 2
  const height = animalTop + (animals.length === 0 ? 0 : rowsOf(animals.length) * CELL) + CELL / 2
  const at = (index: number, top: number) => ({ x: CELL / 2 + (index % perRow) * CELL, y: top + Math.floor(index / perRow) * CELL })

  const parts = [
    `<rect width="${width}" height="${height}" fill="${GROUND[season]}" data-season="${season}"/>`,
    ...buildings.map((id, i) => {
      const p = at(i, CELL / 2)
      return tile(ownArt[id] ?? BUILDING_ART[id as keyof typeof BUILDING_ART] ?? '', p.x, p.y, `data-building="${id}"`)
    }),
    ...plots.map((id, i) => {
      const p = at(i, plotTop)
      const plot = farm.plots[id]
      const crop = plot?.crop ?? null
      const art = TILES.soil + (crop === null ? '' : (CROP_STAGES[crop][stageOf(farm, id)] ?? ''))
      return tile(art, p.x, p.y, `data-plot="${id}"`)
    }),
    ...animals.map(([id, animal], i) => {
      const p = at(i, animalTop)
      const frames = animal.kind === 'pig' ? PIG : ANIMAL_ART[animal.kind as 'chicken' | 'sheep' | 'cow']
      return tile(frames[Math.floor(now / 600 + i) % frames.length] ?? '', p.x, p.y, `data-animal="${id}"`)
    }),
  ]
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${parts.join('')}</svg>`, width, height }
}
```

The scene redraws when the farm changes, not per frame (the windmill and animals turn as the farm changes).
Pass the result through `animatedSvg` with 4 frames (`now` + n × 400), so it moves by itself with no redraws,
as DM's portraits do.

- [ ] **Step 3: The Farm page in `register.tsx`**

Make the farm the first page:
- add `'farm'` to the `view` union in `types/index.d.ts`, and make it the default view;
- add a `Farm` tab first in the header row: `act('view-farm', 'Farm', ...)`.

`if (showing === 'farm')` draws, top to bottom:
1. A line: `heading('page', 'Your farm', 'field')`, the coins (`${coinsOf(f)} coins`) and the season name.
2. The scene picture: `farmSceneSvg(f, season, now, bodyColumns × 7 px, capped at 520)`.
3. **Ready now** (only when non-empty): one row per ripe plot with `Harvest <Crop>` (key `harvest:<plotId>`),
   and one row per animal with waiting produce, `Collect <n> <item>` (key `collect:<animalId>`).
4. **The General Store**, a folding section like the others, holding:
   - **Seeds**: for each empty plot, buttons for each in-season seed, `Plant <Crop> · <seed> coins` (key
     `plant:<plotId>:<crop>`), shown for the first empty plot only, with "<n> more empty plots" after;
   - **Land**: `Buy a plot · 20 coins` (key `buy-plot`);
   - **Buildings**: each building not yet owned, in cost order, `Build <label> · <cost>` (key
     `buy-building:<id>`), with the farmhouse only at its next level;
   - **Animals**: for each owned home, `Buy a <animal> · <cost>` (key `buy-animal:<kind>`).

Every handler calls `changeFarm` with the rule, then:
- on `{ ok: false, why }`, `$.ui.toast(why)`;
- on success, plays `done.wav` (harvest), `cluck.wav` / `oink.wav` (collect), or nothing (buys).

The `line` breakpoint applies, so narrow panels stack.

- [ ] **Step 4: The hemisphere setting**

`settings.ts`:
- add `hemisphere: Hemisphere` (default `'north'`);
- `readRealmAsk` accepts `hemisphere north|south`.

The Almanac gets a "Seasons" picker with Northern and Southern.

- [ ] **Step 5: Run tests and validate**

Run: `claude plugin test mods/furrowfield && claude plugin validate mods/furrowfield`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A mods/furrowfield && git commit -m "Furrowfield: the Farm page and the General Store"
```

---

### Task 7: Achievements and the Barn

**Files:**
- Modify:
  - `mods/furrowfield/hooks/farm-achievements.ts`;
  - `mods/furrowfield/hooks/register.tsx` (`unlock` calls; the Barn page shows harvest totals and coins
    earned/spent).
- Test: `mods/furrowfield/tests/pals.test.ts` (`describe('achievements')`)

**Interfaces:**
- Consumes: `unlock($, id)` (from DM), `Farm`, `coinsOf`, `houseLevel`, `seasonOf`.
- Produces: `farmAchievementsDue(farm: Farm, hemisphere: Hemisphere): AchievementId[]` in
  `farm-achievements.ts`. It covers the achievements decidable from the farm alone:
  - `green-thumb`: 50 crop entries;
  - `full-coop`: 4 chickens;
  - `homesteader`: house level 3;
  - `big-spender`: 500 spent;
  - `every-season`: crop entries in 4 seasons.

  `register.tsx` calls it after every `changeFarm`.

  The other achievements are unlocked at their moments:
  - `first-harvest`: the first `crop` entry;
  - `prize-pumpkin`: on the prize;
  - `tractor-time`: 5 helpers at once (DM's full-party check);
  - `early-bird`: a turn before 7 am;
  - `hard-times`: the compost heap reaching 10.

- [ ] **Step 1: Write the failing tests**

```ts
// in tests/farm.test.ts
import { farmAchievementsDue } from '../hooks/farm-achievements'

describe('farm achievements', () => {
  test('earned from the farm itself', () => {
    let farm = earn(emptyFarm(), 'gift', 'chore', 10_000, 0)
    for (let n = 0; n < 50; n += 1) farm = earn(farm, `crop:p1:${n}`, 'crop', 5, n)
    farm = ok(buyBuilding(farm, 'coop', JUNE))
    for (let n = 0; n < 4; n += 1) farm = ok(buyAnimal(farm, 'chicken', JUNE + n))
    for (const id of ['house-1', 'house-2', 'house-3'] as const) farm = ok(buyBuilding(farm, id, JUNE))
    expect(farmAchievementsDue(farm, 'north').sort()).toEqual(['big-spender', 'full-coop', 'green-thumb', 'homesteader'])
  })
})
```

Run: `claude plugin test mods/furrowfield`

Expected: FAIL. `farmAchievementsDue` is missing.

- [ ] **Step 2: Implement**

```ts
export function farmAchievementsDue(farm: Farm, hemisphere: Hemisphere): AchievementId[] {
  const crops = Object.values(farm.earned).filter(one => one.kind === 'crop')
  const spent = Object.values(farm.spent).reduce((sum, one) => sum + one.coins, 0)
  const due: AchievementId[] = []
  if (crops.length >= 50) due.push('green-thumb')
  if (Object.values(farm.animals).filter(one => one.kind === 'chicken').length >= PER_BUILDING) due.push('full-coop')
  if (houseLevel(farm) === 3) due.push('homesteader')
  if (spent >= 500) due.push('big-spender')
  if (new Set(crops.map(one => seasonOf(one.at, hemisphere))).size === 4) due.push('every-season')
  return due
}
```

Wire the moment-based achievements at their call sites, and replace `ARCHIVES_FOR_SWEEP` with
`COMPOST_FOR_HARD_TIMES = 10`. The Barn page shows, above the farmhand cards:
- crops harvested;
- produce collected;
- coins earned and spent;
- achievements.

- [ ] **Step 3: Run the tests and see them pass, then commit**

Run: `claude plugin test mods/furrowfield`

Expected: PASS.

```bash
git add -A mods/furrowfield && git commit -m "Furrowfield: farm achievements and the Barn"
```

---

### Task 8: Showcase, README, credits and the icon

**Files:**
- Modify: `hooks/showcase.ts` (a made-up farm, `showcaseFarm(now)`), `hooks/register.tsx` (showcase uses it)
- Create:
  - `README.md`, `CREDITS.md`, `LICENSE` (MIT, © 2026 Nico Britz, with the third-party note and no D&D line);
  - `tools/icon.svg`, `.claude-plugin/icon.png`.
- Test: `tests/pals.test.ts`: the showcase test asserts that a made-up farm shows and the real farm's coins do not.

**Interfaces:**
- Produces: `showcaseFarm(now: number): Farm`, a farm with 8 plots at mixed stages, a coop with 3 chickens, a
  barn with 1 cow, a windmill, farmhouse level 2, and 240 coins.

- [ ] **Step 1: Write the failing showcase test**

```ts
test('showcase shows a made-up farm, never the real coins', async ($, on) => {
  engine(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.store.set('farm', earn(emptyFarm(), 'gift', 'chore', 4242, 0))
  await $.command.run({ command: 'farm', args: 'showcase', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'view-farm' })
  expect(await said(ui)).not.toMatch(/4242/)
  expect(await said(ui)).toMatch(/240 coins/)
  await ui.unmount()
})
```

Run: `claude plugin test mods/furrowfield`

Expected: FAIL, because 4242 shows.

- [ ] **Step 2: Implement `showcaseFarm` and use it**

Build `showcaseFarm` with the Task 2 functions from `emptyFarm()`:
1. `earn` a 1000-coin gift.
2. Make the purchases.
3. Plant at mixed times, then add chores so the stages vary.
4. Finally, `spent` is adjusted with one balancing entry so `coinsOf` is exactly 240.

In `drawPane`, when `isShowcase`, use `showcaseFarm(shownAt)` in place of `await read($, farm)`. All farm
buttons are no-ops with the toast "This is a showcase farm."

- [ ] **Step 3: The icon**

Draw `tools/icon.svg`: a 64 by 64 viewBox, a rounded dark-loam square with a wheat-gold border, and a pixel
seedling in a soil mound (two leaves, a stem, three soil rows). Render it to a 1024 by 1024 PNG with headless
Chrome, as for DM's icon:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1024,1024 --screenshot=mods/furrowfield/.claude-plugin/icon.png file://<scratch>/icon.html
```

- [ ] **Step 4: README and CREDITS**

Write the README in DM's structure:
1. The one-paragraph pitch.
2. Pictures (Markdown images in `media/`, added in Task 9).
3. A "What's on the farm" table (5 pages).
4. "How the farm grows" (coins, crops, animals, buildings, seasons).
5. The strip and spinner.
6. Install: `/plugin install furrowfield --marketplace NicBritz/claude-code-mods`.
7. "The buttons need one setting": the same allow rules as DM.
8. Commands (`/farm`, `/farm settings`, `/farm name`, `/farm theme`, `/farm volume`, `/farm hemisphere`,
   `/farm showcase`, `/farm status`, switches).
9. **What it keeps and reads**: DM's section with `furrowfield` paths and `prefs.json`, plus "the farm: coins
   and what you planted, bought and collected, in the mod's own store".
10. Licence, Credits, For tinkerers.
11. A line saying Furrowfield and Dungeon Master both use the strip, so install one of them.

`CREDITS.md`:
- Kenney Tiny Farm and Tiny Town (CC0);
- our own drawings;
- game-icons authors and icon names (CC BY 3.0);
- Pixelify Sans (OFL 1.1, Stefie Justprince);
- each sound with its URL and author (CC0).

`hooks/credits.ts` mirrors it for the Almanac.

- [ ] **Step 5: Run tests and validate, then commit**

Run: `claude plugin test mods/furrowfield && claude plugin validate mods/furrowfield`

Expected: all pass.

```bash
git add -A mods/furrowfield && git commit -m "Furrowfield: showcase farm, README, credits and icon"
```

---

### Task 9: Add to the shop, pictures, directory check

**Files:**
- Modify: `.claude-plugin/marketplace.json`, `README.md` (repo root)
- Create: `mods/furrowfield/media/*.png`, `media/*.gif`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: List it in the shop**

Append to `plugins` in `.claude-plugin/marketplace.json`:

```json
{
  "name": "furrowfield",
  "source": "./mods/furrowfield",
  "description": "A cosy pixel farm: your helpers are farmhands, your sessions are fields, and finished work grows a farm of your own. No tokens used."
}
```

Add a row to the root README's "The mods" table, and the install line for `furrowfield`.

Run: `claude plugin validate .`

Expected: "✔ Validation passed".

- [ ] **Step 2: Load it live and try it**

1. In the dev session, point hot reload at `mods/furrowfield`. Copy it to the dev-mods folder with
   `rsync -a --delete --exclude '.claude-plugin/types' --exclude 'tools'`, and remove `dungeon-master` from
   `CLAUDE_CODE_PLUGIN_DIRS` for this test, because both draw the strip. Only Nico may edit his settings; ask
   him.
2. Check each of these in the real app:
   - the strip;
   - the spinner;
   - a farm-job tool row;
   - each panel page;
   - planting, harvesting after three turns, buying a coop and a chicken, and collecting the next day;
   - light and dark;
   - a narrow panel.

- [ ] **Step 3: Pictures**

Ask Nico to run `/farm showcase` and paste screenshots of each page and the strip, plus one short recording.
Check each for private details, convert them into `media/`, and reference them in the README with Markdown
images.

- [ ] **Step 4: Commit and push**

```bash
git add -A && git commit -m "Furrowfield 0.1.0 in the shop" && git push
```

- [ ] **Step 5: Directory validation**

In Nico's Chrome, open claude.ai/directory/manage and start **Submit new** → **Plugin bundle**. Enter
`https://github.com/NicBritz/claude-code-mods/tree/main/mods/furrowfield` and press **Validate**.

Expected: "Validation passed", with zero blocking. Fix any blocker, push, and re-validate. Stop at the
Compliance step: Nico agrees to the terms and submits himself, with auto-publish off and a scheduled check.

---

## Self-review notes

**Spec coverage:**

| Spec section | Task |
|---|---|
| Goals | 1 |
| What's on screen | 5, 6 |
| Farm game | 2, 3, 6 |
| Achievements | 7 |
| Prices | 2 (Global Constraints) |
| Data | 2, 3 |
| Art, sound, lettering | 4, 5 |
| Themes | 5 |
| Safety and the directory | Global Constraints, 1, 8, 9 |
| Testing | every task |
| Release | 9 |

- **Types:**
  - `Outcome` and `Farm` are used identically in Tasks 2, 6, 7 and 8;
  - `farmSceneSvg` has the same signature in Task 6's test and implementation;
  - `farmhandSvg` keeps `heroSvg`'s parameter order.
- **Review Focus items:**
  1. Pinned in Tasks 2 and 3.
  2. Pinned in Tasks 2 and 3.
  3. Pinned in Task 2 (`readFarm`).
  4. Pinned in Task 2 (`dayKey`, produce).
  5. Pinned in Task 6 (the narrow-layout test).
