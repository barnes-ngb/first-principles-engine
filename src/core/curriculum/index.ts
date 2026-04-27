export {
  CurriculumDomain,
  SkillTier,
  SKILL_TIER_ORDER,
  READING_MAP,
  MATH_MAP,
  SPEECH_MAP,
  WRITING_MAP,
  CURRICULUM_MAPS,
  CURRICULUM_NODE_MAP,
  getNodesForDomain,
  getNodesForTier,
  getDependents,
} from './curriculumMap'
export type { CurriculumNode, CurriculumDomainMap } from './curriculumMap'

export {
  SkillStatus,
  SkillStatusLabel,
} from './skillStatus'
export type {
  SkillNodeStatus,
  ChildSkillMap,
  DomainSummary,
} from './skillStatus'

export {
  mapFindingToNode,
  findingStatusToSkillStatus,
  getNodesForProgram,
} from './mapFindingToNode'

export {
  updateSkillMapFromFindings,
  initializeSkillMapFromHistory,
  markProgramCompleteOnSkillMap,
} from './updateSkillMapFromFindings'
