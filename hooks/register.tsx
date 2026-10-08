import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { View } from '../types'
import { chunksOf } from './chunks'
import { baseNameOf, displayTitleOf, rowTitleOf, splitFrontmatter, stemOf } from './title'

const PANE = 'touched'
/** absolute path -> ms epoch (file mtime) of its latest change */
const files = atom({ plugin: 'touched', key: 'files' } as const, {} as Record<string, number>)
const view = atom({ plugin: 'touched', key: 'view' } as const, { mode: 'list' } as View)
const startedAt = atom({ plugin: 'touched', key: 'startedAt' } as const, 0)
const cwd = atom({ plugin: 'touched', key: 'cwd' } as const, '')

const EDITING = ['Edit', 'Write'] as const
// This build's tool-name types list Bash only; PowerShell is the Windows shell tool.
const SHELL = ['Bash', 'PowerShell'] as unknown as ['Bash']
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

type Engine = EngineInterface

function isMarkdown(path: unknown): path is string {
  return typeof path === 'string' && /\.md$/i.test(path)
}

/** 1-9 then a-z; later rows have no hotkey. */
function hotkeyFor(index: number): string | undefined {
  return index < 9 ? String(index + 1) : LETTERS[index - 9]
}

const showList = ($: Engine) => update($, view, (): View => ({ mode: 'list' }))
const showPreview = ($: Engine, path: string, chunk: number) =>
  update($, view, (): View => ({ mode: 'preview', path, chunk }))

/** Scrolling is a nicety: a refused or unavailable scroll never breaks the pane. */
async function scrollTo($: Engine, to: 'start' | 'end') {
  try {
    await $.ui.scroll({ in: PANE, to })
  } catch {
    // nothing to scroll
  }
}

/** When a file last changed, by the file system's clock: the one clock every path shares. */
async function changedAtOf($: Engine, path: string): Promise<number> {
  try {
    return (await $.fs.stat(path)).mtimeMs
  } catch {
    return $.clock.now()
  }
}

async function track($: Engine, path: string, changedAt: number) {
  await update($, files, all => ({ ...all, [path]: Math.max(all[path] ?? 0, changedAt) }))
}

// A shell tool is a refresh trigger, never parsed: after a call that may have
// written, ask git which markdown files changed and keep the new ones.
async function rescan($: Engine) {
  const since = await read($, startedAt)
  const base = (await read($, cwd)).replace(/\/$/, '')
  const out = await $.process.run(['git', 'ls-files', '-m', '-o', '--exclude-standard', '--', ':(icase)*.md'])

  if (out.exitCode !== 0) {
    return
  }

  for (const rel of out.stdout.split('\n')) {
    if (!isMarkdown(rel.trim())) {
      continue
    }

    const path = rel.startsWith('/') || base === '' ? rel : base + '/' + rel

    try {
      const stat = await $.fs.stat(path)

      if (stat.kind === 'file' && stat.mtimeMs >= since) {
        await track($, path, stat.mtimeMs)
      }
    } catch {
      // deleted or unreadable: not listed
    }
  }
}

type Elements = ReturnType<Engine['ui']['resolve']>

async function renderPreview($: Engine, el: Elements, path: string, chunk: number) {
  const { Box, Text, Button, Markdown } = el
  let text: string | undefined

  try {
    text = await $.fs.read(path)
  } catch {
    text = undefined
  }

  const back = (
    <Button key="back" plain hotkey="q" onPress={() => showList($)}>
      Back
    </Button>
  )

  if (text === undefined) {
    return (
      <Box flexDirection="column">
        {back}
        <Text>{baseNameOf(path)} could not be read (it may be over 4 MiB).</Text>
      </Box>
    )
  }

  const pages = chunksOf(splitFrontmatter(text).body)
  const total = pages.length
  const page = Math.min(Math.max(chunk, 0), total - 1)
  const go = async (to: number) => {
    await showPreview($, path, to)
    await scrollTo($, 'start')
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {back}
        <Button key="prev" plain hotkey="p" onPress={() => go(Math.max(0, page - 1))}>
          Prev
        </Button>
        <Button key="next" plain hotkey="n" onPress={() => go(Math.min(total - 1, page + 1))}>
          Next
        </Button>
        <Button key="top" plain hotkey="g" onPress={() => scrollTo($, 'start')}>
          Top
        </Button>
        <Button key="end" plain hotkey="e" onPress={() => scrollTo($, 'end')}>
          End
        </Button>
      </Box>
      <Text bold>{displayTitleOf(text, path).title}</Text>
      <Text dimColor>
        {baseNameOf(path)} · page {page + 1} of {total}
      </Text>
      <Markdown key="content" text={pages[page] ?? ''} />
    </Box>
  )
}

async function renderList($: Engine, el: Elements) {
  const { Box, Text, Button } = el
  const all = await read($, files)
  const rows: { path: string; title: string; changedAt: number }[] = []

  for (const [path, changedAt] of Object.entries(all)) {
    if (!(await $.fs.exists(path))) {
      continue
    }

    try {
      rows.push({ path, title: rowTitleOf(await $.fs.read(path), path), changedAt })
    } catch {
      rows.push({ path, title: stemOf(path) + ' (no title)', changedAt })
    }
  }

  rows.sort((a, b) => b.changedAt - a.changedAt)

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
        <Button key={'row-' + i} plain hotkey={hotkeyFor(i)} onPress={() => showPreview($, row.path, 0)}>
          {row.title + ' — ' + baseNameOf(row.path)}
        </Button>
      ))}
      <Text dimColor>{rows.length === 1 ? '1 file' : rows.length + ' files'} · newest first</Text>
    </Box>
  )
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
      await track($, path, await changedAtOf($, path))
    }

    return result
  })

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
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })

      return { text: 'Touched pane closed.' }
    }

    await showList($)
    await $.ui.open({ id: PANE, title: 'Touched', focus: true, closeOnEscape: true })

    return { text: 'Touched pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e)
    const current = await read($, view)

    return current.mode === 'preview'
      ? renderPreview($, el, current.path, current.chunk)
      : renderList($, el)
  })
}
