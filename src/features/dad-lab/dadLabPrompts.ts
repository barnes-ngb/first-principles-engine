import type { Child } from '../../core/types'
import { CONCRETE_FIRST_ORAL_SCIENCE } from '../../core/ai/prompts/concreteFirstOralScience'
import { buildRoleRequestLines } from './childRoles'

/**
 * Dad Lab suggestion prompt builders (ETHOS-03).
 *
 * The two prompts below were duplicated inline in `LabSuggestions.tsx` ("Suggest a
 * Lab") and `DadLabPage.tsx` ("I Have an Idea"). ARCH-40 shared only the role lines
 * (`buildRoleRequestLines`); the surrounding prompts stayed separate. They remain two
 * deliberately-distinct builders here — this module makes them testable and gives the
 * ETHOS-03 "concrete-first, oral science" block a single application point per path.
 * It is not a dedup refactor: the shared framework/context text is intentionally left
 * duplicated (do not merge — out of scope for this run).
 *
 * Both prompts open with `CONCRETE_FIRST_ORAL_SCIENCE` so every generated lab obeys the
 * concrete-first, oral-science pedagogy contract.
 */

/** Prompt for the "Suggest a Lab" path (3 AI-suggested Saturday labs). */
export function buildLabSuggestionsPrompt(children: Child[]): string {
  return `${CONCRETE_FIRST_ORAL_SCIENCE}

Suggest 3 Dad Lab activities for this Saturday.

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
${buildRoleRequestLines(children)}
Teaching moment: [when/how Lincoln teaches London]
Subject connection: [what subject this connects to and why]
Duration: [estimated total minutes]
---

Give exactly 3 suggestions separated by ---. Make them different types.`
}

/** Prompt for the "I Have an Idea" path (structure an owner-supplied idea into a plan). */
export function buildLabIdeaPrompt(ideaText: string, children: Child[]): string {
  return `${CONCRETE_FIRST_ORAL_SCIENCE}

I have an idea for a Dad Lab activity. Structure it into a complete lab plan.

My idea: "${ideaText}"

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
${buildRoleRequestLines(children)}
Duration: [estimated minutes]`
}
