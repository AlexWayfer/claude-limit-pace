# Notes for agents working on limit-pace

A Claude Code hooks-module mod: `hooks/register.tsx`, named in `hooks/hooks.json` under `modules`.
Its `$.state` contract is `types/index.d.ts`, named in `plugin.json` as `types`.

## Release

- Work on `main`. The Anthropic Directory tracks the `release` branch only, and a GitHub webhook
  picks up every push to it within minutes.
- To release: raise `version` in `.claude-plugin/plugin.json`, push `main`, then
  `git push origin main:release`. Never push to `release` without a new `version`: installs keep
  the old copy when the version stays the same.
- The public marketplace is a separate repository, `AlexWayfer/claude-plugins`, which points at
  this one with a `github` source. Keep `marketplace.json` out of this repository.

## Checks before a push

```bash
claude plugin validate --strict .
claude plugin test .
```

Type-check with the `tsconfig.json` from the header of the engine's `claude-code` typings.

On a machine where Claude Code comes with the desktop app, `claude` is not on `PATH`: the CLI is
`claude.exe` under the app's data folder, `claude-code\<version>\<hash>\`, and the version folder
changes with each update.

To check a clean install from the public marketplace without touching your own setup, point
`CLAUDE_CONFIG_DIR` at a fresh temporary folder. Keep that path short on Windows: a long one fails
the marketplace clone with "Filename too long".

## Local development

- The working copy is installed from a local directory marketplace, `alexw-local`, whose
  `.claude-plugin/marketplace.json` sits in this folder's parent and lists `./limit-pace`. It is
  read in place: edit, then `/reload-plugins`.
- Removing a marketplace uninstalls its plugins and deletes their saved `pluginConfigs` options:
  copy them from `~/.claude/settings.json` first and put them back after reinstalling.

## Directory submission

- The portal warns that `plugin.json` has an unknown `types` field. Keep it: the mod's state
  contract needs it, and the warning doesn't block.
- The listing icon is `.claude-plugin/icon.png`, taken only the first time the plugin is saved or
  submitted in the portal.
- `classification` isn't documented; its values follow similar listings (`claude-settings`,
  `engineering`).

## Constraints learned the hard way

- `read` and `update` must name an atom declared with `atom(...)` directly at the call site. The
  engine lists state from the source, and an atom passed through a variable or a list makes the
  module fail to load.
- Keep one setting per atom. An object value in the `PluginState` contract reads back as
  `unknown`.
- Don't write settings with `$.config.set`: the directory portal blocks a computed key and holds
  any settings write for review. Choices made in the ⚙ pane go to `$.store` as
  `choice.<field>` = `{ value, option }` and apply while the `userConfig` value still equals
  `option`, so a later change of that setting wins.
- Draw `Svg` only after checking `e.surface === 'desktop'`: the terminal's element table has it at
  run time too, though its typings don't.
- Rate limits reach the mod only with this session's API responses. A window past its
  `resetsAt` is stale: hide it until a fresh reading arrives.
- Keep the README sections on what the plugin reads and writes, and on privacy, in step with the
  code: the directory's security scan looks for behavior the plugin doesn't disclose.

## The desktop app

- It draws the `AbovePrompt` band, but not `SessionMode` labels, and it hides the band while its
  own next-step card is shown, whatever the mod returns.
- The band's frame and width are the app's own. Mods can't draw in the side cards (Environment,
  Context).
- Its plugin page shows no settings for a plugin installed from the command line, hence the ⚙
  pane.
- Its `Box` width unit is about 4 px, the terminal's a cell: `width={10}` drew a field about 28 px
  wide, too narrow to show a number, and `width={64}` about 225 px. Nothing documents the unit;
  size a `Box` per `e.surface`.
- A similar mod, [Usage Bars](https://github.com/pepperonas/usage-bars), draws `PromptHint` under
  the prompt instead.
