import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Limit } from '../types'

const HOUR = 60 * 60 * 1000
const SETTINGS_PANE = 'limit-pace-settings'

// Length of each rate-limit window, to know how much of it has elapsed
const WINDOWS: { kind: string; label: string; length: number }[] = [
  { kind: 'seven_day', label: 'Week', length: 7 * 24 * HOUR },
  { kind: 'five_hour', label: 'Session', length: 5 * HOUR },
]

// Same lists as the manifest's options
const ALWAYS = 'Always'
const WHEN_CLOSE = 'When close'
const NEVER = 'Never'
const VISIBILITIES = [ALWAYS, WHEN_CLOSE, NEVER]
const USED_OVER_PACE = 'Used / pace'
const DEVIATION = 'Deviation'
const FORMATS = [USED_OVER_PACE, DEVIATION]
const RING_NOWHERE = 'Nowhere'
const RING_START = 'Start'
const RING_AFTER_FIGURES = 'After figures'
const RING_END = 'End'
const RING_PLACES = [RING_NOWHERE, RING_START, RING_AFTER_FIGURES, RING_END]
const SEPARATORS = ['|', '·', '•', '/', '—']

const limits = atom({ plugin: 'limit-pace', key: 'limits' } as const, [])
const now = atom({ plugin: 'limit-pace', key: 'now' } as const, 0)
const weekShown = atom({ plugin: 'limit-pace', key: 'week' } as const, ALWAYS)
const sessionShown = atom({ plugin: 'limit-pace', key: 'session' } as const, ALWAYS)
const threshold = atom({ plugin: 'limit-pace', key: 'threshold' } as const, 0)
const format = atom({ plugin: 'limit-pace', key: 'format' } as const, USED_OVER_PACE)
const separator = atom({ plugin: 'limit-pace', key: 'separator' } as const, '|')
const showReset = atom({ plugin: 'limit-pace', key: 'showReset' } as const, false)
const ringPlace = atom({ plugin: 'limit-pace', key: 'ring' } as const, RING_AFTER_FIGURES)

const toLimits = (list: SessionRateLimit[]): Limit[] =>
  list.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt }))

const toVisibility = (value: unknown) =>
  typeof value === 'string' && VISIBILITIES.includes(value) ? value : ALWAYS

const toThreshold = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0

// How far usage runs from an even pace: behind it by more than the threshold, within the
// threshold of it, or ahead of it
type Level = 'behind' | 'close' | 'ahead'

const levelOf = (diff: number, margin: number): Level =>
  diff > 0 ? 'ahead' : diff >= -margin ? 'close' : 'behind'

const TEXT_COLORS = { behind: 'success', close: 'warning', ahead: 'error' } as const

// Fixed colors: SVG markup does not follow the app theme, so pick ones readable on dark and light
const RING_TRACK = '#8b8b8b55'
const RING_COLORS = { behind: '#3fb950', close: '#d29922', ahead: '#e5534b' } as const
const RING_PACE = '#c9c9c9'

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// A usage ring like the app's own: the arc is the used share, the tick marks an even pace
const ring = (used: number, elapsed: number, level: Level, title: string) => {
  const radius = 6
  const circumference = 2 * Math.PI * radius
  const arc = (Math.min(Math.max(used, 0), 100) / 100) * circumference
  const angle = (elapsed / 100) * 2 * Math.PI - Math.PI / 2
  const tick = (r: number) =>
    `${(8 + r * Math.cos(angle)).toFixed(2)} ${(8 + r * Math.sin(angle)).toFixed(2)}`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">` +
    `<title>${escapeXml(title)}</title>` +
    `<circle cx="8" cy="8" r="${radius}" fill="none" stroke="${RING_TRACK}" stroke-width="2.5"/>` +
    `<circle cx="8" cy="8" r="${radius}" fill="none" stroke="${RING_COLORS[level]}"` +
    ` stroke-width="2.5" stroke-dasharray="${arc.toFixed(2)} ${circumference.toFixed(2)}"` +
    ` transform="rotate(-90 8 8)"/>` +
    `<path d="M ${tick(radius - 2)} L ${tick(radius + 2)}" stroke="${RING_PACE}" stroke-width="1.2" stroke-linecap="round"/>` +
    `</svg>`
  )
}

// Time left as its two largest units: 4d 3h, 2h 15m, 40m
const formatLeft = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

const toFormat = (value: unknown) => (value === DEVIATION ? DEVIATION : USED_OVER_PACE)

const toSeparator = (value: unknown) =>
  typeof value === 'string' && SEPARATORS.includes(value) ? value : '|'

const toRingPlace = (value: unknown) =>
  typeof value === 'string' && RING_PLACES.includes(value) ? value : RING_AFTER_FIGURES

// A choice made in the ⚙ pane is kept in the plugin's own store, not written to the settings,
// together with the setting's value it replaced: once that setting changes, the setting wins
type Choice = { value: unknown; option: unknown }

const sameOption = (one: unknown, other: unknown) =>
  JSON.stringify(one ?? null) === JSON.stringify(other ?? null)

const chosen = async ($: EngineInterface, field: string, option: unknown) => {
  const stored = (await $.store.get(`choice.${field}`)) as Choice | undefined
  return stored && sameOption(stored.option, option) ? stored.value : option
}

const choose = ($: EngineInterface, field: string, value: unknown, option: unknown) =>
  $.store.set(`choice.${field}`, { value, option: option ?? null })

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const week = toVisibility(await chosen($, 'week', options.week))
    const session = toVisibility(await chosen($, 'session', options.session))
    const margin = toThreshold(await chosen($, 'threshold', options.threshold))
    const figures = toFormat(await chosen($, 'format', options.format))
    const mark = toSeparator(await chosen($, 'separator', options.separator))
    const isResetShown = (await chosen($, 'show_reset', options.show_reset)) === true
    const place = toRingPlace(await chosen($, 'ring', options.ring))
    await update($, weekShown, () => week)
    await update($, sessionShown, () => session)
    await update($, threshold, () => margin)
    await update($, format, () => figures)
    await update($, separator, () => mark)
    await update($, showReset, () => isResetShown)
    await update($, ringPlace, () => place)
    const usage = await $.session.usage()
    await update($, limits, () => toLimits(usage.rateLimits))
    const at = await $.clock.now()
    await update($, now, () => at)
    // Elapsed share of a window grows with time alone, so redraw every minute; the limits are
    // read again too, so a reading the engine got without a turn of ours is not missed
    $.clock.every(60000, () => {
      void $.session.usage().then(fresh => update($, limits, () => toLimits(fresh.rateLimits)))
      void $.clock.now().then(t => update($, now, () => t))
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => toLimits(e.rateLimits))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const list = await read($, limits)
    const at = await read($, now)
    const isDeviation = (await read($, format)) === DEVIATION
    const mark = await read($, separator)
    const isResetShown = await read($, showReset)
    const place = await read($, ringPlace)
    const margin = await read($, threshold)
    const visibility: Record<string, string> = {
      seven_day: await read($, weekShown),
      five_hour: await read($, sessionShown),
    }

    const measured = WINDOWS.flatMap(window => {
      const limit = list.find(one => one.kind === window.kind)
      if (!limit?.resetsAt) return []
      const left = Date.parse(limit.resetsAt) - at
      // Past its reset the reading is stale (the window is fresh now); wait for a new one
      if (left <= 0) return []
      const elapsed = Math.min(Math.max((1 - left / window.length) * 100, 0), 100)
      // Positive: burning faster than an even pace; negative: reserve left. Taken from the
      // rounded figures, so 30% / 30% is exactly on pace as drawn
      const diff = Math.round(limit.percentUsed) - Math.round(elapsed)
      const level = levelOf(diff, margin)

      const details = isResetShown ? [formatLeft(left)] : []

      const tooltip =
        `${window.label}: used ${Math.round(limit.percentUsed)}%, ` +
        `pace ${Math.round(elapsed)}%, resets in ${formatLeft(left)}`

      return [
        { kind: window.kind, label: window.label, diff, level, details, used: limit.percentUsed, elapsed, tooltip },
      ]
    })

    if (measured.length === 0) return next(e)

    const rows = measured.filter(row => {
      const shown = visibility[row.kind] ?? ALWAYS
      return shown === ALWAYS || (shown === WHEN_CLOSE && row.level !== 'behind')
    })

    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements

    // Either the signed deviation from an even pace, or the used share (in the pace color)
    // over the even-pace share (dim)
    const paceText = (row: (typeof rows)[number]) => {
      const color = TEXT_COLORS[row.level]

      return isDeviation ? (
        <Text>
          {row.label}{' '}
          <Text color={color}>
            {row.diff > 0 ? '+' : ''}
            {row.diff}%
          </Text>
        </Text>
      ) : (
        <Text>
          {row.label}{' '}
          <Text color={color}>{Math.round(row.used)}%</Text>
          {` / ${Math.round(row.elapsed)}%`}
        </Text>
      )
    }
    const detailsText = (row: (typeof rows)[number]) =>
      row.details.length > 0 ? `(${row.details.join(', ')})` : ''

    // Desktop draws a usage ring per window; the terminal keeps one line of text
    const Svg =
      place !== RING_NOWHERE && e.surface === 'desktop' && 'Svg' in elements
        ? elements.Svg
        : undefined
    const figures =
      Svg ? (
        <Box flexDirection="row" alignItems="center" gap="sm">
          {rows.map((row, index) => {
            const usageRing = (
              <Svg
                source={ring(row.used, row.elapsed, row.level, row.tooltip)}
                alt={row.tooltip}
                width={16}
                height={16}
                isInteractive
              />
            )

            return (
              <Box key={row.label} flexDirection="row" alignItems="center" gap="xs">
                {index > 0 && <Text dimColor>{mark}</Text>}
                {place === RING_START && usageRing}
                <Text dimColor tabular>
                  {paceText(row)}
                </Text>
                {place === RING_AFTER_FIGURES && usageRing}
                {row.details.length > 0 && (
                  <Text dimColor tabular>
                    {detailsText(row)}
                  </Text>
                )}
                {place === RING_END && usageRing}
              </Box>
            )
          })}
        </Box>
      ) : (
        <Text dimColor tabular>
          {rows.map((row, index) => (
            <Text>
              {index > 0 ? `  ${mark}  ` : ''}
              {paceText(row)}
              {row.details.length > 0 ? ` ${detailsText(row)}` : ''}
            </Text>
          ))}
        </Text>
      )

    // With every window hidden the gear stays alone: the desktop has no other way to the settings
    return (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        {rows.length > 0 ? figures : <Text> </Text>}
        <Button
          key="settings"
          label="⚙"
          plain
          dimColor
          onPress={() => void $.ui.open({ id: SETTINGS_PANE, title: 'Limit pace', focus: true })}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: SETTINGS_PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    // The mobile app draws no Select yet
    if (!('Select' in elements)) {
      const { Text } = elements

      return <Text dimColor>Settings are not available here.</Text>
    }
    const { Box, Button, Input, Select, Text } = elements
    const week = await read($, weekShown)
    const session = await read($, sessionShown)
    const margin = await read($, threshold)
    const figures = await read($, format)
    const place = await read($, ringPlace)
    const isResetShown = await read($, showReset)
    const mark = await read($, separator)

    // In the order the band draws what they change
    return (
      <Box flexDirection="column" gap="sm">
        <Select
          key="week"
          label="Week"
          options={VISIBILITIES.map(value => ({ value }))}
          value={week}
          onSelect={value => {
            void update($, weekShown, () => value)
            void choose($, 'week', value, options.week)
          }}
        />
        <Select
          key="session"
          label="Session"
          options={VISIBILITIES.map(value => ({ value }))}
          value={session}
          onSelect={value => {
            void update($, sessionShown, () => value)
            void choose($, 'session', value, options.session)
          }}
        />
        {/* Input takes no width of its own: a narrow Box keeps a percent field from spanning the pane */}
        <Box key="threshold-row" flexDirection="row" alignItems="center" gap="sm">
          <Text>Close within, %</Text>
          <Box width={10}>
            <Input
              key="threshold"
              placeholder="0"
              value={String(margin)}
              submitLabel="save"
              onSubmit={text => {
                const value = Number(text.trim().replace(',', '.'))
                if (text.trim() === '' || !Number.isFinite(value) || value < 0 || value > 100) {
                  $.ui.toast('Limit pace: the threshold is a number from 0 to 100')
                  return
                }
                void update($, threshold, () => value)
                void choose($, 'threshold', value, options.threshold)
              }}
            />
          </Box>
        </Box>
        <Select
          key="format"
          label="Figures"
          options={FORMATS.map(value => ({ value }))}
          value={figures}
          onSelect={value => {
            void update($, format, () => value)
            void choose($, 'format', value, options.format)
          }}
        />
        <Select
          key="ring"
          label="Usage ring"
          options={RING_PLACES.map(value => ({ value }))}
          value={place}
          onSelect={value => {
            void update($, ringPlace, () => value)
            void choose($, 'ring', value, options.ring)
          }}
        />
        <Select
          key="show_reset"
          label="Show time to reset"
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          value={isResetShown ? 'on' : 'off'}
          onSelect={value => {
            const isOn = value === 'on'
            void update($, showReset, () => isOn)
            void choose($, 'show_reset', isOn, options.show_reset)
          }}
        />
        <Select
          key="separator"
          label="Separator"
          options={SEPARATORS.map(value => ({ value }))}
          value={mark}
          onSelect={value => {
            void update($, separator, () => value)
            void choose($, 'separator', value, options.separator)
          }}
        />
        <Button
          key="close"
          label="Close"
          role="dismiss"
          onPress={() => void $.ui.close({ id: SETTINGS_PANE })}
        />
      </Box>
    )
  })
}
