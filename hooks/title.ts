import { nextFence } from './fences'
import type { Fence } from './fences'

/** Splits a leading YAML frontmatter block from the body. */
export function splitFrontmatter(text: string): { front: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)

  if (!match) {
    return { front: '', body: text }
  }

  return { front: match[1] ?? '', body: text.slice(match[0].length) }
}

function unquote(value: string): string {
  const v = value.trim()

  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
    return v.slice(1, -1)
  }

  return v
}

/** The document's title, or undefined when it has none. */
export function titleOf(text: string): string | undefined {
  const { front, body } = splitFrontmatter(text)
  const fromFront = /^title:[ \t]*(.+)$/m.exec(front)?.[1]

  if (fromFront !== undefined && unquote(fromFront) !== '') {
    return unquote(fromFront)
  }

  let fence: Fence

  for (const line of body.split(/\r?\n/)) {
    const wasOpen = fence !== undefined

    fence = nextFence(line, fence)

    if (!wasOpen && fence === undefined) {
      const heading = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line)

      if (heading?.[1] !== undefined) {
        return heading[1]
      }
    }
  }

  return undefined
}

/** A title safe to draw: no control characters, runs of space collapsed, cut to 80. */
export function sanitize(title: string): string {
  const clean = title.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()

  return clean.length > 80 ? clean.slice(0, 79) + '…' : clean
}

export function baseNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function stemOf(path: string): string {
  return baseNameOf(path).replace(/\.md$/i, '')
}

/** The title to draw: the document's own when it has one, else the filename without `.md`. */
export function displayTitleOf(text: string, path: string): { title: string; isFallback: boolean } {
  const found = titleOf(text)
  const clean = found === undefined ? '' : sanitize(found)

  return clean === '' ? { title: stemOf(path), isFallback: true } : { title: clean, isFallback: false }
}

/** The label a list row shows before the filename. */
export function rowTitleOf(text: string, path: string): string {
  const { title, isFallback } = displayTitleOf(text, path)

  return isFallback ? title + ' (no title)' : title
}
