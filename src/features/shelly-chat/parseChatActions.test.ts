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

  // ── proposePlanAdjustment — HANDOFF (chunk 2A/2) ───────────────────

  it('parses a valid proposePlanAdjustment and strips the tag', () => {
    const raw =
      "Let's lighten next week.\n" +
      '<action>{"kind": "proposePlanAdjustment", "childId": "lincoln", "summary": "Reduce math to 10 min/day", "rationale": "Frustration is spiking and persistence is dropping"}</action>'
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([
      {
        kind: 'proposePlanAdjustment',
        childId: 'lincoln',
        summary: 'Reduce math to 10 min/day',
        rationale: 'Frustration is spiking and persistence is dropping',
      },
    ])
    expect(cleanText).toBe("Let's lighten next week.")
    expect(cleanText).not.toContain('<action>')
  })

  it('keeps optional scope and targetWeek when present', () => {
    const raw =
      '<action>{"kind": "proposePlanAdjustment", "childId": "london", "summary": "Shift to an MVD week", "rationale": "Low energy at home", "scope": "math", "targetWeek": "2026-06-22"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([
      {
        kind: 'proposePlanAdjustment',
        childId: 'london',
        summary: 'Shift to an MVD week',
        rationale: 'Low energy at home',
        scope: 'math',
        targetWeek: '2026-06-22',
      },
    ])
  })

  it('rejects a proposePlanAdjustment with a missing summary', () => {
    const raw =
      '<action>{"kind": "proposePlanAdjustment", "childId": "lincoln", "rationale": "too hard"}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects a proposePlanAdjustment with an empty rationale', () => {
    const raw =
      '<action>{"kind": "proposePlanAdjustment", "childId": "lincoln", "summary": "drop science", "rationale": "   "}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions).toEqual([])
  })

  it('rejects a proposePlanAdjustment with a missing childId', () => {
    const raw =
      '<action>{"kind": "proposePlanAdjustment", "summary": "drop science", "rationale": "no bandwidth"}</action>'
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

  // ── setActivityMinutes (FEAT-135) ───────────────────────────────
  // The allowlist is the only thing standing between a model's free-text
  // guess and a write, so the band + integer rules are asserted exhaustively.

  it('extracts a valid setActivityMinutes block and strips the tag', () => {
    const raw =
      'Got it — I will set math to 30.\n' +
      '<action>{"kind": "setActivityMinutes", "childId": "lincoln", "activityConfigId": "cfg_math", "minutes": 30}</action>'
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([
      {
        kind: 'setActivityMinutes',
        childId: 'lincoln',
        activityConfigId: 'cfg_math',
        minutes: 30,
      },
    ])
    expect(cleanText).toBe('Got it — I will set math to 30.')
  })

  it('accepts both ends of the 5–120 band', () => {
    const raw =
      '<action>{"kind": "setActivityMinutes", "childId": "lincoln", "activityConfigId": "a", "minutes": 5}</action>' +
      '<action>{"kind": "setActivityMinutes", "childId": "lincoln", "activityConfigId": "b", "minutes": 120}</action>'
    const { actions } = parseChatActions(raw)
    expect(actions.map((a) => (a as { minutes: number }).minutes)).toEqual([5, 120])
  })

  it('rejects a setActivityMinutes with a missing activityConfigId', () => {
    const raw =
      '<action>{"kind": "setActivityMinutes", "childId": "lincoln", "minutes": 30}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })

  it('rejects a setActivityMinutes with an empty activityConfigId', () => {
    const raw =
      '<action>{"kind": "setActivityMinutes", "childId": "lincoln", "activityConfigId": "   ", "minutes": 30}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })

  it('rejects a setActivityMinutes with a missing childId', () => {
    const raw =
      '<action>{"kind": "setActivityMinutes", "activityConfigId": "cfg_math", "minutes": 30}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })

  it('rejects non-integer minutes rather than rounding them', () => {
    const raw =
      '<action>{"kind": "setActivityMinutes", "childId": "lincoln", "activityConfigId": "cfg", "minutes": 30.5}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })

  it('rejects a stringified number for minutes', () => {
    const raw =
      '<action>{"kind": "setActivityMinutes", "childId": "lincoln", "activityConfigId": "cfg", "minutes": "30"}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })

  it('rejects out-of-band minutes (0, 4, 121) rather than clamping them', () => {
    for (const minutes of [0, 4, 121]) {
      const raw = `<action>{"kind": "setActivityMinutes", "childId": "lincoln", "activityConfigId": "cfg", "minutes": ${minutes}}</action>`
      const { actions } = parseChatActions(raw)
      expect(actions, `minutes=${minutes} must be rejected, not clamped`).toEqual([])
    }
  })

  it('rejects a negative minutes value', () => {
    const raw =
      '<action>{"kind": "setActivityMinutes", "childId": "lincoln", "activityConfigId": "cfg", "minutes": -30}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })

  it('rejects an unknown activity-shaped kind', () => {
    const raw =
      '<action>{"kind": "setActivityFrequency", "childId": "lincoln", "activityConfigId": "cfg", "frequency": "daily"}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })

  it('returns no actions and unchanged clean text when there are no blocks', () => {
    const raw = 'Just a normal reply with no actions.'
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([])
    expect(cleanText).toBe('Just a normal reply with no actions.')
  })
})

// ── FEAT-142 — live-day edits (remove / move / add on THIS week) ──────────────

describe('parseChatActions — removeItemFromDay (FEAT-142)', () => {
  it('extracts a well-formed removal', () => {
    const raw =
      '<action>{"kind": "removeItemFromDay", "childId": "lincoln", "dateKey": "2026-08-12", "itemKey": "Reading Eggs (30m)::Reading"}</action>'
    expect(parseChatActions(raw).actions).toEqual([
      {
        kind: 'removeItemFromDay',
        childId: 'lincoln',
        dateKey: '2026-08-12',
        itemKey: 'Reading Eggs (30m)::Reading',
      },
    ])
  })

  it('rejects a malformed date key', () => {
    for (const dateKey of ['2026-8-12', '08/12/2026', 'Wednesday', '2026-08-12T00:00:00', '']) {
      const raw = `<action>{"kind": "removeItemFromDay", "childId": "lincoln", "dateKey": "${dateKey}", "itemKey": "k"}</action>`
      expect(parseChatActions(raw).actions, `dateKey=${dateKey}`).toEqual([])
    }
  })

  it('rejects a date that matches the pattern but is not a real day', () => {
    // `new Date('2026-02-31')` rolls forward rather than failing, so the shape
    // check alone is not enough.
    for (const dateKey of ['2026-02-31', '2026-13-01', '2026-00-10']) {
      const raw = `<action>{"kind": "removeItemFromDay", "childId": "lincoln", "dateKey": "${dateKey}", "itemKey": "k"}</action>`
      expect(parseChatActions(raw).actions, `dateKey=${dateKey}`).toEqual([])
    }
  })

  it('rejects a missing or empty itemKey', () => {
    const missing =
      '<action>{"kind": "removeItemFromDay", "childId": "lincoln", "dateKey": "2026-08-12"}</action>'
    const blank =
      '<action>{"kind": "removeItemFromDay", "childId": "lincoln", "dateKey": "2026-08-12", "itemKey": "   "}</action>'
    expect(parseChatActions(missing).actions).toEqual([])
    expect(parseChatActions(blank).actions).toEqual([])
  })

  it('rejects a missing childId', () => {
    const raw =
      '<action>{"kind": "removeItemFromDay", "dateKey": "2026-08-12", "itemKey": "k"}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })
})

describe('parseChatActions — moveItemToDay (FEAT-142)', () => {
  it('extracts a well-formed move', () => {
    const raw =
      '<action>{"kind": "moveItemToDay", "childId": "lincoln", "fromDateKey": "2026-08-12", "toDateKey": "2026-08-13", "itemKey": "row-9"}</action>'
    expect(parseChatActions(raw).actions).toEqual([
      {
        kind: 'moveItemToDay',
        childId: 'lincoln',
        fromDateKey: '2026-08-12',
        toDateKey: '2026-08-13',
        itemKey: 'row-9',
      },
    ])
  })

  it('rejects a move onto the day the row is already on', () => {
    // Not a change — a card for it would promise something it would not do.
    const raw =
      '<action>{"kind": "moveItemToDay", "childId": "lincoln", "fromDateKey": "2026-08-12", "toDateKey": "2026-08-12", "itemKey": "row-9"}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })

  it('rejects a malformed date on either side', () => {
    const badFrom =
      '<action>{"kind": "moveItemToDay", "childId": "lincoln", "fromDateKey": "Wednesday", "toDateKey": "2026-08-13", "itemKey": "k"}</action>'
    const badTo =
      '<action>{"kind": "moveItemToDay", "childId": "lincoln", "fromDateKey": "2026-08-12", "toDateKey": "next Friday", "itemKey": "k"}</action>'
    expect(parseChatActions(badFrom).actions).toEqual([])
    expect(parseChatActions(badTo).actions).toEqual([])
  })

  it('rejects a missing itemKey', () => {
    const raw =
      '<action>{"kind": "moveItemToDay", "childId": "lincoln", "fromDateKey": "2026-08-12", "toDateKey": "2026-08-13"}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })
})

describe('parseChatActions — addItemToDay (FEAT-142)', () => {
  it('extracts a well-formed add with a subject', () => {
    const raw =
      '<action>{"kind": "addItemToDay", "childId": "lincoln", "dateKey": "2026-08-12", "label": "Sight word games", "estimatedMinutes": 15, "subjectBucket": "Reading"}</action>'
    expect(parseChatActions(raw).actions).toEqual([
      {
        kind: 'addItemToDay',
        childId: 'lincoln',
        dateKey: '2026-08-12',
        label: 'Sight word games',
        estimatedMinutes: 15,
        subjectBucket: 'Reading',
      },
    ])
  })

  it('accepts an add with no subject at all', () => {
    const raw =
      '<action>{"kind": "addItemToDay", "childId": "lincoln", "dateKey": "2026-08-12", "label": "Nature walk", "estimatedMinutes": 30}</action>'
    const [action] = parseChatActions(raw).actions
    expect(action).toEqual({
      kind: 'addItemToDay',
      childId: 'lincoln',
      dateKey: '2026-08-12',
      label: 'Nature walk',
      estimatedMinutes: 30,
    })
    expect(action).not.toHaveProperty('subjectBucket')
  })

  it('drops an unrecognised subject bucket without dropping the action', () => {
    // A subject is a colour-coding hint; refusing the whole add over one would
    // fail the parent for something that costs nothing to omit.
    const raw =
      '<action>{"kind": "addItemToDay", "childId": "lincoln", "dateKey": "2026-08-12", "label": "Nature walk", "estimatedMinutes": 30, "subjectBucket": "Outdoors"}</action>'
    const [action] = parseChatActions(raw).actions
    expect(action).toBeDefined()
    expect(action).not.toHaveProperty('subjectBucket')
  })

  it('rejects out-of-band minutes rather than clamping them', () => {
    for (const minutes of [0, 4, 121, 240, -15]) {
      const raw = `<action>{"kind": "addItemToDay", "childId": "lincoln", "dateKey": "2026-08-12", "label": "Thing", "estimatedMinutes": ${minutes}}</action>`
      expect(
        parseChatActions(raw).actions,
        `estimatedMinutes=${minutes} must be rejected, not clamped`,
      ).toEqual([])
    }
  })

  it('rejects non-integer, string and non-finite minutes', () => {
    for (const raw of [
      '<action>{"kind": "addItemToDay", "childId": "lincoln", "dateKey": "2026-08-12", "label": "T", "estimatedMinutes": 30.5}</action>',
      '<action>{"kind": "addItemToDay", "childId": "lincoln", "dateKey": "2026-08-12", "label": "T", "estimatedMinutes": "30"}</action>',
      '<action>{"kind": "addItemToDay", "childId": "lincoln", "dateKey": "2026-08-12", "label": "T"}</action>',
    ]) {
      expect(parseChatActions(raw).actions).toEqual([])
    }
  })

  it('rejects an empty label', () => {
    const raw =
      '<action>{"kind": "addItemToDay", "childId": "lincoln", "dateKey": "2026-08-12", "label": "   ", "estimatedMinutes": 15}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })

  it('trims the label rather than storing the whitespace', () => {
    const raw =
      '<action>{"kind": "addItemToDay", "childId": "lincoln", "dateKey": "2026-08-12", "label": "  Copywork  ", "estimatedMinutes": 15}</action>'
    expect(parseChatActions(raw).actions[0]).toMatchObject({ label: 'Copywork' })
  })
})

describe('parseChatActions — unknown live-day-shaped kinds stay unrepresentable', () => {
  it('rejects kinds the union does not carry', () => {
    for (const kind of [
      'completeItemOnDay',
      'uncompleteItemOnDay',
      'reorderItemOnDay',
      'setItemMinutesOnDay',
      'clearDay',
    ]) {
      const raw = `<action>{"kind": "${kind}", "childId": "lincoln", "dateKey": "2026-08-12", "itemKey": "k"}</action>`
      expect(parseChatActions(raw).actions, `kind=${kind}`).toEqual([])
    }
  })
})
