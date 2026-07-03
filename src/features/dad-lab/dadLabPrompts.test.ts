import { describe, it, expect } from 'vitest'

import type { Child, SkillSnapshot } from '../../core/types'
import type { ChildSkillMap } from '../../core/curriculum'
import { CONCRETE_FIRST_ORAL_SCIENCE } from '../../core/ai/prompts/concreteFirstOralScience'
import {
  buildLabSuggestionsPrompt,
  buildLabIdeaPrompt,
  buildCalibrationParagraph,
  type CalibrationSource,
} from './dadLabPrompts'

// Minimal two-child family matching the Barnes shape (id != name — ARCH-40 lens).
const children = [
  { id: 'child-lincoln', name: 'Lincoln' },
  { id: 'child-london', name: 'London' },
] as unknown as Child[]

// Bare sources (no snapshot/map) — the calibration block degrades to modality lines only.
const bareSources: CalibrationSource[] = children.map((child) => ({
  child,
  snapshot: null,
  skillMap: null,
}))

// Full-data snapshot + map for a single child, using real curriculum node ids/labels.
const lincolnSnapshot = {
  childId: 'child-lincoln',
  prioritySkills: [
    { tag: 'reading.phonics.blends', label: 'Blends', level: 'developing' },
    { tag: 'reading.phonics.cvc', label: 'CVC words', level: 'secure' }, // secure → excluded from stretch
  ],
  supports: [
    { label: 'Short routines', description: 'Keep each block under 10 minutes' },
    { label: 'Visual checklist', description: 'Show the steps as pictures' },
  ],
  stopRules: [{ label: 'Frustration spike', trigger: 'sighs / pushes away', action: 'switch to a win' }],
  evidenceDefinitions: [],
  workingLevels: {
    phonics: { level: 3, updatedAt: '2026-01-01', source: 'quest' },
    writing: { level: 2, updatedAt: '2026-01-01', source: 'quest' },
    math: { level: 5, updatedAt: '2026-01-01', source: 'quest' },
  },
} as unknown as SkillSnapshot

const lincolnMap = {
  childId: 'child-lincoln',
  skills: {
    'reading.phonics.blends': { nodeId: 'reading.phonics.blends', status: 'in-progress', source: 'evaluation', updatedAt: '2026-01-01' },
    'math.operations.multDiv': { nodeId: 'math.operations.multDiv', status: 'in-progress', source: 'evaluation', updatedAt: '2026-01-01' },
    'reading.phonics.cvc': { nodeId: 'reading.phonics.cvc', status: 'mastered', source: 'evaluation', updatedAt: '2026-01-01' },
  },
  updatedAt: '2026-01-01',
} as unknown as ChildSkillMap

const NO_SHAME_TERMS = ['no data', "hasn't", 'missing']

describe('dadLabPrompts — ETHOS-03/04 concrete-first oral-science block', () => {
  it('prepends the ethos block to the "Suggest a Lab" prompt', () => {
    const prompt = buildLabSuggestionsPrompt(bareSources)
    expect(prompt).toContain(CONCRETE_FIRST_ORAL_SCIENCE)
    expect(prompt.startsWith(CONCRETE_FIRST_ORAL_SCIENCE)).toBe(true)
  })

  it('prepends the ethos block to the "I Have an Idea" prompt', () => {
    const prompt = buildLabIdeaPrompt('build a volcano', bareSources)
    expect(prompt).toContain(CONCRETE_FIRST_ORAL_SCIENCE)
    expect(prompt.startsWith(CONCRETE_FIRST_ORAL_SCIENCE)).toBe(true)
  })

  it('the block itself is child-agnostic — no child names or diagnosis language (ARCH-40)', () => {
    const forbidden = [
      'Lincoln',
      'London',
      'neurodivergent',
      'speech',
      'diagnosis',
      'disability',
    ]
    for (const term of forbidden) {
      expect(CONCRETE_FIRST_ORAL_SCIENCE.toLowerCase()).not.toContain(term.toLowerCase())
    }
  })

  it('carries the calibration-not-avoidance rail verbatim (ETHOS-04)', () => {
    // ETHOS-04 corrected ETHOS-03's rev-1 "Never require a child to read or write
    // anything." into calibration-not-avoidance. The old avoidance line must be gone.
    expect(CONCRETE_FIRST_ORAL_SCIENCE).not.toContain(
      'Never require a child to read or write anything.',
    )
    expect(CONCRETE_FIRST_ORAL_SCIENCE).toContain(
      'Meet each child at their working level and stretch one step.',
    )
    expect(CONCRETE_FIRST_ORAL_SCIENCE).toContain('Never hide a skill from a child')
    expect(CONCRETE_FIRST_ORAL_SCIENCE).toContain('The goal is understanding, not avoidance.')
    expect(CONCRETE_FIRST_ORAL_SCIENCE).toContain('"Change one thing and try again" IS the experiment')
  })

  it('injects a per-child calibration paragraph after the ethos block (ETHOS-04)', () => {
    const sources: CalibrationSource[] = [
      { child: children[0], snapshot: lincolnSnapshot, skillMap: lincolnMap },
      { child: children[1], snapshot: null, skillMap: null },
    ]
    const prompt = buildLabSuggestionsPrompt(sources)
    for (const s of sources) {
      const para = buildCalibrationParagraph(s.child, s.snapshot, s.skillMap)
      expect(prompt).toContain(para)
    }
    // Calibration sits between the ethos block and the task body.
    const ethosEnd = CONCRETE_FIRST_ORAL_SCIENCE.length
    const bodyStart = prompt.indexOf('Suggest 3 Dad Lab activities')
    const lincolnPara = buildCalibrationParagraph(children[0], lincolnSnapshot, lincolnMap)
    const paraIdx = prompt.indexOf(lincolnPara)
    expect(paraIdx).toBeGreaterThan(ethosEnd)
    expect(paraIdx).toBeLessThan(bodyStart)
  })

  it('leaves the task body of "Suggest a Lab" unchanged from ETHOS-03 (characterization)', () => {
    const prompt = buildLabSuggestionsPrompt(bareSources)
    // The body from the task marker onward must be byte-identical to the pre-ETHOS-04 body.
    const body = prompt.slice(prompt.indexOf('Suggest 3 Dad Lab activities'))
    expect(body).toMatchInlineSnapshot(`
      "Suggest 3 Dad Lab activities for this Saturday.

      Context:
      - Lincoln (10, neurodivergent, loves Minecraft/building/art)
      - London (6, loves drawing and stories)
      - Both boys
      - Keep to 45-90 minutes, household materials preferred
      - Lincoln should lead hard parts and teach London after
      - London assists, observes, and creates (drawing, decorating)

      DAD LAB TYPES AND FRAMEWORKS:

      TYPE 1: EXPERIMENT (science) — Scientific Method
      Framework: Question → Hypothesis → Test → Observe → Conclude
      - Prediction step: "Lincoln, what do you THINK will happen when we...?"
      - Testing step: Hands-on experiment with clear variables
      - Observation step: "What did we actually see? Was it what you expected?"
      - Conclusion step: "Why do you think it happened that way?"
      - Lincoln teaches London: Explain the result simply
      Example: "Does a heavy ball fall faster than a light ball?"

      TYPE 2: BUILD (engineering) — Engineering Design
      Framework: Problem → Design → Build → Test → Improve
      - Define the problem: "We need a bridge that holds this weight"
      - Design phase: Sketch on paper first
      - Build phase: Construct with available materials
      - Test phase: Does it work? How well?
      - Improve phase: What would you change? Build version 2.
      Example: "Build a catapult that launches a marshmallow into a cup"

      TYPE 3: EXPLORE (adventure) — Discovery/Nature
      Framework: Wonder → Observe → Document → Research → Share
      - Go outside or to a location
      - Observe and document (photos, sketches, notes)
      - Research what you found
      - Lincoln explains to London what they learned
      Example: "What lives in our backyard soil?"

      TYPE 4: CREATE (heart) — Making/Art/Character
      Framework: Inspiration → Plan → Make → Reflect → Display
      - Less rigid structure, process matters more than outcome
      - Focus on decisions and problem-solving during creation
      - Lincoln describes his creative choices
      - Connect to a virtue or character theme
      Example: "Build a Minecraft diorama with real materials"

      For each suggestion:
      1. STATE THE TYPE: e.g. "Type: science" (uses Scientific Method framework)
      2. LIST THE PHASES for that type with estimated time per phase
      3. INCLUDE both boys: Lincoln's role + London's role
      4. NOTE the teaching moment: "After the test, Lincoln explains to London why..."
      5. CONNECT to school: "This connects to [subject] because..."
      6. MATERIALS: List what Nathan needs, flag anything that needs advance purchase

      Respond in EXACTLY this format:

      ---
      Title: [name]
      Type: [science/engineering/adventure/heart]
      Framework: [e.g. "Question → Hypothesis → Test → Observe → Conclude"]
      Question: [the driving question to explore]
      Description: [what you'll do, 2-3 sentences]
      Phases: [Phase 1 (Xmin) → Phase 2 (Xmin) → Phase 3 (Xmin)]
      Materials: [comma-separated list of materials needed]
      Lincoln's role: [what Lincoln does]
      London's role: [what London does]
      Teaching moment: [when/how Lincoln teaches London]
      Subject connection: [what subject this connects to and why]
      Duration: [estimated total minutes]
      ---

      Give exactly 3 suggestions separated by ---. Make them different types."
    `)
  })

  it('leaves the task body of "I Have an Idea" unchanged from ETHOS-03 (characterization)', () => {
    const prompt = buildLabIdeaPrompt('build a volcano', bareSources)
    const body = prompt.slice(prompt.indexOf('I have an idea for a Dad Lab activity'))
    expect(body).toMatchInlineSnapshot(`
      "I have an idea for a Dad Lab activity. Structure it into a complete lab plan.

      My idea: "build a volcano"

      Context:
      - Lincoln (10, neurodivergent, loves Minecraft/building/art)
      - London (6, loves drawing and stories)
      - Both boys
      - Saturday morning lab, 45-90 minutes

      Respond in EXACTLY this format (no other text):
      Title: [a catchy name for the lab]
      Type: [science/engineering/adventure/heart]
      Question: [a driving question that frames the exploration]
      Description: [2-3 sentences about what we'll do and learn]
      Materials: [comma-separated list of what we need]
      Lincoln's role: [what Lincoln does]
      London's role: [what London does]
      Duration: [estimated minutes]"
    `)
  })
})

describe('buildCalibrationParagraph — per-child calibration (ETHOS-04)', () => {
  it('full data: working levels, stretch skills, supports, and the modality line', () => {
    const para = buildCalibrationParagraph(children[0], lincolnSnapshot, lincolnMap)
    // Working levels in plain terms, with in-progress skills folded in from the map.
    expect(para).toContain('working level 3')
    expect(para).toContain('Blends')
    expect(para).toContain('working level 5')
    expect(para).toContain('Multiplication & division')
    // Stretch skills = priority skills not yet secure (CVC is secure → excluded).
    expect(para).toContain('Stretch skills right now: Blends')
    expect(para).not.toContain('CVC words')
    // Supports summary + stop rule.
    expect(para).toContain('Short routines')
    expect(para).toContain('Frustration spike')
    // Modality line — calibration, not avoidance.
    expect(para).toContain('Meet Lincoln at this level and stretch one step')
    expect(para).toContain('Never hide a skill')
    // Roughly a paragraph, not a wall of text.
    const words = para.split(/\s+/).length
    expect(words).toBeGreaterThan(60)
    expect(words).toBeLessThan(200)
  })

  it('snapshot-only: emits working levels + supports, no map-derived skills, no crash', () => {
    const para = buildCalibrationParagraph(children[0], lincolnSnapshot, null)
    expect(para).toContain('working level 3')
    expect(para).toContain('Short routines')
    expect(para).not.toContain('working on') // no map → no in-progress skill labels
    expect(para).toContain('Meet Lincoln at this level')
  })

  it('map-only: emits in-progress skills + modality line, no supports sentence', () => {
    const para = buildCalibrationParagraph(children[0], null, lincolnMap)
    expect(para).toContain('working on Blends')
    expect(para).toContain('Multiplication & division')
    expect(para).not.toContain('working level') // no snapshot → no numeric levels
    expect(para).not.toContain('Supports that help')
    expect(para).toContain('Meet Lincoln at this level')
  })

  it('neither: emits only the name-framed modality line', () => {
    const para = buildCalibrationParagraph(children[1], null, null)
    expect(para).toContain('London')
    expect(para).toContain('Meet London at this level and stretch one step')
    expect(para).toContain('Never hide a skill')
    expect(para).not.toContain('working level')
    expect(para).not.toContain('Supports that help')
  })

  it('no-shame: output never complains about absent data (any input shape)', () => {
    const shapes: CalibrationSource[] = [
      { child: children[0], snapshot: lincolnSnapshot, skillMap: lincolnMap },
      { child: children[0], snapshot: lincolnSnapshot, skillMap: null },
      { child: children[0], snapshot: null, skillMap: lincolnMap },
      { child: children[1], snapshot: null, skillMap: null },
    ]
    for (const s of shapes) {
      const para = buildCalibrationParagraph(s.child, s.snapshot, s.skillMap).toLowerCase()
      for (const term of NO_SHAME_TERMS) {
        expect(para).not.toContain(term)
      }
    }
  })
})
