import { describe, it, expect } from 'vitest'

import type { Child } from '../../core/types'
import { CONCRETE_FIRST_ORAL_SCIENCE } from '../../core/ai/prompts/concreteFirstOralScience'
import { buildLabSuggestionsPrompt, buildLabIdeaPrompt } from './dadLabPrompts'

// Minimal two-child family matching the Barnes shape (id != name — ARCH-40 lens).
const children = [
  { id: 'child-lincoln', name: 'Lincoln' },
  { id: 'child-london', name: 'London' },
] as unknown as Child[]

describe('dadLabPrompts — ETHOS-03 concrete-first oral-science block', () => {
  it('prepends the ethos block to the "Suggest a Lab" prompt', () => {
    const prompt = buildLabSuggestionsPrompt(children)
    expect(prompt).toContain(CONCRETE_FIRST_ORAL_SCIENCE)
    expect(prompt.startsWith(CONCRETE_FIRST_ORAL_SCIENCE)).toBe(true)
  })

  it('prepends the ethos block to the "I Have an Idea" prompt', () => {
    const prompt = buildLabIdeaPrompt('build a volcano', children)
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

  it('carries the oral-science, never-read-or-write rail verbatim', () => {
    expect(CONCRETE_FIRST_ORAL_SCIENCE).toContain(
      'Never require a child to read or write anything.',
    )
    expect(CONCRETE_FIRST_ORAL_SCIENCE).toContain('"Change one thing and try again" IS the experiment')
  })

  it('leaves the rest of the "Suggest a Lab" prompt unchanged apart from the block (characterization)', () => {
    const prompt = buildLabSuggestionsPrompt(children)
    // Strip the leading ethos block + blank line; the remainder must match the pre-ETHOS-03 body.
    const body = prompt.slice(CONCRETE_FIRST_ORAL_SCIENCE.length).replace(/^\n+/, '')
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

  it('leaves the rest of the "I Have an Idea" prompt unchanged apart from the block (characterization)', () => {
    const prompt = buildLabIdeaPrompt('build a volcano', children)
    const body = prompt.slice(CONCRETE_FIRST_ORAL_SCIENCE.length).replace(/^\n+/, '')
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
