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

  let fence: string | undefined

  for (const line of body.split(/\r?\n/)) {
    const marker = /^\s*(```+|~~~+)/.exec(line)

    if (marker) {
      const mark = marker[1]?.[0]

      if (fence === undefined) {
        fence = mark
      } else if (mark === fence) {
        fence = undefined
      }

      continue
    }

    if (fence === undefined) {
      const heading = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line)

      if (heading?.[1] !== undefined) {
        return heading[1]
      }
    }
  }

  return undefined
}

export function baseNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** The label a list row shows before the filename. */
export function rowTitleOf(text: string, path: string): string {
  const found = titleOf(text)

  if (found !== undefined) {
    return found
  }

  return baseNameOf(path).replace(/\.md$/i, '') + ' (no title)'
}
