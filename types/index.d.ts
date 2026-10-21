export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'limit-pace': {
      limits: Limit[]
      now: number
      week: string
      session: string
      threshold: number
      format: string
      separator: string
      showReset: boolean
      ring: string
    }
  }
}
