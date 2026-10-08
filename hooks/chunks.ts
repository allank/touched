import { blocksOf, nextFence } from './fences'

/** The most characters one markdown element takes is 10,000; stay under it. */
export const CHUNK_MAX = 9800

/** Splits one oversized block by lines; a fenced block is closed and reopened across each cut. */
function hardSplit(block: string, max: number): string[] {
  const lines = block.split('\n')
  const opener = lines[0] ?? ''
  const open = nextFence(opener, undefined)

  if (open === undefined) {
    return rawSplit(block, max)
  }

  const closer = open.mark.repeat(open.length)
  const last = lines.at(-1) ?? ''
  const hasCloser = lines.length > 1 && nextFence(last, open) === undefined
  const inner = lines.slice(1, hasCloser ? -1 : undefined).join('\n')
  const room = Math.max(1, max - opener.length - closer.length - 2)

  return rawSplit(inner, room).map(part => opener + '\n' + part + '\n' + closer)
}

function rawSplit(block: string, limit: number): string[] {
  const max = Math.max(1, limit)
  const parts: string[] = []
  let current = ''

  for (const line of block.split('\n')) {
    if (line.length > max) {
      if (current !== '') {
        parts.push(current)
        current = ''
      }

      for (let at = 0; at < line.length; at += max) {
        parts.push(line.slice(at, at + max))
      }

      continue
    }

    if (current !== '' && current.length + 1 + line.length > max) {
      parts.push(current)
      current = line
    } else {
      current = current === '' ? line : current + '\n' + line
    }
  }

  if (current !== '') {
    parts.push(current)
  }

  return parts
}

/**
 * Splits markdown into chunks no longer than `max`, cutting at blank lines
 * (and so at headings and paragraphs) where it can.
 */
export function chunksOf(body: string, max: number = CHUNK_MAX): string[] {
  const blocks = blocksOf(body).flatMap(block => (block.length > max ? hardSplit(block, max) : [block]))
  const chunks: string[] = []
  let current = ''

  for (const block of blocks) {
    if (current !== '' && current.length + 2 + block.length > max) {
      chunks.push(current)
      current = block
    } else {
      current = current === '' ? block : current + '\n\n' + block
    }
  }

  chunks.push(current)

  return chunks
}
