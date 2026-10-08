/** What a line does to the open code fence, per CommonMark: same character, closer at least as long. */
export type Fence = { mark: string; length: number } | undefined

export function nextFence(line: string, open: Fence): Fence {
  const run = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line)

  if (!run || run[1] === undefined) {
    return open
  }

  const mark = run[1][0] ?? ''
  const length = run[1].length

  if (open === undefined) {
    return mark === '`' && run[2]?.includes('`') ? open : { mark, length }
  }

  return mark === open.mark && length >= open.length && (run[2] ?? '').trim() === '' ? undefined : open
}

/** Splits at blank lines, never inside a code fence. */
export function blocksOf(body: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let fence: Fence

  for (const line of body.split('\n')) {
    const wasOpen = fence !== undefined

    fence = nextFence(line, fence)

    if (line.trim() === '' && !wasOpen && fence === undefined) {
      if (current.length > 0) {
        blocks.push(current.join('\n'))
        current = []
      }

      continue
    }

    current.push(line)
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'))
  }

  return blocks
}
