# Claude Code mods by Nico Britz

Small, fun extras for [Claude Code](https://claude.com/claude-code), built as mods (TypeScript that runs
inside Claude Code itself). Every mod here is free to use **and free to run**: none of them add to Claude's
prompt or call a model, so they never spend a token.

## The mods

| Mod | What it does |
|---|---|
| [Dungeon Master](mods/dungeon-master) | Run Claude Code like a D&D table: a DM screen of pixel heroes for every helper Claude sends out, your character above the message box, a rolling d20, a Realm Map of your sessions, levels and achievements, ten D&D themes in light and dark. |

More are on the way.

## Install a mod

At the prompt of a Claude Code session in a terminal:

```
/plugin install dungeon-master --marketplace NicBritz/claude-code-mods
```

Answer `y` to add this marketplace, then pick the user scope. Swap `dungeon-master` for any mod in the
table. Each mod's own README says what it needs and what it reads and writes on your machine.

Mods run with your own permissions, unsandboxed, like any plugin. Read a mod's README (or run
`claude plugin validate mods/<name>`) before you install it.

## Licence

MIT, © 2026 Nico Britz (see [LICENSE](LICENSE)). Art, fonts and sounds a mod bundles from others keep
their own licences, listed in that mod's `CREDITS.md`.
