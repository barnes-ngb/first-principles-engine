import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const reportError = vi.fn()
vi.mock('../../core/observability', () => ({
  ErrorSource: { Handled: 'handled' },
  reportError: (...args: unknown[]) => reportError(...args),
}))

import { reportStoryIfCutShort, storyCutShortNote, StoryCallTask } from './storyCutShortReport'

describe('storyCutShortNote (UX-455) — shape only', () => {
  it('names the call, the length and the stop reason', () => {
    expect(
      storyCutShortNote({
        task: StoryCallTask.GenerateStory,
        pageCount: 14,
        wordCount: 15,
        stopReason: 'max_tokens',
      }),
    ).toBe('story reply cut short (task=generateStory pages=14 words=15 stopReason=max_tokens)')
  })

  it('never prints a server string it does not recognise', () => {
    const note = storyCutShortNote({
      task: StoryCallTask.RevisePage,
      pageCount: 1,
      wordCount: 0,
      stopReason: 'London ran to the park',
    })
    expect(note).toContain('stopReason=other')
    expect(note).not.toContain('London')
    expect(
      storyCutShortNote({ task: StoryCallTask.ReviseStory, pageCount: 6, wordCount: 0, stopReason: undefined }),
    ).toContain('stopReason=unreported')
  })
})

describe('reportStoryIfCutShort (UX-455) — the gate', () => {
  beforeEach(() => reportError.mockClear())
  const shape = { task: StoryCallTask.GenerateStory, pageCount: 14, wordCount: 15 }

  it('reports a max_tokens reply as a handled error carrying no story text', () => {
    const reply = { message: '{"title":"The Big Dog","pages":[{"text":"Sam ran', stopReason: 'max_tokens' }
    expect(reportStoryIfCutShort(reply, null, shape)).toBe(true)
    expect(reportError).toHaveBeenCalledTimes(1)
    const payload = reportError.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({ source: 'handled', name: 'StoryReplyCutShort', section: 'books-generateStory' })
    expect(JSON.stringify(payload)).not.toMatch(/Big Dog|Sam ran/)
  })

  it('reports nothing for a story that parsed, a reply that never came, or an unreadable one', () => {
    expect(reportStoryIfCutShort({ message: '{}', stopReason: 'max_tokens' }, { pages: [] }, shape)).toBe(false)
    expect(reportStoryIfCutShort(null, null, shape)).toBe(false)
    expect(reportStoryIfCutShort({ message: 'not json', stopReason: 'end_turn' }, null, shape)).toBe(false)
    expect(reportError).not.toHaveBeenCalled()
  })
})

describe('every story door reports a cut-short reply (UX-455)', () => {
  const read = (f: string) => readFileSync(join(__dirname, f), 'utf8')
  it.each([
    ['useBookGenerateChat.ts', 'StoryCallTask.GenerateStory'],
    ['useBookGenerateChat.ts', 'StoryCallTask.ReviseStory'],
    ['useBookReview.ts', 'StoryCallTask.RevisePage'],
    ['useStoryGenerator.ts', 'StoryCallTask.GenerateStory'],
  ])('%s reports %s', (file, task) => {
    expect(read(file)).toMatch(new RegExp(`reportStoryIfCutShort\\([^)]*task: ${task.replace('.', '\\.')}`, 's'))
  })
})
