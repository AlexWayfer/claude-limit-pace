# Limit pace

A Claude Code mod that shows, above the prompt, how your plan usage compares with an even pace
through the weekly and the 5-hour windows.

```
Week 18% / 31% ◔  ·  Session 19% / 12% ◔
```

The first figure is how much of the window you have used: green while you are behind an even pace,
yellow when close to it, red when ahead. The second, dim, is how much of the window has passed:
the share you would have used by now at an even pace.

In the Claude desktop app's Code tab each window also gets a usage ring, with a tick at the even
pace; hover it for the details. In a terminal the line stays plain text.

## Install

It comes from the [alexwayfer](https://github.com/AlexWayfer/claude-plugins) marketplace. At the
prompt of a Claude Code terminal session:

```
/plugin marketplace add AlexWayfer/claude-plugins
/plugin install limit-pace@alexwayfer
```

The line appears after the first answer of a session: that is when Claude Code first learns your
limits. It needs a claude.ai Pro or Max plan.

## Settings

The plugin's settings (`/config` in a terminal session, or the plugin's settings page) set the
defaults. Press ⚙ at the right end of the line to change them from the line itself: a choice made
there is kept in the plugin's own store across sessions, until you change that setting again.

| Setting | Values | Default |
| --- | --- | --- |
| Week, Session | Always, When close (yellow or red only), Never | Always |
| Close within, % | How far below an even pace counts as close and turns yellow | 0 |
| Figures | `Used / pace` (`18% / 31%`) or `Deviation` (`-13%`) | Used / pace |
| Usage ring | Nowhere, Start, After figures, End | After figures |
| Show time to reset | Adds `(4d 20h)` | Off |
| Separator | `\|` `·` `•` `/` `—` | `\|` |

## How it works

It is a [hooks-module mod](https://code.claude.com/docs/en/plugins/mods/reference): it draws the
`AbovePrompt` band from the rate-limit windows Claude Code reports with each answer
(`session.measure`, `$.session.usage()`). A window past its reset time is hidden until a fresh
reading arrives.

What it reads and writes:

- reads the rate-limit figures and the reset times Claude Code already has;
- keeps the choices made in the ⚙ pane in its own plugin store (`$.store`), keyed `choice.<setting>`;
- changes no Claude Code settings, runs no commands, and sends nothing over the network.

Known limits of the desktop app: it hides the band while its own next-step card is shown, and
its plugin page shows no settings for a plugin installed from the command line.

## Similar plugins

- [Usage Bars](https://github.com/pepperonas/usage-bars): animated bars under the prompt with a
  pace mark, projection and styles.

## Development

```bash
claude plugin validate .
claude plugin test .
```
