/**
 * Foundations concept graph — public barrel (FEAT-48, Learner Model slice 1).
 *
 * The shared K→5 reading + math spine, shipped as versioned data (D2). Everything
 * here is pure content and pure helpers; the bootstrap seeder lives separately.
 */

export * from './types'
export { readingGraph, READING_GRAPH_VERSION } from './readingGraph'
export { mathGraph, MATH_GRAPH_VERSION } from './mathGraph'
export {
  fastPhonicsBridge,
  fastPhonicsWorkbookBridge,
  fastPhonicsUnits,
  FAST_PHONICS_BRIDGE_VERSION,
  bridgeForSource,
  bridgeEvidenceForPosition,
  normalizeSourceName,
} from './fastPhonicsBridge'
export type { BridgeUnit, CurriculumBridge, BridgeEvidence } from './fastPhonicsBridge'
export {
  workbookBridgeForSource,
  matchWorkbookBridge,
  levelInName,
  MIN_CONTAINS_ALIAS_LENGTH,
  bridgeCoveredConcepts,
  resolveNativePosition,
  resolveSyncNativePosition,
  maxWitnessedNativePosition,
  parseNativePositionFromUnit,
  makeBandCeilingLessonToUnit,
  isPositionAddressable,
  applyBridgeCoverageToModel,
} from './workbookBridge'
export type {
  WorkbookBridge,
  WorkbookBridgeUnit,
  WorkbookBridgeMatch,
  BridgeCoverage,
  AppliedBridgeCoverage,
} from './workbookBridge'
export { mathseedsBridge, MATHSEEDS_BRIDGE_VERSION } from './mathseedsBridge'
export { tgtbLa1Bridge, TGTB_LA1_BRIDGE_VERSION } from './tgtbLa1Bridge'
export {
  conceptsForTags,
  TAG_CONCEPT_BRIDGE,
  TAG_CONCEPT_BRIDGE_VERSION,
} from './tagConceptBridge'
export { LESSONS_PER_PEAK } from './fastPhonicsBridge'

/**
 * The spine and its derivations now have ONE definition, in
 * `functions/src/shared/foundations/graph.ts`, compiled by both this app and the
 * Cloud Functions project (UX-296). The barrel keeps every name it exported, so
 * no consumer moved: `foundationGraphs` (spine order — reading, then math),
 * `allFoundationNodes`, `FOUNDATION_NODE_MAP`, `foundationGraphVersion` (the
 * `reading@1+math@1` tag stored on `LearnerModel.graphVersion`) and
 * `foundationNodesForDomain`.
 */
export {
  foundationGraphs,
  allFoundationNodes,
  FOUNDATION_NODE_MAP,
  foundationGraphVersion,
  foundationNodesForDomain,
} from '../../../functions/src/shared/foundations/graph'
