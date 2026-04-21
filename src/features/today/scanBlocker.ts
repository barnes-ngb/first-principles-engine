import type { ConceptualBlock } from '../../core/types/evaluation'
import type { WorksheetScanResult } from '../../core/types'
import { generateBlockId } from '../../core/utils/blockerLifecycle'

/**
 * Derive blockers from a completed worksheet scan.
 *
 * Signals that warrant a blocker:
 * - recommendation is 'skip' (AI says "too hard for this child")
 * - estimatedDifficulty is 'too-hard' or 'challenging'
 * - any skillsTargeted entry alignsWithSnapshot === 'behind' (child is under-prepared for this skill)
 *
 * Recommendations of 'do' or 'quick-review' produce no blockers — those are confidence, not struggle.
 *
 * Returns one block per challenging skill. If the scan has no skillsTargeted
 * but is otherwise too-hard, emits a single block keyed off the specificTopic/subject.
 */
export function detectBlockersFromScan(
  scan: WorksheetScanResult,
  opts?: { scanId?: string; now?: string },
): Partial<ConceptualBlock>[] {
  if (!scan) return []

  const rec = scan.recommendation
  const difficulty = scan.estimatedDifficulty
  const hardRecommendation = rec === 'skip' || rec === 'modify'
  const hardDifficulty = difficulty === 'too-hard' || difficulty === 'challenging'

  if (!hardRecommendation && !hardDifficulty) return []

  const now = opts?.now ?? new Date().toISOString()
  const scanId = opts?.scanId ?? ''
  const curriculum = scan.curriculumDetected?.name ?? scan.subject ?? 'curriculum'
  const lessonRef =
    scan.curriculumDetected?.lessonNumber != null
      ? `Lesson ${scan.curriculumDetected.lessonNumber}`
      : scan.curriculumDetected?.pageNumber != null
        ? `Page ${scan.curriculumDetected.pageNumber}`
        : null
  const contentRef = lessonRef ? `${curriculum} ${lessonRef}` : curriculum

  const blocks: Partial<ConceptualBlock>[] = []

  // One blocker per skill that the scan flagged as 'behind' (child not yet there).
  const behindSkills = (scan.skillsTargeted ?? []).filter(
    (s) => s.alignsWithSnapshot === 'behind',
  )

  if (behindSkills.length > 0) {
    for (const s of behindSkills) {
      const id = generateBlockId(s.skill)
      const evidence = `Scan of ${contentRef} identified ${s.skill} as challenging (${s.level}, behind snapshot)`
      blocks.push({
        id,
        name: s.skill,
        affectedSkills: [s.skill],
        status: 'ADDRESS_NOW',
        recommendation: 'ADDRESS_NOW',
        rationale:
          `Scan recommendation "${rec}" with difficulty "${difficulty}". ` +
          `Skill sits behind the current snapshot.`,
        evidence,
        detectedAt: now,
        firstDetectedAt: now,
        lastReinforcedAt: now,
        sessionCount: 1,
        source: 'scan',
        lastSource: 'scan',
        evaluationSessionId: scanId,
      })
    }
    return blocks
  }

  // No behind-skills flagged but scan is still too-hard / skip — record a topic-level blocker.
  if (hardRecommendation || difficulty === 'too-hard') {
    const topic = scan.specificTopic || scan.subject || 'Unknown topic'
    const id = generateBlockId(`${scan.subject || ''} ${topic}`)
    const evidence = `Scan of ${contentRef} flagged as ${difficulty} — topic: ${topic}`
    blocks.push({
      id,
      name: topic,
      affectedSkills: topic ? [topic] : [],
      status: 'ADDRESS_NOW',
      recommendation: 'ADDRESS_NOW',
      rationale: `Scan recommendation "${rec}" with difficulty "${difficulty}". Topic is out of reach without support.`,
      evidence,
      detectedAt: now,
      firstDetectedAt: now,
      lastReinforcedAt: now,
      sessionCount: 1,
      source: 'scan',
      lastSource: 'scan',
      evaluationSessionId: scanId,
    })
  }

  return blocks
}
