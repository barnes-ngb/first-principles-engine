/**
 * Foundations concept-graph types (FEAT-48, Learner Model slice 1).
 *
 * The graph is the shared K→5 reading + math spine described in
 * `docs/LEARNER_MODEL_DESIGN.md` §2 and transcribed verbatim from the two
 * OWNER-CURATED v1 files (`docs/foundations/READING_GRAPH_V0.md`,
 * `MATH_GRAPH_V0.md`). It ships as **versioned data in code** (Open Decision D2,
 * ADOPTED): the content lives in {@link readingGraph} / {@link mathGraph}, and
 * anything that consumes a child's foundation states seeds against it.
 *
 * These are pure data types — no seeding or state logic lives here. The bootstrap
 * seeder (`seedLearnerModel.ts`) is the only thing that turns this graph plus a
 * child's derived signals into a stored `LearnerModel`.
 */

/** The curriculum domains the foundations spine covers (academic only). */
export const FoundationDomain = {
  Reading: 'reading',
  Math: 'math',
} as const
export type FoundationDomain = (typeof FoundationDomain)[keyof typeof FoundationDomain]

/**
 * Grade band (K–5) a concept first becomes the working edge, transcribed from the
 * curated graphs. A node can straddle two adjacent bands (`K-1`, `1-2`) where the
 * owner placed it across a boundary. Every band's numeric parts stay within K–5.
 */
export const Band = {
  K: 'K',
  One: '1',
  Two: '2',
  Three: '3',
  Four: '4',
  Five: '5',
  KOne: 'K-1',
  OneTwo: '1-2',
} as const
export type Band = (typeof Band)[keyof typeof Band]

/**
 * A single concept in the foundations spine.
 *
 * - `id` reuses the existing `curriculumMap` node id where an equivalent node
 *   already exists (so the tag bridge and Learning-Map UI line up); new ids follow
 *   the same `reading.<strand>.<concept>` / `math.<strand>.<concept>` convention.
 * - `underlies` is the forward edge — concepts this one is a prerequisite *for*.
 * - `kidName` obeys the no-judge / no-score rail: a positive capability, never a
 *   deficit or a grade number.
 */
export interface ConceptNode {
  id: string
  domain: FoundationDomain
  band: Band
  kidName: string
  parentDescription: string
  underlies: string[]
}

/** A versioned, single-domain concept graph (ships as code — D2). */
export interface ConceptGraph {
  version: number
  domain: FoundationDomain
  nodes: ConceptNode[]
}
