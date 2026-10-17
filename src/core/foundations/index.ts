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
export {
  FAST_PHONICS_COMPLETION_CONCEPT_IDS,
  FAST_PHONICS_COMPLETION_MAPPING_VERSION,
  FAST_PHONICS_COMPLETION_SCOPE_NOTE,
  FAST_PHONICS_COMPLETION_TARGETS,
  FAST_PHONICS_DEPTH_ONLY_NOTE,
  FAST_PHONICS_FINAL_PEAK,
  FAST_PHONICS_IE_DISCREPANCY_NOTE,
  FAST_PHONICS_LABEL,
  FAST_PHONICS_SOURCE_ID,
  PARTIAL_COVERAGE_REASON,
  PROGRAM_COMPLETION_MAPPINGS,
  completionMappingFor,
  completionTargetFor,
} from './fastPhonicsCompletion'
export type {
  CompletionCoverageTarget,
  ProgramCompletionMapping,
} from './fastPhonicsCompletion'
export {
  applyCompletionCoverage,
  completionCoverageHasActiveRefs,
  completionCoverageIsApplied,
  withdrawCompletionCoverage,
} from './programCompletionProjection'
export type {
  AppliedCompletionCoverage,
  CompletionCoverageWrite,
  WithdrawnCompletionCoverage,
} from './programCompletionProjection'

/**
 * The coverage precedence + completion-evidence reader rules (FEAT-242) have ONE
 * definition, in `functions/src/shared/foundations/completionCoverage.ts`,
 * compiled by both this app and the Cloud Functions project — the same ARCH-47
 * pattern the graph itself follows. Re-exported here so an app consumer reaches
 * them through the barrel like everything else.
 */
export {
  COVERAGE_CAP,
  COVERAGE_REVIEW_CEILING,
  COVERAGE_STATE_RANK,
  CoverageQualifier,
  CoverageWithheldReason,
  EvidenceRefStatus,
  GOVERNING_DIRECT_KINDS,
  PROGRAM_COMPLETION_COVERAGE,
  activeCompletionRefsFor,
  activeEvidence,
  completionReviewNeeded,
  coveragePromotion,
  effectiveConceptState,
  effectiveConceptStates,
  governingDirectEvidence,
  isActiveEvidence,
  isCompletionCoverageRef,
  isGoverningDirectKind,
} from '../../../functions/src/shared/foundations/completionCoverage'
export type {
  CoverageEntryLike,
  CoverageEvidenceLike,
  CoveragePromotion,
  CoverageState,
} from '../../../functions/src/shared/foundations/completionCoverage'

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
