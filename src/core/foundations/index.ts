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
  bridgeCoveredConcepts,
  resolveNativePosition,
  isPositionAddressable,
  applyBridgeCoverageToModel,
} from './workbookBridge'
export type {
  WorkbookBridge,
  WorkbookBridgeUnit,
  BridgeCoverage,
  AppliedBridgeCoverage,
} from './workbookBridge'

import type { ConceptGraph, ConceptNode, FoundationDomain } from './types'
import { readingGraph } from './readingGraph'
import { mathGraph } from './mathGraph'

/** Both domain graphs, in spine order (reading, then math). */
export const foundationGraphs: ConceptGraph[] = [readingGraph, mathGraph]

/** Every foundation node across both domains, flattened. */
export const allFoundationNodes: ConceptNode[] = foundationGraphs.flatMap(
  (g) => g.nodes,
)

/** Flat lookup of foundation nodes by id (both domains). */
export const FOUNDATION_NODE_MAP: Record<string, ConceptNode> = Object.fromEntries(
  allFoundationNodes.map((n) => [n.id, n]),
)

/**
 * A single combined version tag for "which spine this model was synthesized
 * against" (stored on `LearnerModel.graphVersion`). Both domain graphs move
 * together, so the tag names both.
 */
export function foundationGraphVersion(): string {
  return `reading@${readingGraph.version}+math@${mathGraph.version}`
}

/** The nodes for one domain. */
export function foundationNodesForDomain(domain: FoundationDomain): ConceptNode[] {
  return foundationGraphs.find((g) => g.domain === domain)?.nodes ?? []
}
