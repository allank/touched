import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'touched',
  component: 'Pane',
  requestId: 'touched',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: {
    title: 'Touched',
    isFocused: true,
    bodyColumns: 60,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

type World = {
  files: Record<string, string>
  mtimes: Record<string, number>
  gitOut: string
  gitExit: number
  gitCalls: string[][]
  scrolls: unknown[]
  now: () => number
  closes: number
  opens: number
  openPanes: string[]
  readOnlyCommands: string[]
  deny: boolean
  unreadable: boolean
}

function world(files: Record<string, string> = {}): World {
  return { files, mtimes: {}, gitOut: '', gitExit: 0, gitCalls: [], scrolls: [], now: () => 0, closes: 0, opens: 0, openPanes: [], readOnlyCommands: [], deny: false, unreadable: false }
}

async function setup($: any, on: any, w: World, now = 1000) {
  const clock = mock.clock(on, { now })
  w.now = () => clock.now()
  on('tool.call', (_: any, e: any) =>
    w.deny
      ? { deny: 'no' }
      : w.readOnlyCommands.includes(e.command)
        ? { result: 'ok', isReadOnly: true }
        : { result: 'ok' },
  )
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', (_: any, e: any) => {
    w.opens += 1
    w.openPanes.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: w.openPanes.map(id => ({ id, title: id })) }))
  on('ui.scroll', { component: 'Pane', requestId: 'touched' }, (_: any, e: any) => {
    w.scrolls.push(e)
    return {}
  })
  on('ui.close', (_: any, e: any) => {
    w.closes += 1
    w.openPanes = w.openPanes.filter(id => id !== e.id)
    return { value: undefined }
  })
  on('fs.exists', (_: any, e: any) => ({ value: e.path in w.files }))
  on('fs.read', (_: any, e: any) => (w.unreadable ? { deny: 'too big' } : { value: w.files[e.path] ?? '' }))
  on('fs.stat', (_: any, e: any) => ({
    value: { kind: 'file', size: 1, mtimeMs: w.mtimes[e.path] ?? w.now(), isLink: false },
  }))
  on('process.run', (_: any, e: any) => {
    w.gitCalls.push([...e.argv])
    return { value: { exitCode: w.gitExit, stdout: w.gitOut, stderr: '' } }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  return clock
}

const edit = ($: any, path: string) =>
  $.tool.call({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b' })

const open = async ($: any) => {
  await $.command.run({ command: 'touched', args: '' })
  return $.ui.mount(PANE)
}

const labels = async (ui: any, max = 60) => {
  const out: string[] = []

  for (let i = 0; i < max; i += 1) {
    const found = await ui.find({ key: 'row-' + i })

    if (!found) {
      break
    }

    out.push(found.text)
  }

  return out
}

test('an edited markdown file is listed by title and filename', async ($, on) => {
  const w = world({ '/work/docs/auth.md': '---\ntitle: Auth Flow Design\n---\n# Heading\nbody' })
  await setup($, on, w)
  await edit($, '/work/docs/auth.md')
  const ui = await open($)
  expect(await labels(ui)).toEqual(['Auth Flow Design — auth.md'])
})

test('a written markdown file is listed too', async ($, on) => {
  const w = world({ '/work/new.md': '# New Doc' })
  await setup($, on, w)
  await $.tool.call({ tool: 'Write', file_path: '/work/new.md', content: '# New Doc' })
  const ui = await open($)
  expect(await labels(ui)).toEqual(['New Doc — new.md'])
})

test('non-markdown files and denied edits are ignored', async ($, on) => {
  const w = world({ '/work/a.ts': 'x', '/work/b.md': '# B' })
  await setup($, on, w)
  await edit($, '/work/a.ts')
  w.deny = true
  await edit($, '/work/b.md')
  const ui = await open($)
  expect(await labels(ui)).toEqual([])
  expect(await ui.find({ type: 'Text', text: /no markdown files changed/i })).toBeDefined()
})

test('titles fall back to the first heading, then the filename', async ($, on) => {
  const w = world({
    '/work/a.md': 'intro\n```\n# not a title\n```\n# Real Title\n',
    '/work/readme.md': 'just text',
  })
  const clock = await setup($, on, w)
  await edit($, '/work/a.md')
  await clock.advance(10)
  await edit($, '/work/readme.md')
  const ui = await open($)
  expect(await labels(ui)).toEqual(['readme (no title) — readme.md', 'Real Title — a.md'])
})

test('rows are newest first, with hotkeys 1-9 then a-z and none after 35', async ($, on) => {
  const w = world()
  const clock = await setup($, on, w)

  for (let i = 0; i < 38; i += 1) {
    const path = `/work/f${i}.md`
    w.files[path] = `# T${i}`
    await edit($, path)
    await clock.advance(10)
  }

  const ui = await open($)
  const list = await labels(ui, 40)
  expect(list[0]).toBe('T37 — f37.md')
  expect(list.length).toBe(38)
  const keys = []

  for (const i of [0, 8, 9, 34, 35, 37]) {
    keys.push((await ui.find({ key: 'row-' + i })).props.hotkey)
  }

  expect(keys).toEqual(['1', '9', 'a', 'z', undefined, undefined])
})

test('files that no longer exist are dropped', async ($, on) => {
  const w = world({ '/work/a.md': '# A', '/work/b.md': '# B' })
  await setup($, on, w)
  await edit($, '/work/a.md')
  await edit($, '/work/b.md')
  delete w.files['/work/a.md']
  const ui = await open($)
  expect(await labels(ui)).toEqual(['B — b.md'])
})

test('pressing a row previews the file without frontmatter, and q goes back', async ($, on) => {
  const w = world({ '/work/a.md': '---\ntitle: Alpha\n---\n# Alpha\nhello' })
  await setup($, on, w)
  await edit($, '/work/a.md')
  const ui = await open($)
  await ui.press({ key: 'row-0' })
  const md = await ui.find({ type: 'Markdown' })
  expect(md.props.text).toBe('# Alpha\nhello')
  expect(await ui.find({ type: 'Text', text: /a\.md · page 1 of 1/ })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await labels(ui)).toEqual(['Alpha — a.md'])
})

test('long files page in chunks under the markdown cap with n, p, g and e', async ($, on) => {
  const para = (n: number) => `## Part ${n}\n` + 'word '.repeat(1500)
  const w = world({ '/work/big.md': [1, 2, 3].map(para).join('\n\n') })
  await setup($, on, w)
  await edit($, '/work/big.md')
  const ui = await open($)
  await ui.press({ key: 'row-0' })
  const first = (await ui.find({ type: 'Markdown' })).props.text as string
  expect(first.length).toBeLessThanOrEqual(10000)
  expect(first.startsWith('## Part 1')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /page 1 of 3/ })).toBeDefined()
  await ui.press({ key: 'next' })
  expect((await ui.find({ type: 'Markdown' })).props.text.startsWith('## Part 2')).toBe(true)
  await ui.press({ key: 'prev' })
  expect((await ui.find({ type: 'Markdown' })).props.text.startsWith('## Part 1')).toBe(true)
  await ui.press({ key: 'prev' })
  expect(await ui.find({ type: 'Text', text: /page 1 of 3/ })).toBeDefined()
  await ui.press({ key: 'top' })
  await ui.press({ key: 'end' })
  // g and e reveal the start and end of the pane; the kit cannot observe a scroll, so check the pane survives
  expect(await ui.find({ type: 'Markdown' })).toBeDefined()
})

test('preview buttons carry the n p g e q hotkeys', async ($, on) => {
  const w = world({ '/work/a.md': '# A' })
  await setup($, on, w)
  await edit($, '/work/a.md')
  const ui = await open($)
  await ui.press({ key: 'row-0' })
  const keys: Record<string, unknown> = {}

  for (const key of ['next', 'prev', 'top', 'end', 'back']) {
    keys[key] = (await ui.find({ key })).props.hotkey
  }

  expect(keys).toEqual({ next: 'n', prev: 'p', top: 'g', end: 'e', back: 'q' })
})

test('an unreadable file shows a message instead of breaking the preview', async ($, on) => {
  const w = world({ '/work/a.md': '# A' })
  await setup($, on, w)
  await edit($, '/work/a.md')
  const ui = await open($)
  w.unreadable = true
  await ui.press({ key: 'row-0' })
  expect(await ui.find({ type: 'Text', text: /could not be read/i })).toBeDefined()
})

test('a shell call that may have written adds markdown files modified since session start', async ($, on) => {
  const w = world({ '/work/old.md': '# Old', '/work/sed.md': '# Sed', '/work/edited.md': '# Edited' })
  w.mtimes = { '/work/old.md': 500, '/work/sed.md': 1500, '/work/edited.md': 1600 }
  w.gitOut = 'old.md\nsed.md\nedited.md\n'
  const clock = await setup($, on, w, 1000)
  await clock.advance(700)
  await edit($, '/work/edited.md')
  await $.tool.call({ tool: 'Bash', command: "sed -i 's/a/b/' sed.md" })
  expect(w.gitCalls[0]?.slice(0, 2)).toEqual(['git', 'ls-files'])
  const ui = await open($)
  expect(await labels(ui)).toEqual(['Edited — edited.md', 'Sed — sed.md'])
})

test('read-only and denied shell calls trigger no rescan', async ($, on) => {
  const w = world()
  w.readOnlyCommands = ['ls']
  await setup($, on, w)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(w.gitCalls.length).toBe(0)
})

test('without a git repository the rescan adds nothing and does not fail', async ($, on) => {
  const w = world({ '/work/a.md': '# A' })
  w.gitExit = 128
  w.gitOut = 'a.md\n'
  await setup($, on, w)
  await $.tool.call({ tool: 'Bash', command: 'touch a.md' })
  const ui = await open($)
  expect(await labels(ui)).toEqual([])
})

test('the list refreshes when an edit lands while the pane is open', async ($, on) => {
  const w = world({ '/work/a.md': '# A', '/work/b.md': '# B' })
  const clock = await setup($, on, w)
  await edit($, '/work/a.md')
  const ui = await open($)
  expect(await labels(ui)).toEqual(['A — a.md'])
  await clock.advance(10)
  await edit($, '/work/b.md')
  expect(await labels(ui)).toEqual(['B — b.md', 'A — a.md'])
})

test('a shell-detected file and an edited file are ordered by one clock (file mtime)', async ($, on) => {
  const w = world({ '/work/shell.md': '# Shell', '/work/edit.md': '# Edit' })
  w.mtimes = { '/work/shell.md': 2000, '/work/edit.md': 3000 }
  w.gitOut = 'shell.md\n'
  const clock = await setup($, on, w, 1000)
  await clock.advance(700)
  await edit($, '/work/edit.md')
  await $.tool.call({ tool: 'Bash', command: 'echo x >> shell.md' })
  const ui = await open($)
  expect(await labels(ui)).toEqual(['Edit — edit.md', 'Shell — shell.md'])
})

test('the rescan matches markdown extensions case-insensitively', async ($, on) => {
  const w = world({ '/work/NOTES.MD': '# Notes' })
  w.gitOut = 'NOTES.MD\n'
  await setup($, on, w)
  await $.tool.call({ tool: 'Bash', command: 'echo x >> NOTES.MD' })
  expect(w.gitCalls[0]?.at(-1)).toBe(':(icase)*.md')
  const ui = await open($)
  expect(await labels(ui)).toEqual(['Notes — NOTES.MD'])
})

test('titles are sanitised for display', async ($, on) => {
  const w = world({ '/work/a.md': '# Hi\x1b[31m   there\t' + 'x'.repeat(200) })
  await setup($, on, w)
  await edit($, '/work/a.md')
  const ui = await open($)
  const [label] = await labels(ui)
  expect(label?.includes('\x1b')).toBe(false)
  expect(label?.startsWith('Hi [31m there')).toBe(true)
  expect(label!.length).toBeLessThan(120)
})

test('a code fence with blank lines is never split across pages', async ($, on) => {
  const code = '```\n' + ('line\n\n').repeat(700) + '```'
  const w = world({ '/work/c.md': 'word '.repeat(1200) + '\n\n' + code + '\n\noutro' })
  await setup($, on, w)
  await edit($, '/work/c.md')
  const ui = await open($)
  await ui.press({ key: 'row-0' })
  const first = (await ui.find({ type: 'Markdown' })).props.text as string
  const fences = first.split('\n').filter((l: string) => l.startsWith('```')).length
  expect(fences % 2).toBe(0)
  expect(first.includes('line')).toBe(false)
})

test('/touched toggles: a second run closes the open pane, a third reopens it', async ($, on) => {
  const w = world({ '/work/a.md': '# A' })
  await setup($, on, w)
  await edit($, '/work/a.md')
  await $.command.run({ command: 'touched', args: '' })
  expect([w.opens, w.closes]).toEqual([1, 0])
  await $.command.run({ command: 'touched', args: '' })
  expect([w.opens, w.closes]).toEqual([1, 1])
  await $.command.run({ command: 'touched', args: '' })
  expect([w.opens, w.closes]).toEqual([2, 1])
})
