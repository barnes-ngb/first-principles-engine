import type { Child, SkillSnapshot } from '../../core/types'
import type { ChildSkillMap } from '../../core/curriculum'
import { CURRICULUM_NODE_MAP } from '../../core/curriculum'
import { CONCRETE_FIRST_ORAL_SCIENCE } from '../../core/ai/prompts/concreteFirstOralScience'
import { buildRoleRequestLines } from './childRoles'

/**
 * Dad Lab suggestion prompt builders (ETHOS-03 / ETHOS-04).
 *
 * The two prompts below were duplicated inline in `LabSuggestions.tsx` ("Suggest a
 * Lab") and `DadLabPage.tsx` ("I Have an Idea"). ARCH-40 shared only the role lines
 * (`buildRoleRequestLines`); the surrounding prompts stayed separate. They remain two
 * deliberately-distinct builders here — this module makes them testable and gives the
 * ETHOS-03 "concrete-first, oral science" block a single application point per path.
 * It is not a dedup refactor: the shared framework/context text is intentionally left
 * duplicated (do not merge — out of scope for this run).
 *
 * Both prompts open with `CONCRETE_FIRST_ORAL_SCIENCE` (the child-agnostic pedagogy
 * contract) followed by a `buildCalibrationParagraph` per child — the per-child
 * enrichment ETHOS-03 deferred and ETHOS-04 ships.
 */

/**
 * Per-child inputs for the calibration paragraph. `snapshot` and `skillMap` are the two
 * derived join points (FEAT-46 recon); either may be null when a child has no data yet.
 */
export interface CalibrationSource {
  child: Child
  snapshot: SkillSnapshot | null
  skillMap: ChildSkillMap | null
}

/** Cap list clauses so a paragraph stays ~100-150 words. */
const CALIBRATION_LIST_CAP = 3

/** Working-level number for a domain, reading from the snapshot's workingLevels. */
function readWorkingLevel(
  snapshot: SkillSnapshot | null,
  keys: Array<'phonics' | 'comprehension' | 'writing' | 'math' | 'sentence'>,
): number | undefined {
  const levels = snapshot?.workingLevels
  if (!levels) return undefined
  for (const key of keys) {
    const level = levels[key]?.level
    if (typeof level === 'number') return level
  }
  return undefined
}

/** In-progress skill labels for a curriculum domain, read from the skill map. */
function inProgressLabels(
  skillMap: ChildSkillMap | null,
  domain: 'reading' | 'writing' | 'math',
): string[] {
  if (!skillMap?.skills) return []
  const labels: string[] = []
  for (const [nodeId, entry] of Object.entries(skillMap.skills)) {
    if (entry.status !== 'in-progress') continue
    const node = CURRICULUM_NODE_MAP[nodeId]
    if (node?.domain === domain) labels.push(node.label)
  }
  return labels.slice(0, CALIBRATION_LIST_CAP)
}

/** One domain clause: "reads around working level 3 (working on Blends, Sight words)". */
function domainClause(
  verb: string,
  level: number | undefined,
  labels: string[],
): string | null {
  const working = labels.length ? `working on ${labels.join(', ')}` : ''
  if (level !== undefined && working) return `${verb} around working level ${level} (${working})`
  if (level !== undefined) return `${verb} around working level ${level}`
  if (working) return `${verb} — ${working}`
  return null
}

/**
 * Per-child calibration paragraph — working levels for reading/writing/math in plain
 * terms, a supports summary, and one modality line. Calibration, never avoidance: it
 * says where the child works and how to meet him there, never routes a skill away.
 *
 * Degrades gracefully: with a partial or empty snapshot/map it emits whatever exists and
 * always closes with the modality line (which needs no data). It NEVER emits a "no data"
 * complaint — no-shame and sparse-native by design.
 *
 * Interim source — re-point to `LearnerModel.modalityCalibration` when FEAT-46 ships
 * (design doc §3.3). Pure and side-effect-free so both Dad Lab builders can call it.
 */
export function buildCalibrationParagraph(
  child: Child,
  snapshot: SkillSnapshot | null,
  skillMap: ChildSkillMap | null,
): string {
  const name = child.name
  const sentences: string[] = []

  // Working levels (reading / writing / math), folding in-progress skills where known.
  const clauses = [
    domainClause('reads', readWorkingLevel(snapshot, ['phonics', 'comprehension']), inProgressLabels(skillMap, 'reading')),
    domainClause('writes', readWorkingLevel(snapshot, ['writing', 'sentence']), inProgressLabels(skillMap, 'writing')),
    domainClause('does math', readWorkingLevel(snapshot, ['math']), inProgressLabels(skillMap, 'math')),
  ].filter((c): c is string => c !== null)
  if (clauses.length) sentences.push(`${name} ${clauses.join('; ')}.`)

  // Stretch skills (priority skills that are not yet secure) — reinforce "stretch one step".
  const priority = (snapshot?.prioritySkills ?? [])
    .filter((s) => s.level !== 'secure')
    .map((s) => s.label)
    .slice(0, CALIBRATION_LIST_CAP)
  if (priority.length) sentences.push(`Stretch skills right now: ${priority.join(', ')}.`)

  // Supports + stop rules summary.
  const supports = (snapshot?.supports ?? []).map((s) => s.label).slice(0, CALIBRATION_LIST_CAP)
  const stopRules = (snapshot?.stopRules ?? []).map((r) => r.label).slice(0, CALIBRATION_LIST_CAP)
  if (supports.length) sentences.push(`Supports that help ${name}: ${supports.join('; ')}.`)
  if (stopRules.length) sentences.push(`Back off when: ${stopRules.join('; ')}.`)

  // Modality line — always emitted; calibration-not-avoidance in one sentence. It also
  // guarantees the paragraph always names the child, even when no snapshot/map exists.
  sentences.push(
    `Meet ${name} at this level and stretch one step: put short reading in activities at ${name}'s level ` +
      `(a label or a one-line prediction card ${name} can read aloud), and let ${name} dictate while the adult ` +
      `scribes unless ${name} wants to write. Never hide a skill.`,
  )

  return sentences.join(' ')
}

/** Join per-child calibration paragraphs into the block injected after the ethos rails. */
function buildCalibrationBlock(sources: CalibrationSource[]): string {
  return sources
    .map((s) => buildCalibrationParagraph(s.child, s.snapshot, s.skillMap))
    .join('\n\n')
}

/**
 * Model for Dad Lab suggestion generation (ETHOS-03). Bumped from the `chat`-task
 * default (Haiku) to Sonnet: the cadence is weekly (cost trivial) and the quality
 * complaint is real — Haiku's generated activities read too abstract and assume
 * reading/writing a child may not have. Passed as the `chat` request's allowlisted
 * `model` override so other `chat`-task callers stay on Haiku.
 */
// Sonnet 5 (FEAT-58). Client-side constant: must stay in the functions-side
// override allowlist (models.ts → ALLOWED_OVERRIDE_MODELS). Cross-boundary
// duplication of the model id — client cannot import from functions/.
export const DAD_LAB_SUGGESTION_MODEL = 'claude-sonnet-5'

/** Header introducing the per-child calibration block injected after the ethos rails. */
export const CALIBRATION_BLOCK_HEADER =
  'PER-CHILD CALIBRATION — meet each child at his working level (calibration, not avoidance):'

/** Prompt for the "Suggest a Lab" path (3 AI-suggested Saturday labs). */
export function buildLabSuggestionsPrompt(sources: CalibrationSource[]): string {
  const children = sources.map((s) => s.child)
  return `${CONCRETE_FIRST_ORAL_SCIENCE}

${CALIBRATION_BLOCK_HEADER}

${buildCalibrationBlock(sources)}

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
export function buildLabIdeaPrompt(ideaText: string, sources: CalibrationSource[]): string {
  const children = sources.map((s) => s.child)
  return `${CONCRETE_FIRST_ORAL_SCIENCE}

${CALIBRATION_BLOCK_HEADER}

${buildCalibrationBlock(sources)}

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
