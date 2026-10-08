/** The most characters one markdown element takes is 10,000; stay under it. */
export const CHUNK_MAX = 9800

function hardSplit(block: string, max: number): string[] {
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
  const blocks = body.split(/\n{2,}/).flatMap(block => (block.length > max ? hardSplit(block, max) : [block]))
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
