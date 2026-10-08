import { expect, test } from 'claude-code/testing'

import { chunksOf } from '../hooks/chunks'
import { splitFrontmatter, titleOf } from '../hooks/title'

test('frontmatter is split from the body and its title wins', () => {
  const text = '---\ntitle: "Quoted"\n---\n# Heading\nbody'
  expect(splitFrontmatter(text).body).toBe('# Heading\nbody')
  expect(titleOf(text)).toBe('Quoted')
})

test('a heading inside a fence is not a title', () => {
  expect(titleOf('```\n# no\n```\n')).toBeUndefined()
  expect(titleOf('text\n# Yes\n')).toBe('Yes')
})

test('chunks never exceed the limit, even for one huge line', () => {
  const chunks = chunksOf('x'.repeat(25000), 9800)
  expect(chunks.map(c => c.length)).toEqual([9800, 9800, 5400])
  expect(chunksOf('a\n\nb', 9800)).toEqual(['a\n\nb'])
})

test('a longer fence containing a shorter one stays one block', () => {
  const body = '````\n```\n\n```\n````\n\nafter'
  expect(chunksOf(body, 20)[0]).toBe('````\n```\n\n```\n````')
  expect(titleOf('````\n```\n# inner\n```\n````\n# Outer\n')).toBe('Outer')
})
