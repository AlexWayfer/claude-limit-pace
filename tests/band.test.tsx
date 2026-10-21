import { expect, mock, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-10-21T12:00:00Z')

const BAND = {
  plugin: 'limit-pace',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const SETTINGS = {
  plugin: 'limit-pace',
  component: 'Pane',
  requestId: 'limit-pace-settings',
  props: {
    title: 'Limit pace',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

// What the stand-in /config menu was asked to write
const saved: { key: string; value: unknown }[] = []

const start = async ($: any, on: any, rateLimits: SessionUsage['rateLimits']) => {
  saved.length = 0
  // Stands for the engine when the mod passes
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('config.list', () => ({
    value: [
      { key: 'limit-pace@alexw-local.week', label: 'Week', kind: 'choice', value: 'Always' },
      { key: 'limit-pace@alexw-local.session', label: 'Session', kind: 'choice', value: 'Always' },
      { key: 'limit-pace@alexw-local.threshold', label: 'Close within, %', kind: 'number', value: 0 },
      { key: 'limit-pace@alexw-local.format', label: 'Figures', kind: 'choice', value: 'Used / pace' },
      { key: 'limit-pace@alexw-local.separator', label: 'Separator', kind: 'choice', value: '|' },
      { key: 'limit-pace@alexw-local.show_reset', label: 'Show time to reset', kind: 'toggle', value: true },
      { key: 'limit-pace@alexw-local.ring', label: 'Usage ring', kind: 'choice', value: 'After figures' },
    ],
  }))
  on('config.set', (_: unknown, e: { key: string; value: unknown }) => {
    saved.push({ key: e.key, value: e.value })

    return { value: e.value }
  })
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: { startedAt: NOW, context: {}, rateLimits } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

test('the band shows the pace of both windows', async ($, on) => {
  // Week resets in 5 days: 2 of 7 days elapsed, about 29%; 5 hours resets in 3: 40% elapsed
  await start($, on, [
    { kind: 'seven_day', percentUsed: 41.3, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
    { kind: 'five_hour', percentUsed: 10, resetsAt: new Date(NOW + 3 * HOUR).toISOString() },
  ])

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await terminal.find({ type: 'Text', text: /Week/ }))?.text).toBe(
    'Week 41% / 29%  |  Session 10% / 40%',
  )
  // Used share in the pace color, the even pace left dim
  expect((await terminal.find({ type: 'Text', text: /^41%$/ }))?.props.color).toBe('error')
  expect((await terminal.find({ type: 'Text', text: /^10%$/ }))?.props.color).toBe('success')
  await terminal.unmount()

  // Desktop: a ring per window, the figures beside it, the details in its tooltip
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // The first ring is the week's, ahead of pace, so red
  const week = await desktop.find({ type: 'Svg' })
  expect(week?.props.alt).toBe('Week: used 41%, pace 29%, resets in 5d 0h')
  expect(String(week?.props.source)).toContain('#e5534b')
  // Figures, then the ring; no parentheses while the time to reset is off
  const children = (await desktop.find({ type: 'Box', key: 'Week' }))?.children as { type: string }[]
  expect(children.map(child => child.type)).toEqual(['Text', 'Svg'])
  expect((await desktop.find({ type: 'Text', text: /^Week/ }))?.text).toBe('Week 41% / 29%')
  expect((await desktop.find({ type: 'Text', text: /^Session/ }))?.text).toBe('Session 10% / 40%')
  await desktop.unmount()
})

test('the time to reset goes in parentheses after the ring', { options: { show_reset: true } }, async ($, on) => {
  await start($, on, [
    { kind: 'seven_day', percentUsed: 41.3, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
  ])

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const children = (await desktop.find({ type: 'Box', key: 'Week' }))?.children as { type: string }[]
  expect(children.map(child => child.type)).toEqual(['Text', 'Svg', 'Text'])
  expect((await desktop.find({ type: 'Text', text: /^\(5d 0h\)$/ }))?.text).toBe('(5d 0h)')
  await desktop.unmount()
})

test('the ring can be turned off on desktop', { options: { ring: 'Nowhere' } }, async ($, on) => {
  await start($, on, [
    { kind: 'seven_day', percentUsed: 41.3, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
  ])

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Svg' })).toBeUndefined()
  expect((await desktop.find({ type: 'Text', text: /Week/ }))?.text).toBe('Week 41% / 29%')
  await desktop.unmount()
})

for (const [place, order] of [
  ['Start', ['Svg', 'Text', 'Text']],
  ['End', ['Text', 'Text', 'Svg']],
] as const) {
  test(`the ring goes to the ${place.toLowerCase()} of each window`, { options: { ring: place, show_reset: true } }, async ($, on) => {
    await start($, on, [
      { kind: 'seven_day', percentUsed: 41.3, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
    ])

    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const children = (await desktop.find({ type: 'Box', key: 'Week' }))?.children as { type: string }[]
    expect(children.map(child => child.type)).toEqual([...order])
    await desktop.unmount()
  })
}

test(
  'the band takes the chosen separator and shows the time to reset',
  { options: { separator: '·', show_reset: true } },
  async ($, on) => {
    await start($, on, [
      { kind: 'seven_day', percentUsed: 41.3, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
      { kind: 'five_hour', percentUsed: 10, resetsAt: new Date(NOW + 3 * HOUR).toISOString() },
    ])

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /Week/ }))?.text).toBe(
      'Week 41% / 29% (5d 0h)  ·  Session 10% / 40% (3h 0m)',
    )
    await ui.unmount()
  },
)

test('the settings pane changes the band and saves to /config', async ($, on) => {
  await start($, on, [
    { kind: 'seven_day', percentUsed: 41.3, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
    { kind: 'five_hour', percentUsed: 10, resetsAt: new Date(NOW + 3 * HOUR).toISOString() },
  ])

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'settings' })

  const pane = await $.ui.mount({ ...SETTINGS, surface: 'desktop' })
  // The settings follow the band's own order: windows, threshold, figures, ring, time, separator
  const fields = (await pane.find({ type: 'Box' }))?.children as { props: { key?: string } }[]
  expect(fields.map(field => field.props.key)).toEqual([
    'week',
    'session',
    'threshold-row',
    'format',
    'ring',
    'show_reset',
    'separator',
    'close',
  ])
  await pane.select({ key: 'separator', value: '•' })
  expect((await band.find({ type: 'Text', text: /Week/ }))?.text).toBe(
    'Week 41% / 29%  •  Session 10% / 40%',
  )
  await pane.select({ key: 'show_reset', value: 'on' })

  expect((await band.find({ type: 'Text', text: /Week/ }))?.text).toBe(
    'Week 41% / 29% (5d 0h)  •  Session 10% / 40% (3h 0m)',
  )
  await pane.select({ key: 'format', value: 'Deviation' })
  expect((await band.find({ type: 'Text', text: /Week/ }))?.text).toBe(
    'Week +12% (5d 0h)  •  Session -30% (3h 0m)',
  )

  // A bad threshold is refused; a good one widens the yellow zone and is saved
  await pane.input({ key: 'threshold', text: 'abc' })
  await pane.input({ key: 'threshold', text: '30' })
  expect((await band.find({ type: 'Text', text: /^-30%$/ }))?.props.color).toBe('warning')
  await pane.select({ key: 'session', value: 'Never' })
  expect((await band.find({ type: 'Text', text: /Week/ }))?.text).toBe('Week +12% (5d 0h)')

  expect(saved).toEqual([
    { key: 'limit-pace@alexw-local.separator', value: '•' },
    { key: 'limit-pace@alexw-local.show_reset', value: true },
    { key: 'limit-pace@alexw-local.format', value: 'Deviation' },
    { key: 'limit-pace@alexw-local.threshold', value: 30 },
    { key: 'limit-pace@alexw-local.session', value: 'Never' },
  ])
  await pane.unmount()
  await band.unmount()
})

test('the deviation format shows the signed gap to an even pace', { options: { format: 'Deviation' } }, async ($, on) => {
  await start($, on, [
    { kind: 'seven_day', percentUsed: 41.3, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
    { kind: 'five_hour', percentUsed: 10, resetsAt: new Date(NOW + 3 * HOUR).toISOString() },
  ])

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Week/ }))?.text).toBe('Week +12%  |  Session -30%')
  expect((await ui.find({ type: 'Text', text: /^\+12%$/ }))?.props.color).toBe('error')
  await ui.unmount()
})

// Week resets in 5 days, so its even pace is 29%; each case sets how much is used
for (const [threshold, used, color] of [
  [0, 29.4, 'warning'], // 29% / 29%: exactly on pace, the only yellow at 0
  [0, 28, 'success'],
  [0, 30, 'error'],
  [5, 24, 'warning'], // 24% / 29%: within 5 of pace
  [5, 23, 'success'],
] as const) {
  test(`at a threshold of ${threshold}, ${used}% of a 29% pace is ${color}`, { options: { threshold } }, async ($, on) => {
    await start($, on, [
      { kind: 'seven_day', percentUsed: used, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
    ])

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: new RegExp(`^${Math.round(used)}%$`) }))?.props.color).toBe(color)
    await ui.unmount()
  })
}

test(
  'a window shown when close hides while green',
  { options: { week: 'When close', session: 'When close' } },
  async ($, on) => {
    await start($, on, [
      { kind: 'seven_day', percentUsed: 41.3, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
      { kind: 'five_hour', percentUsed: 10, resetsAt: new Date(NOW + 3 * HOUR).toISOString() },
    ])

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /Week/ }))?.text).toBe('Week 41% / 29%')
    expect(await ui.find({ type: 'Text', text: /Session/ })).toBeUndefined()
    await ui.unmount()
  },
)

test('with every window hidden the gear stays alone', { options: { week: 'Never', session: 'Never' } }, async ($, on) => {
  await start($, on, [
    { kind: 'seven_day', percentUsed: 41.3, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
  ])

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Week/ })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'settings' }))?.props.label).toBe('⚙')
  await ui.unmount()
})

test('a window past its reset is stale and drops out', async ($, on) => {
  await start($, on, [
    { kind: 'seven_day', percentUsed: 18, resetsAt: new Date(NOW + 5 * 24 * HOUR).toISOString() },
    { kind: 'five_hour', percentUsed: 19, resetsAt: new Date(NOW - 10 * 60 * 1000).toISOString() },
  ])

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Week/ }))?.text).toBe('Week 18% / 29%')
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBeUndefined()
  await ui.unmount()
})

test('the band is left to the engine before the first rate-limit reading', async ($, on) => {
  await start($, on, [])

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
