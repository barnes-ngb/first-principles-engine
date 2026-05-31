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

  it('extracts an editProfileField block with an allowed field', () => {
    const raw =
      'Sounds good.\n<action>{"kind": "editProfileField", "childId": "lincoln", "field": "motivators", "value": "Minecraft, Lego, Art"}</action>'
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([
      {
        kind: 'editProfileField',
        childId: 'lincoln',
        field: 'motivators',
        value: 'Minecraft, Lego, Art',
      },
    ])
    expect(cleanText).toBe('Sounds good.')
  })

  it('accepts each of the three allowed soft-profile fields', () => {
    for (const field of ['motivators', 'interests', 'strengths'] as const) {
      const raw = `<action>{"kind": "editProfileField", "childId": "london", "field": "${field}", "value": "x"}</action>`
      const { actions } = parseChatActions(raw)
      expect(actions).toEqual([
        { kind: 'editProfileField', childId: 'london', field, value: 'x' },
      ])
    }
  })

  it('rejects an editProfileField targeting the disallowed grade field', () => {
    const raw =
      '<action>{"kind": "editProfileField", "childId": "lincoln", "field": "grade", "value": "4"}</action>'
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([])
    // tag is still stripped even though the action is rejected
    expect(cleanText).toBe('')
  })

  it('rejects an editProfileField targeting Tier-C supports', () => {
    const raw =
      '<action>{"kind": "editProfileField", "childId": "lincoln", "field": "supports", "value": "extra time"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects an editProfileField with a missing value', () => {
    const raw =
      '<action>{"kind": "editProfileField", "childId": "lincoln", "field": "interests"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects an editProfileField with a missing childId', () => {
    const raw =
      '<action>{"kind": "editProfileField", "field": "interests", "value": "dinosaurs"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects a well-formed block with a disallowed setPrioritySkill kind', () => {
    const raw =
      '<action>{"kind": "setPrioritySkill", "childId": "lincoln", "word": "phonics"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  // ── Tier C Option 2 — additive snapshot edits (6b) ──────────────

  it('extracts an addPrioritySkill block', () => {
    const raw =
      "Let's add that.\n<action>{\"kind\": \"addPrioritySkill\", \"childId\": \"lincoln\", \"skill\": \"inference from passages\"}</action>"
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'addPrioritySkill', childId: 'lincoln', skill: 'inference from passages' },
    ])
    expect(cleanText).toBe("Let's add that.")
  })

  it('extracts an addSupport block', () => {
    const raw =
      '<action>{"kind": "addSupport", "childId": "lincoln", "support": "movement break every 10 min"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'addSupport', childId: 'lincoln', support: 'movement break every 10 min' },
    ])
  })

  it('extracts an addStopRule block', () => {
    const raw =
      '<action>{"kind": "addStopRule", "childId": "lincoln", "rule": "stop if frustration spikes"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'addStopRule', childId: 'lincoln', rule: 'stop if frustration spikes' },
    ])
  })

  it('extracts a markSkillProgress block with mastered:true', () => {
    const raw =
      '<action>{"kind": "markSkillProgress", "childId": "lincoln", "skill": "CVCe long vowels", "mastered": true}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'markSkillProgress', childId: 'lincoln', skill: 'CVCe long vowels', mastered: true },
    ])
  })

  it('extracts a markSkillProgress block without mastered (progressing)', () => {
    const raw =
      '<action>{"kind": "markSkillProgress", "childId": "lincoln", "skill": "two-digit addition"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'markSkillProgress', childId: 'lincoln', skill: 'two-digit addition' },
    ])
  })

  it('trims whitespace on additive snapshot fields', () => {
    const raw =
      '<action>{"kind": "addPrioritySkill", "childId": "lincoln", "skill": "  blends  "}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'addPrioritySkill', childId: 'lincoln', skill: 'blends' },
    ])
  })

  it('rejects an additive snapshot block with an empty payload field', () => {
    const raw =
      '<action>{"kind": "addPrioritySkill", "childId": "lincoln", "skill": "   "}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects a removal-shaped snapshot payload (Option 3, unrepresentable)', () => {
    const raw =
      '<action>{"kind": "removePrioritySkill", "childId": "lincoln", "skill": "inference"}</action>'
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([])
    // tag still stripped even though the action is rejected
    expect(cleanText).toBe('')
  })

  it('rejects a downgrade/level-lowering-shaped snapshot payload', () => {
    const raw =
      '<action>{"kind": "setSkillLevel", "childId": "lincoln", "skill": "CVCe", "level": "emerging"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects a markSkillProgress with a missing skill', () => {
    const raw =
      '<action>{"kind": "markSkillProgress", "childId": "lincoln", "mastered": true}</action>'
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
