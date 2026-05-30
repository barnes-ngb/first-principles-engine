import { describe, expect, it } from 'vitest'
import { parseChatActions } from './parseChatActions'

describe('parseChatActions', () => {
  it('extracts a valid addSightWord block and strips the tag', () => {
    const raw =
      'Sure, I can add that.\n<action>{"kind": "addSightWord", "childId": "lincoln", "word": "the"}</action>'
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'addSightWord', childId: 'lincoln', word: 'the' },
    ])
    expect(cleanText).toBe('Sure, I can add that.')
    expect(cleanText).not.toContain('<action>')
  })

  it('extracts a valid removeSightWord block', () => {
    const raw =
      '<action>{"kind": "removeSightWord", "childId": "london", "word": "cat"}</action>Done.'
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'removeSightWord', childId: 'london', word: 'cat' },
    ])
    expect(cleanText).toBe('Done.')
  })

  it('parses multiple action blocks and preserves interleaved prose', () => {
    const raw = [
      'First word:',
      '<action>{"kind": "addSightWord", "childId": "lincoln", "word": "and"}</action>',
      'and a second:',
      '<action>{"kind": "addSightWord", "childId": "lincoln", "word": "said"}</action>',
      'all set!',
    ].join('\n')
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'addSightWord', childId: 'lincoln', word: 'and' },
      { kind: 'addSightWord', childId: 'lincoln', word: 'said' },
    ])
    expect(cleanText).toContain('First word:')
    expect(cleanText).toContain('and a second:')
    expect(cleanText).toContain('all set!')
    expect(cleanText).not.toContain('<action>')
  })

  it('parses a block wrapped in markdown fences via sanitizeAndParseJson', () => {
    const raw =
      '<action>```json\n{"kind": "addSightWord", "childId": "lincoln", "word": "for",}\n```</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'addSightWord', childId: 'lincoln', word: 'for' },
    ])
  })

  it('skips malformed JSON without throwing, still cleans the text', () => {
    const raw =
      'Oops:\n<action>{ not valid json }</action>\nbut here is the message.'
    let result: ReturnType<typeof parseChatActions> | undefined
    expect(() => {
      result = parseChatActions(raw)
    }).not.toThrow()
    expect(result?.actions).toEqual([])
    expect(result?.cleanText).toContain('Oops:')
    expect(result?.cleanText).toContain('but here is the message.')
    expect(result?.cleanText).not.toContain('<action>')
  })

  it('keeps valid actions while skipping a malformed sibling block', () => {
    const raw = [
      '<action>{ broken</action>',
      '<action>{"kind": "addSightWord", "childId": "lincoln", "word": "was"}</action>',
    ].join('\n')
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'addSightWord', childId: 'lincoln', word: 'was' },
    ])
  })

  it('rejects a well-formed block with a disallowed editProfileField kind', () => {
    const raw =
      '<action>{"kind": "editProfileField", "childId": "lincoln", "field": "grade", "value": "4"}</action>'
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([])
    // tag is still stripped even though the action is rejected
    expect(cleanText).toBe('')
  })

  it('rejects a well-formed block with a disallowed setPrioritySkill kind', () => {
    const raw =
      '<action>{"kind": "setPrioritySkill", "childId": "lincoln", "word": "phonics"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects an action with a missing word', () => {
    const raw = '<action>{"kind": "addSightWord", "childId": "lincoln"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects an action with an empty word', () => {
    const raw =
      '<action>{"kind": "addSightWord", "childId": "lincoln", "word": "   "}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects an action with a missing childId', () => {
    const raw = '<action>{"kind": "addSightWord", "word": "the"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects an action with an empty childId', () => {
    const raw =
      '<action>{"kind": "addSightWord", "childId": "", "word": "the"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('returns no actions and unchanged clean text when there are no blocks', () => {
    const raw = 'Just a normal reply with no actions.'
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([])
    expect(cleanText).toBe('Just a normal reply with no actions.')
  })
})
