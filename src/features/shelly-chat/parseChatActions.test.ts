import { describe, expect, it } from 'vitest'
import {
  MAX_ARC_CONCEPT_BEAT_CHARS,
  MAX_ARC_DOMAIN_LABEL_CHARS,
  MAX_ARC_STEP_TITLE_CHARS,
  MAX_DAD_LAB_TITLE_CHARS,
  MAX_DRAFT_INSTRUCTION_CHARS,
  MAX_LAB_MATERIAL_CHARS,
  MAX_LAB_MATERIALS,
  MAX_LAB_QUESTION_CHARS,
  parseChatActions,
} from './parseChatActions'

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

  // ── ARCH-47 slice 3: the app's parser gained the preamble/suffix fallback ──
  //
  // Before the sanitizer was consolidated, the app copy threw on a payload with
  // conversational text around the JSON, and this loop swallowed the throw —
  // a confirm card silently dropped with no sentence (the UX-33 / FEAT-162
  // failure class). The server copy already recovered these. Now there is one
  // parser, and this case pins the app side end to end: it FAILED against the
  // pre-slice app copy.
  it('recovers an action whose payload carries a conversational preamble and suffix', () => {
    const raw = [
      'Adding that now.',
      '<action>Here is the action:\n{"kind": "addSightWord", "childId": "lincoln", "word": "was"}\nHope that helps!</action>',
    ].join('\n')
    const { actions, cleanText } = parseChatActions(raw)
    expect(actions).toEqual([
      { kind: 'addSightWord', childId: 'lincoln', word: 'was' },
    ])
    expect(cleanText).toBe('Adding that now.')
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

// ── Curriculum edits — add / complete / reposition (FEAT-143) ───────────────
//
// The chat's half of Progress → Curriculum. Validated here exactly as strictly
// as the kinds above: real enum members, real integer bands, non-empty ids, and
// the DATA-08 owner rule where it is decidable from the payload alone. Rejected,
// never clamped — a clamped number is one the parent never saw on the card.

describe('parseChatActions — addActivity (FEAT-143)', () => {
  const base = {
    kind: 'addActivity',
    childId: 'lincoln',
    name: 'Khan Academy math',
    type: 'app',
    subjectBucket: 'Math',
    defaultMinutes: 20,
    frequency: 'daily',
  }
  const block = (overrides: Record<string, unknown> = {}) =>
    `<action>${JSON.stringify({ ...base, ...overrides })}</action>`

  it('accepts a well-formed add', () => {
    expect(parseChatActions(block()).actions).toEqual([
      {
        kind: 'addActivity',
        childId: 'lincoln',
        name: 'Khan Academy math',
        type: 'app',
        subjectBucket: 'Math',
        defaultMinutes: 20,
        frequency: 'daily',
      },
    ])
  })

  it('trims the name and rejects an empty one', () => {
    expect(parseChatActions(block({ name: '  Handwriting  ' })).actions[0]).toMatchObject({
      name: 'Handwriting',
    })
    expect(parseChatActions(block({ name: '   ' })).actions).toEqual([])
    expect(parseChatActions(block({ name: 42 })).actions).toEqual([])
  })

  it('rejects a type outside the real ActivityType union', () => {
    for (const type of ['tablet', 'Workbook', 'video', '', 7]) {
      expect(parseChatActions(block({ type })).actions, `type=${String(type)}`).toEqual([])
    }
  })

  it('accepts every real ActivityType', () => {
    for (const type of ['formation', 'workbook', 'routine', 'activity', 'app', 'evaluation']) {
      expect(parseChatActions(block({ type })).actions, `type=${type}`).toHaveLength(1)
    }
  })

  it('rejects a frequency outside the real ActivityFrequency union', () => {
    for (const frequency of ['weekly', '4x', 'Daily', 'as needed', 3]) {
      expect(
        parseChatActions(block({ frequency })).actions,
        `frequency=${String(frequency)}`,
      ).toEqual([])
    }
  })

  it('accepts every real ActivityFrequency', () => {
    for (const frequency of ['daily', '3x', '2x', '1x', 'as-needed']) {
      expect(parseChatActions(block({ frequency })).actions, `frequency=${frequency}`).toHaveLength(
        1,
      )
    }
  })

  it('rejects an unknown subject bucket', () => {
    expect(parseChatActions(block({ subjectBucket: 'Coding' })).actions).toEqual([])
  })

  it('rejects out-of-band, non-integer and non-numeric minutes rather than clamping', () => {
    for (const defaultMinutes of [0, 4, 121, 30.5, '20', NaN, Infinity]) {
      expect(
        parseChatActions(block({ defaultMinutes })).actions,
        `defaultMinutes=${String(defaultMinutes)} must be rejected, not clamped`,
      ).toEqual([])
    }
    expect(parseChatActions(block({ defaultMinutes: 5 })).actions).toHaveLength(1)
    expect(parseChatActions(block({ defaultMinutes: 120 })).actions).toHaveLength(1)
  })

  // DATA-08: a workbook is the same book at a different page per child, so a
  // shared workbook is malformed rather than merely unwise.
  it('rejects a SHARED WORKBOOK — the DATA-08 owner rule', () => {
    expect(
      parseChatActions(block({ type: 'workbook', shared: true })).actions,
    ).toEqual([])
  })

  it('allows a shared non-workbook, and an unshared workbook', () => {
    expect(parseChatActions(block({ type: 'routine', shared: true })).actions[0]).toMatchObject({
      shared: true,
    })
    expect(parseChatActions(block({ type: 'workbook' })).actions).toHaveLength(1)
    expect(
      parseChatActions(block({ type: 'workbook', shared: false })).actions,
    ).toHaveLength(1)
  })

  it('drops the whole action when `shared` is not a real boolean', () => {
    for (const shared of ['true', 1, null]) {
      expect(parseChatActions(block({ shared })).actions, `shared=${String(shared)}`).toEqual([])
    }
  })

  it('omits `shared` entirely when it is false, rather than storing it', () => {
    expect(parseChatActions(block({ shared: false })).actions[0]).not.toHaveProperty('shared')
  })

  it('rejects a non-positive or fractional totalUnits / currentPosition', () => {
    for (const bad of [0, -1, 2.5, '10']) {
      expect(parseChatActions(block({ totalUnits: bad })).actions, `total=${String(bad)}`).toEqual(
        [],
      )
      expect(
        parseChatActions(block({ currentPosition: bad })).actions,
        `position=${String(bad)}`,
      ).toEqual([])
    }
  })

  it('rejects a starting position past the end of the book', () => {
    expect(
      parseChatActions(block({ totalUnits: 140, currentPosition: 141 })).actions,
    ).toEqual([])
    expect(
      parseChatActions(block({ totalUnits: 140, currentPosition: 140 })).actions,
    ).toHaveLength(1)
  })

  it('carries totalUnits and currentPosition through when both are sound', () => {
    expect(
      parseChatActions(block({ totalUnits: 140, currentPosition: 98 })).actions[0],
    ).toMatchObject({ totalUnits: 140, currentPosition: 98 })
  })
})

describe('parseChatActions — markActivityComplete (FEAT-143)', () => {
  it('accepts a well-formed completion', () => {
    const raw =
      '<action>{"kind":"markActivityComplete","childId":"lincoln","activityConfigId":"cfg1"}</action>'
    expect(parseChatActions(raw).actions).toEqual([
      { kind: 'markActivityComplete', childId: 'lincoln', activityConfigId: 'cfg1' },
    ])
  })

  it('rejects a missing, empty or non-string activityConfigId', () => {
    for (const id of ['""', '"   "', '7', 'null']) {
      const raw = `<action>{"kind":"markActivityComplete","childId":"lincoln","activityConfigId":${id}}</action>`
      expect(parseChatActions(raw).actions, `id=${id}`).toEqual([])
    }
    expect(
      parseChatActions('<action>{"kind":"markActivityComplete","childId":"lincoln"}</action>')
        .actions,
    ).toEqual([])
  })

  it('rejects a missing childId', () => {
    const raw = '<action>{"kind":"markActivityComplete","activityConfigId":"cfg1"}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })
})

describe('parseChatActions — setActivityPosition (FEAT-143)', () => {
  const block = (position: unknown) =>
    `<action>{"kind":"setActivityPosition","childId":"lincoln","activityConfigId":"cfg1","position":${JSON.stringify(position)}}</action>`

  it('accepts a well-formed position', () => {
    expect(parseChatActions(block(107)).actions).toEqual([
      {
        kind: 'setActivityPosition',
        childId: 'lincoln',
        activityConfigId: 'cfg1',
        position: 107,
      },
    ])
  })

  it('rejects position 0, negatives, fractions and strings', () => {
    for (const position of [0, -3, 1.5, '107', null]) {
      expect(parseChatActions(block(position)).actions, `position=${String(position)}`).toEqual([])
    }
  })

  it('accepts position 1 — the first lesson is a real position', () => {
    expect(parseChatActions(block(1)).actions).toHaveLength(1)
  })

  it('rejects an empty activityConfigId', () => {
    const raw =
      '<action>{"kind":"setActivityPosition","childId":"lincoln","activityConfigId":"  ","position":5}</action>'
    expect(parseChatActions(raw).actions).toEqual([])
  })
})

describe('parseChatActions — curriculum removals stay unrepresentable (FEAT-143)', () => {
  // Completion is the chat's ONLY removal — retire, don't delete. Every
  // delete/undo-shaped kind falls through to null by construction, the same
  // structural guarantee the snapshot kinds carry for downgrades.
  it('rejects delete-shaped and un-finish-shaped kinds', () => {
    for (const kind of [
      'deleteActivity',
      'removeActivity',
      'unmarkActivityComplete',
      'uncompleteActivity',
      'reorderActivities',
      'setActivityTotalUnits',
    ]) {
      const raw = `<action>{"kind":"${kind}","childId":"lincoln","activityConfigId":"cfg1"}</action>`
      expect(parseChatActions(raw).actions, `kind=${kind}`).toEqual([])
    }
  })
})

// ── Watch Vehicle actions (FEAT-149) ─────────────────────────────────────────
//
// The rail these tests exist for: **the model can never emit a youtubeId it did
// not read off a real found URL.** Everything else here is the usual
// reject-never-coerce discipline.

const REAL_ID = 'dQw4w9WgXcQ'
const REAL_URL = `https://www.youtube.com/watch?v=${REAL_ID}`

function vetIn(overrides: Record<string, unknown> = {}): string {
  const payload = {
    kind: 'vetInVideo',
    childId: 'lincoln',
    youtubeId: REAL_ID,
    title: 'How glaciers move',
    plannedMinutes: 9,
    subjectBucket: 'Science',
    why: 'He asked how the big rocks got there',
    suggestedFromUrl: REAL_URL,
    ...overrides,
  }
  return `<action>${JSON.stringify(payload)}</action>`
}

describe('parseChatActions — vetInVideo (FEAT-149)', () => {
  it('accepts a complete, URL-grounded proposal', () => {
    const { actions } = parseChatActions(vetIn())
    expect(actions).toEqual([
      {
        kind: 'vetInVideo',
        childId: 'lincoln',
        youtubeId: REAL_ID,
        title: 'How glaciers move',
        plannedMinutes: 9,
        subjectBucket: 'Science',
        why: 'He asked how the big rocks got there',
        suggestedFromUrl: REAL_URL,
      },
    ])
  })

  it('accepts the other real YouTube URL shapes the vet-in form accepts', () => {
    for (const url of [
      `https://youtu.be/${REAL_ID}`,
      `https://www.youtube.com/embed/${REAL_ID}`,
      `https://www.youtube.com/shorts/${REAL_ID}`,
      `https://m.youtube.com/watch?v=${REAL_ID}&t=30s`,
    ]) {
      expect(parseChatActions(vetIn({ suggestedFromUrl: url })).actions, url).toHaveLength(1)
    }
  })

  it('rejects a youtubeId that is not the canonical 11-char form', () => {
    for (const id of ['dQw4w9WgXc', 'dQw4w9WgXcQQ', 'dQw4w9WgX Q', '', 'dQw4w9WgXc!']) {
      expect(parseChatActions(vetIn({ youtubeId: id })).actions, `id=${id}`).toEqual([])
    }
  })

  it('rejects a URL-shaped youtubeId — the field holds an id, never a link', () => {
    expect(parseChatActions(vetIn({ youtubeId: REAL_URL })).actions).toEqual([])
  })

  it('rejects an id that is not extractable from the URL it claims to come from', () => {
    // A remembered id laundered through someone else's link.
    expect(
      parseChatActions(vetIn({ suggestedFromUrl: 'https://youtu.be/aBcDeFgHiJk' })).actions,
    ).toEqual([])
    // A real id on a page that is not YouTube at all.
    expect(
      parseChatActions(vetIn({ suggestedFromUrl: `https://example.com/watch?v=${REAL_ID}` }))
        .actions,
    ).toEqual([])
  })

  it('rejects a bare id in suggestedFromUrl — the field must prove provenance', () => {
    // `extractYouTubeId` accepts a bare id by design (a parent may paste one).
    // Here it would let the model invent an id and "cite" itself, so the field
    // is additionally required to be an http(s) URL.
    expect(parseChatActions(vetIn({ suggestedFromUrl: REAL_ID })).actions).toEqual([])
  })

  it('rejects a missing or blank suggestedFromUrl', () => {
    expect(parseChatActions(vetIn({ suggestedFromUrl: undefined })).actions).toEqual([])
    expect(parseChatActions(vetIn({ suggestedFromUrl: '   ' })).actions).toEqual([])
  })

  it('rejects a missing or blank why — it is what makes the card checkable', () => {
    expect(parseChatActions(vetIn({ why: undefined })).actions).toEqual([])
    expect(parseChatActions(vetIn({ why: '  ' })).actions).toEqual([])
  })

  it('rejects a blank title', () => {
    expect(parseChatActions(vetIn({ title: '   ' })).actions).toEqual([])
  })

  it('rejects out-of-bounds minutes, never coercing them', () => {
    for (const m of [0, -5, 9.5, '9', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parseChatActions(vetIn({ plannedMinutes: m })).actions, `m=${m}`).toEqual([])
    }
  })

  it('accepts a long or a very short real video — the form has no upper band', () => {
    expect(parseChatActions(vetIn({ plannedMinutes: 1 })).actions).toHaveLength(1)
    expect(parseChatActions(vetIn({ plannedMinutes: 240 })).actions).toHaveLength(1)
  })

  it('rejects an unknown subject rather than dropping the field', () => {
    // Unlike `addItemToDay`, where a bad bucket drops the FIELD: a library entry
    // carries its subject into the compliance record, so it is not a hint.
    expect(parseChatActions(vetIn({ subjectBucket: 'Astronomy' })).actions).toEqual([])
    expect(parseChatActions(vetIn({ subjectBucket: undefined })).actions).toEqual([])
  })

  it('rejects a missing childId, like every other kind', () => {
    expect(parseChatActions(vetIn({ childId: '' })).actions).toEqual([])
  })
})

describe('parseChatActions — planVideoOnDay (FEAT-149)', () => {
  const plan = (overrides: Record<string, unknown> = {}) =>
    `<action>${JSON.stringify({
      kind: 'planVideoOnDay',
      childId: 'lincoln',
      watchVideoId: 'vid_glacier',
      dateKey: '2026-08-25',
      ...overrides,
    })}</action>`

  it('accepts a real doc id and a real calendar date', () => {
    expect(parseChatActions(plan()).actions).toEqual([
      {
        kind: 'planVideoOnDay',
        childId: 'lincoln',
        watchVideoId: 'vid_glacier',
        dateKey: '2026-08-25',
      },
    ])
  })

  it('rejects a blank watchVideoId', () => {
    expect(parseChatActions(plan({ watchVideoId: '   ' })).actions).toEqual([])
    expect(parseChatActions(plan({ watchVideoId: undefined })).actions).toEqual([])
  })

  it('rejects a date that is not a real calendar day', () => {
    for (const dateKey of ['2026-02-31', '2026-13-01', '08-25-2026', 'next Tuesday', '']) {
      expect(parseChatActions(plan({ dateKey })).actions, dateKey).toEqual([])
    }
  })

  it('says nothing about WHICH week — that is resolved against the live clock', () => {
    // A date far outside the plannable window still PARSES; `watchActions`
    // refuses it with a reason the parent can read.
    expect(parseChatActions(plan({ dateKey: '2027-04-01' })).actions).toHaveLength(1)
  })
})

describe('parseChatActions — library removals stay unrepresentable (FEAT-149)', () => {
  // Vet-in is the ONLY library write the chat can make. Retire, un-retire, edit
  // and delete live on the Watch Library surface, so every kind naming one falls
  // through to null by construction — the same structural guarantee the snapshot
  // kinds carry for downgrades and the curriculum kinds carry for deletes.
  it('rejects retire / un-retire / edit / delete-shaped kinds', () => {
    for (const kind of [
      'retireVideo',
      'restoreVideo',
      'unretireVideo',
      'deleteVideo',
      'removeVideo',
      'editVideo',
      'updateWatchVideo',
      'removeVideoFromDay',
    ]) {
      const raw = `<action>{"kind":"${kind}","childId":"lincoln","watchVideoId":"vid_1"}</action>`
      expect(parseChatActions(raw).actions, `kind=${kind}`).toEqual([])
    }
  })
})

describe('parseChatActions — draftNextWeek (FEAT-150)', () => {
  const draft = (over: Record<string, unknown> = {}) => {
    const payload: Record<string, unknown> = {
      kind: 'draftNextWeek',
      childId: 'lincoln',
      instructions: 'lighter, math every day but short',
      ...over,
    }
    for (const [k, v] of Object.entries(payload)) if (v === undefined) delete payload[k]
    return `<action>${JSON.stringify(payload)}</action>`
  }

  it('parses a well-formed proposal', () => {
    expect(parseChatActions(draft()).actions).toEqual([
      {
        kind: 'draftNextWeek',
        childId: 'lincoln',
        instructions: 'lighter, math every day but short',
      },
    ])
  })

  it('trims the instructions', () => {
    const { actions } = parseChatActions(draft({ instructions: '  make it lighter  ' }))
    expect(actions[0]).toMatchObject({ instructions: 'make it lighter' })
  })

  it('rejects empty or non-string instructions', () => {
    for (const instructions of ['', '   ', 42, null, [], {}, undefined]) {
      expect(parseChatActions(draft({ instructions })).actions, String(instructions)).toEqual([])
    }
  })

  it('REJECTS an over-long instruction rather than truncating it', () => {
    // A truncated instruction is one the parent read on the card and did not
    // get. Rejection is the honest failure; silent truncation is not.
    const tooLong = 'a'.repeat(MAX_DRAFT_INSTRUCTION_CHARS + 1)
    expect(parseChatActions(draft({ instructions: tooLong })).actions).toEqual([])
    const atLimit = 'a'.repeat(MAX_DRAFT_INSTRUCTION_CHARS)
    expect(parseChatActions(draft({ instructions: atLimit })).actions).toHaveLength(1)
  })

  it('requires a childId, like every other kind', () => {
    expect(parseChatActions(draft({ childId: '' })).actions).toEqual([])
  })

  it('drops unknown fields rather than carrying them through', () => {
    const { actions } = parseChatActions(
      draft({ weekStart: '2026-08-23', days: [{ day: 'Monday' }], apply: true, hoursPerDay: 2 }),
    )
    expect(actions).toEqual([
      {
        kind: 'draftNextWeek',
        childId: 'lincoln',
        instructions: 'lighter, math every day but short',
      },
    ])
  })

  it('gives the model no way to express a WEEK — the target is never its choice', () => {
    // There is no `weekStart` / `targetWeek` field on the parsed action, so a
    // hallucinated week cannot travel. "Next week" is resolved from the clock at
    // generation and re-resolved at the write.
    const { actions } = parseChatActions(draft({ targetWeek: '2026-12-07' }))
    expect(actions[0]).not.toHaveProperty('targetWeek')
    expect(actions[0]).not.toHaveProperty('weekStart')
  })

  it('gives the model no way to express a PLAN — a week it wrote is not a week', () => {
    const { actions } = parseChatActions(
      draft({ days: [{ day: 'Monday', items: [{ title: 'Math', estimatedMinutes: 30 }] }] }),
    )
    expect(actions[0]).not.toHaveProperty('days')
  })

  it('gives the model no way to APPLY — the second tap has no kind', () => {
    // The whole two-tap rail is structural: there is no action kind that writes
    // a week, so no reply, however phrased, can reach one in a single tap.
    for (const kind of [
      'applyNextWeek',
      'applyNextWeekDraft',
      'writeNextWeek',
      'applyPlan',
      'lockInWeek',
      'applyWeekPlan',
    ]) {
      const raw = `<action>{"kind":"${kind}","childId":"lincoln","weekStart":"2026-08-23"}</action>`
      expect(parseChatActions(raw).actions, `kind=${kind}`).toEqual([])
    }
  })
})

// ── FEAT-157 — Dad Lab: createConceptArc + planLab ─────────────────

describe('parseChatActions — createConceptArc (FEAT-157)', () => {
  const steps = [
    { title: 'Static electricity', conceptBeat: 'Charge builds up and jumps' },
    { title: 'Make a circuit', conceptBeat: 'A loop lets current flow' },
    { title: 'Add a switch' },
  ]
  const base = {
    kind: 'createConceptArc',
    childId: 'lincoln',
    title: 'The Electricity Arc',
    domainLabel: 'Electricity',
    steps,
  }
  const block = (overrides: Record<string, unknown> = {}) =>
    `<action>${JSON.stringify({ ...base, ...overrides })}</action>`

  it('accepts a well-formed arc, steps verbatim and in order', () => {
    expect(parseChatActions(block()).actions).toEqual([
      {
        kind: 'createConceptArc',
        childId: 'lincoln',
        title: 'The Electricity Arc',
        domainLabel: 'Electricity',
        steps,
      },
    ])
  })

  it('trims the title and rejects an empty or over-long one', () => {
    expect(parseChatActions(block({ title: '  The Motor Arc  ' })).actions[0]).toMatchObject({
      title: 'The Motor Arc',
    })
    expect(parseChatActions(block({ title: '   ' })).actions).toEqual([])
    expect(parseChatActions(block({ title: 42 })).actions).toEqual([])
    expect(
      parseChatActions(block({ title: 'x'.repeat(MAX_DAD_LAB_TITLE_CHARS + 1) })).actions,
    ).toEqual([])
  })

  it('rejects a 1-step arc — an arc IS a sequence', () => {
    expect(parseChatActions(block({ steps: [steps[0]] })).actions).toEqual([])
  })

  it('rejects a 9-step arc — a season is not an arc', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ title: `Step ${i + 1}` }))
    expect(parseChatActions(block({ steps: nine })).actions).toEqual([])
  })

  it('accepts the band edges — exactly 2 and exactly 8 steps', () => {
    const two = steps.slice(0, 2)
    const eight = Array.from({ length: 8 }, (_, i) => ({ title: `Step ${i + 1}` }))
    expect(parseChatActions(block({ steps: two })).actions).toHaveLength(1)
    expect(parseChatActions(block({ steps: eight })).actions).toHaveLength(1)
  })

  it('rejects the whole action on any bad step — empty title, over-cap title or beat, non-object', () => {
    expect(
      parseChatActions(block({ steps: [steps[0], { title: '   ' }] })).actions,
    ).toEqual([])
    expect(
      parseChatActions(
        block({ steps: [steps[0], { title: 'x'.repeat(MAX_ARC_STEP_TITLE_CHARS + 1) }] }),
      ).actions,
    ).toEqual([])
    expect(
      parseChatActions(
        block({
          steps: [steps[0], { title: 'ok', conceptBeat: 'x'.repeat(MAX_ARC_CONCEPT_BEAT_CHARS + 1) }],
        }),
      ).actions,
    ).toEqual([])
    expect(parseChatActions(block({ steps: [steps[0], 'a string'] })).actions).toEqual([])
    expect(parseChatActions(block({ steps: 'static, circuit' })).actions).toEqual([])
  })

  it('drops a junk domainLabel as a FIELD, but rejects an over-long one', () => {
    expect(parseChatActions(block({ domainLabel: 7 })).actions[0]).not.toHaveProperty(
      'domainLabel',
    )
    expect(parseChatActions(block({ domainLabel: '   ' })).actions[0]).not.toHaveProperty(
      'domainLabel',
    )
    expect(
      parseChatActions(block({ domainLabel: 'x'.repeat(MAX_ARC_DOMAIN_LABEL_CHARS + 1) })).actions,
    ).toEqual([])
  })

  it('accepts childIds as a deduped list of non-empty strings, and rejects junk lists whole', () => {
    expect(
      parseChatActions(block({ childIds: ['lincoln', 'lincoln', 'london'] })).actions[0],
    ).toMatchObject({ childIds: ['lincoln', 'london'] })
    expect(parseChatActions(block({ childIds: [] })).actions).toEqual([])
    expect(parseChatActions(block({ childIds: ['lincoln', ''] })).actions).toEqual([])
    expect(parseChatActions(block({ childIds: 'lincoln' })).actions).toEqual([])
  })

  it('a narrativeHook is unrepresentable — the field is simply lost (design D5)', () => {
    const parsed = parseChatActions(
      block({ narrativeHook: 'Ties into the Stonebridge banner!' }),
    ).actions[0]
    expect(parsed).toBeDefined()
    expect(parsed).not.toHaveProperty('narrativeHook')
  })

  it('step statuses are unrepresentable — a status on a step payload is lost, never kept', () => {
    const parsed = parseChatActions(
      block({ steps: [{ title: 'A', status: 'done' }, { title: 'B', status: 'done' }] }),
    ).actions[0]
    expect(parsed).toMatchObject({ steps: [{ title: 'A' }, { title: 'B' }] })
    expect((parsed as { steps: object[] }).steps[0]).not.toHaveProperty('status')
  })
})

describe('parseChatActions — planLab (FEAT-157)', () => {
  const base = {
    kind: 'planLab',
    childId: 'lincoln',
    title: 'Make a bulb light up',
    question: 'What makes the bulb turn on?',
    labType: 'science',
    materials: ['battery', 'bulb', 'wire'],
  }
  const block = (overrides: Record<string, unknown> = {}) =>
    `<action>${JSON.stringify({ ...base, ...overrides })}</action>`

  it('accepts a well-formed lab', () => {
    expect(parseChatActions(block()).actions).toEqual([
      {
        kind: 'planLab',
        childId: 'lincoln',
        title: 'Make a bulb light up',
        question: 'What makes the bulb turn on?',
        labType: 'science',
        materials: ['battery', 'bulb', 'wire'],
      },
    ])
  })

  it('rejects an empty or over-long title', () => {
    expect(parseChatActions(block({ title: '   ' })).actions).toEqual([])
    expect(
      parseChatActions(block({ title: 'x'.repeat(MAX_DAD_LAB_TITLE_CHARS + 1) })).actions,
    ).toEqual([])
  })

  it('rejects an unknown labType — never coerced to a default', () => {
    for (const labType of ['chemistry', 'Science', '', 7, null]) {
      expect(parseChatActions(block({ labType })).actions, `labType=${String(labType)}`).toEqual([])
    }
  })

  it('accepts every real DadLabType', () => {
    for (const labType of ['science', 'engineering', 'adventure', 'heart']) {
      expect(parseChatActions(block({ labType })).actions, `labType=${labType}`).toHaveLength(1)
    }
  })

  it('drops a junk question as a FIELD, but rejects an over-long one', () => {
    expect(parseChatActions(block({ question: 7 })).actions[0]).not.toHaveProperty('question')
    expect(
      parseChatActions(block({ question: 'x'.repeat(MAX_LAB_QUESTION_CHARS + 1) })).actions,
    ).toEqual([])
  })

  it('rejects a bad materials list WHOLE — never silently thinned', () => {
    expect(parseChatActions(block({ materials: ['battery', ''] })).actions).toEqual([])
    expect(parseChatActions(block({ materials: ['battery', 7] })).actions).toEqual([])
    expect(parseChatActions(block({ materials: 'battery, bulb' })).actions).toEqual([])
    expect(
      parseChatActions(
        block({ materials: Array.from({ length: MAX_LAB_MATERIALS + 1 }, () => 'thing') }),
      ).actions,
    ).toEqual([])
    expect(
      parseChatActions(block({ materials: ['x'.repeat(MAX_LAB_MATERIAL_CHARS + 1)] })).actions,
    ).toEqual([])
  })

  it('accepts an arc link — arcId alone, or arcId + a non-negative integer step index', () => {
    expect(parseChatActions(block({ arcId: 'arc_elec' })).actions[0]).toMatchObject({
      arcId: 'arc_elec',
    })
    expect(
      parseChatActions(block({ arcId: 'arc_elec', arcStepIndex: 1 })).actions[0],
    ).toMatchObject({ arcId: 'arc_elec', arcStepIndex: 1 })
  })

  it('rejects a step index without an arc, and a negative / fractional / string index', () => {
    expect(parseChatActions(block({ arcStepIndex: 1 })).actions).toEqual([])
    expect(parseChatActions(block({ arcId: 'arc_elec', arcStepIndex: -1 })).actions).toEqual([])
    expect(parseChatActions(block({ arcId: 'arc_elec', arcStepIndex: 1.5 })).actions).toEqual([])
    expect(parseChatActions(block({ arcId: 'arc_elec', arcStepIndex: '1' })).actions).toEqual([])
    expect(parseChatActions(block({ arcId: '  ' })).actions).toEqual([])
  })

  it('a status is unrepresentable — a planned lab cannot be proposed Active or Complete', () => {
    const parsed = parseChatActions(block({ status: 'active' })).actions[0]
    expect(parsed).toBeDefined()
    expect(parsed).not.toHaveProperty('status')
  })
})

describe('parseChatActions — Dad Lab edits stay unrepresentable (FEAT-157)', () => {
  it('archive / complete / step-flip shaped kinds all fall through to null', () => {
    for (const kind of [
      'archiveConceptArc',
      'updateConceptArc',
      'deleteConceptArc',
      'startLab',
      'completeLab',
      'markArcStepDone',
    ]) {
      const raw = `<action>{"kind":"${kind}","childId":"lincoln","arcId":"arc_elec"}</action>`
      expect(parseChatActions(raw).actions, `kind=${kind}`).toEqual([])
    }
  })
})
