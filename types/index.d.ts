export type View =
  | { mode: 'list' }
  | { mode: 'preview'; path: string; chunk: number }

declare module 'claude-code' {
  interface PluginState {
    touched: {
      /** absolute path -> ms epoch of the change */
      files: Record<string, number>
      view: View
      /** ms epoch the session started */
      startedAt: number
      cwd: string
    }
  }
}
