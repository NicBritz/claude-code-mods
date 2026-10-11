# Dungeon Master

Run Claude Code like a D&D table. Claude is your character at the head of the party; every helper it
sends off on a task is a pixel hero who walks, asks, wins and falls in a side panel: your DM screen.
Everything runs inside the mod: it adds nothing to Claude's prompt, registers no tool for Claude, and costs
no tokens.

<p align="center"><img src="media/party.png" alt="The DM screen: three pixel heroes on quests with context bars, the camp of background work, and the graveyard" width="420"></p>

## What is on the DM screen

| Page | What you get |
|---|---|
| **Your Party** | A hero for every helper Claude sends out (Fighter, Wizard, Rogue and nine more), walking while they work, with what they are doing, how much context they have left, **Stop**, and **Allow** / **Deny** when one asks permission. Below: **the camp** (commands and monitors left running in the background, with Stop), the **quest log** (a receipt for each of your last turns) and the **graveyard** (finished heroes, their last words and XP). |
| **The Realm Map** | Every Claude session open in the desktop app, sorted into Pinned, Needs you, Working, Idle, Asleep and Archived. **Go** jumps to one, **Archive** (or **Archive all**) clears the ones you are done with, **Restore** brings one back, and **Name** gives a session your own quest name. |
| **Hall of Heroes** | Each hero's XP and level across sessions, their record, and ten **achievements** to earn. |
| **The DM's Tome** | Settings: **choose your character** (the Overlord or any hero, with its tale and ability scores, and your own name), the strip, sounds and volume, the rolling d20, ten D&D themes in light and dark (following the app), the heading lettering, which sections show, and the credits. |

Above the message box sits **the strip**: your character, how much context is left, your plan's 5-hour and
weekly limits, and one button to open or close the DM screen. While Claude works, a d20 tumbles beside the
working line; win a long quest and it lands on a **natural 20**. Tool steps read as deeds: Studied,
Forged, Cast, Scouted.

## Install

At the prompt of a Claude Code session in a terminal:

```
/plugin install dungeon-master --marketplace NicBritz/claude-code-mods
```

Answer `y` to add the marketplace, then pick the user scope. It opens in your next session (switch that off
in the Tome).

Mods are an early-access part of Claude Code, so a future update may change them. The DM screen is built
for the Claude desktop app; in a terminal you get the same pages in text.

## The buttons need one setting

In auto mode the app only approves actions you asked Claude for, and a click on the map is not one, so it
refuses until you allow the two session tools. Add this to `~/.claude/settings.json` (a `permissions`
section next to `env`), then start a new session:

```json
"permissions": {
  "allow": [
    "mcp__ccd_session_mgmt__archive_session",
    "mcp__ccd_session_mgmt__unarchive_session",
    "mcp__ccd_session_mgmt__list_sessions",
    "TaskStop"
  ]
}
```

Archiving is undoable (the sidebar's Archived list, or Restore), but the rule also lets Claude archive
sessions without asking. The map's **ⓘ Archive not working?** button shows the same.

The DM screen only ever uses tools these rules allow, so it never costs a token: in auto mode any other
tool would go to the mode's checker, which is a model call. Without a rule its button says which line to
add and does nothing, and the map asks for the session list only once when you open it. `TaskStop` is what
the **Stop** buttons use.

## Commands

- `/dm` opens the DM screen; `/dm settings` opens the Tome; `/dm demo` plays a 40-second show of heroes,
  context bars and compaction
- `/dm showcase` swaps in made-up heroes, sessions and quests for 5 minutes, so you can take screenshots
  without showing anything of your own
- `/dm status` says what is on and how the map is doing (for bug reports)
- `/dm name <name>` names your character; `/dm theme <name>`; `/dm font fantasy|app`; `/dm volume 0-100`
- `/dm <hud|rows|dice|sound|panel> on|off`

## What it keeps and reads

Mods run with your own permissions on your machine, unsandboxed, so here is everything this one touches.

- **Writes** to `~/.claude/dungeon-master/` (or `$CLAUDE_CONFIG_DIR/dungeon-master/`): `settings.json` (your
  settings, shared by every open session), `names.json` (names you give sessions) and `sessions/<id>.json`
  (each open session checks in every few seconds with its folder name, what it is doing and its context
  left, so the map can show it; **never your prompts**). Plus the mod's own store: the Hall of Heroes,
  achievements and which sections are folded.
- **Reads** those files from your other open sessions, the app's own session list (and the file the app saves
  it to when it is long, only from its own tool-results folder), and the output of background commands you
  started in this session (the camp shows their newest line).
- **Checks light or dark** every 30 seconds, so the DM screen follows the app: the one
  `userThemeMode` value in the Claude app's `config.json`, else the Mac's appearance (`defaults read -g
  AppleInterfaceStyle`).
- **Asks the app** for its session list only while the Realm Map is on screen, and archives or restores a
  session only when you press the button.
- **Opens** only the app's own `claude://` session links (Go), with macOS `open`.

## Licence

MIT, © 2026 Nico Britz (see `LICENSE`). The bundled art, lettering and sounds keep their own licences
(below). An unofficial fan work: Dungeons & Dragons is a trademark of Wizards of the Coast.

## Credits

Heroes, the Overlord and items: 0x72's DungeonTileset II (CC0). D&D icons: Lorc, Delapouite and Skoll on
game-icons.net (CC BY 3.0). Heading lettering: converted from Cinzel Decorative by Natanael Gama (SIL Open
Font Licence). Sounds: Kenney's RPG Audio and Impact Sounds (CC0). Full details in `CREDITS.md`, the
licence texts in `licences/`, and the Tome's **Credits and licences** section.

## For tinkerers

- `hooks/register.tsx`: every hook and every drawing (the engine follows `$` only within this file)
- `hooks/*.ts`: the pure parts (heroes, sprites, art, characters, achievements, map rules, themes, words)
- `tools/`: the generators for sprites, icons and lettering; `sounds/make-sounds.py` for the sounds
- `tests/`: `claude plugin test mods/dungeon-master`
