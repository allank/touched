import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { View } from '../types'
import { chunksOf } from './chunks'
import { baseNameOf, rowTitleOf, splitFrontmatter, titleOf } from './title'

const PANE = 'touched'
const files = atom({ plugin: 'touched', key: 'files' } as const, {} as Record<string, number>)
const view = atom({ plugin: 'touched', key: 'view' } as const, { mode: 'list' } as View)
const startedAt = atom({ plugin: 'touched', key: 'startedAt' } as const, 0)
const cwd = atom({ plugin: 'touched', key: 'cwd' } as const, '')

/** Scrolling is a nicety: a refused or unavailable scroll never breaks the pane. */
async function scrollTo($: { ui: { scroll: (a: { in: string; to: 'start' | 'end' }) => Promise<unknown> } }, to: 'start' | 'end') {
  try {
    await $.ui.scroll({ in: PANE, to })
  } catch {
    // nothing to scroll
  }
}

const EDITING = ['Edit', 'Write'] as const
// This build's tool-name types list Bash only; PowerShell is the Windows shell tool.
const SHELL = ['Bash', 'PowerShell'] as unknown as ['Bash']
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

function isMarkdown(path: unknown): path is string {
  return typeof path === 'string' && /\.md$/i.test(path)
}

/** 1-9 then a-z; later rows have no hotkey. */
function hotkeyFor(index: number): string | undefined {
  if (index < 9) {
    return String(index + 1)
  }

  return LETTERS[index - 9]  // undefined past 'z'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'touched',
      description: 'List the markdown files changed this session',
    })

    if ((await read($, startedAt)) === 0) {
      const now = await $.clock.now()
      await update($, startedAt, () => now)
    }

    await update($, cwd, () => e.cwd ?? '')

    return next(e)
  })

  on('tool.call', { tool: EDITING }, async ($, e, next) => {
    const result = await next(e)
    const path = (e as { file_path?: unknown }).file_path

    if (result.deny === undefined && result.isError !== true && isMarkdown(path)) {
      const now = await $.clock.now()
      await update($, files, all => ({ ...all, [path]: now }))
    }

    return result
  })

  // A shell tool is a refresh trigger, never parsed: after a call that may
  // have written, ask git which markdown files changed and keep the new ones.
  on('tool.call', { tool: SHELL }, async ($, e, next) => {
    let result: Awaited<ReturnType<typeof next>> | undefined

    try {
      result = await next(e)

      return result
    } finally {
      const mayHaveWritten = result === undefined || (result.deny === undefined && result.isReadOnly !== true)

      if (mayHaveWritten) {
        await rescan($).catch(() => undefined)
      }
    }
  })

  on('command.run', { command: 'touched' }, async $ => {
    await update($, view, (): View => ({ mode: 'list' }))
    await $.ui.open({ id: PANE, title: 'Touched', focus: true, closeOnEscape: true })

    return { text: 'Touched pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const current = await read($, view)
    const all = await read($, files)

    if (current.mode === 'preview') {
      const { path } = current
      let text: string | undefined

      try {
        text = await $.fs.read(path)
      } catch {
        text = undefined
      }

      const back = (
        <Button key="back" plain hotkey="q" onPress={() => update($, view, (): View => ({ mode: 'list' }))}>
          Back
        </Button>
      )

      if (text === undefined) {
        return (
          <Box flexDirection="column">
            {back}
            <Text>{baseNameOf(path)} could not be read.</Text>
          </Box>
        )
      }

      const chunks = chunksOf(splitFrontmatter(text).body)
      const total = chunks.length
      const at = Math.min(Math.max(current.chunk, 0), total - 1)
      const go = async (to: number) => {
        await update($, view, (): View => ({ mode: 'preview', path, chunk: to }))
        await scrollTo($, 'start')
      }

      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            {back}
            <Button key="prev" plain hotkey="p" onPress={() => go(Math.max(0, at - 1))}>
              Prev
            </Button>
            <Button key="next" plain hotkey="n" onPress={() => go(Math.min(total - 1, at + 1))}>
              Next
            </Button>
            <Button key="top" plain hotkey="g" onPress={() => scrollTo($, 'start')}>
              Top
            </Button>
            <Button key="end" plain hotkey="e" onPress={() => scrollTo($, 'end')}>
              End
            </Button>
          </Box>
          <Text bold>{titleOf(text) ?? baseNameOf(path).replace(/\.md$/i, '')}</Text>
          <Text dimColor>
            {baseNameOf(path)} · page {at + 1} of {total}
          </Text>
          <Markdown key="content" text={chunks[at] ?? ''} />
        </Box>
      )
    }

    const rows: { path: string; title: string; at: number }[] = []

    for (const path of Object.keys(all)) {
      if (!(await $.fs.exists(path))) {
        continue
      }

      try {
        rows.push({ path, title: rowTitleOf(await $.fs.read(path), path), at: all[path] ?? 0 })
      } catch {
        rows.push({ path, title: baseNameOf(path).replace(/\.md$/i, '') + ' (no title)', at: all[path] ?? 0 })
      }
    }

    rows.sort((a, b) => b.at - a.at)

    if (rows.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No markdown files changed this session.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {rows.map((row, i) => (
          <Button
            key={'row-' + i}
            plain
            hotkey={hotkeyFor(i)}
            onPress={() => update($, view, (): View => ({ mode: 'preview', path: row.path, chunk: 0 }))}
          >
            {row.title + ' — ' + baseNameOf(row.path)}
          </Button>
        ))}
        <Text dimColor>{rows.length === 1 ? '1 file' : rows.length + ' files'} · newest first</Text>
      </Box>
    )
  })
}

async function rescan($: any) {
  const since = await read($, startedAt)
  const base = await read($, cwd)
  const out = await $.process.run(['git', 'ls-files', '-m', '-o', '--exclude-standard', '--', '*.md'])

  if (out.exitCode !== 0) {
    return
  }

  for (const rel of String(out.stdout).split('\n')) {
    if (rel.trim() === '') {
      continue
    }

    const path = rel.startsWith('/') ? rel : base.replace(/\/$/, '') + '/' + rel

    try {
      const stat = await $.fs.stat(path)

      if (stat.kind === 'file' && stat.mtimeMs >= since) {
        await update($, files, all => ({ ...all, [path]: Math.max(all[path] ?? 0, stat.mtimeMs) }))
      }
    } catch {
      // deleted or unreadable: not listed
    }
  }
}
