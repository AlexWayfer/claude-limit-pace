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
- The band's frame and width are the app's own.
- Its plugin page shows no settings for a plugin installed from the command line, hence the ⚙
  pane.
