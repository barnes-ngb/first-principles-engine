import { describe, expect, it } from 'vitest'

import type { ChecklistItem, DayBlock, DayLog, WatchVideo } from '../../core/types'
import { DayBlockType, EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { applyWatchCompletion, buildWatchArtifact, WATCH_ARTIFACT_DOMAIN } from './watchItemCompletion'

// A curated history video → SocialStudies (History folds into SocialStudies).
const video: WatchVideo = {
  id: 'vid-1',
  youtubeId: 'abcdefghijk',
  title: 'The American Revolution',
  plannedMinutes: 12,
  subjectBucket: SubjectBucket.SocialStudies,
  childId: 'lincoln',
  addedBy: 'parent',
  vettedAt: '2026-07-19T00:00:00.000Z',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
}

const watchItem: ChecklistItem = {
  label: 'Watch: The American Revolution (12m)',
  completed: false,
  itemType: 'watch',
  watchVideoId: 'vid-1',
  subjectBucket: SubjectBucket.SocialStudies,
  estimatedMinutes: 12,
}

// Block whose title matches the item label (minus the "(Nm)" suffix), exactly
// as the planner lock-in writes it.
const watchBlock: DayBlock = {
  type: DayBlockType.Other,
  title: 'Watch: The American Revolution',
  subjectBucket: SubjectBucket.SocialStudies,
  plannedMinutes: 12,
}

const baseDayLog: DayLog = {
  childId: 'lincoln',
  date: '2026-07-19',
  checklist: [watchItem],
  blocks: [watchBlock],
}

describe('applyWatchCompletion — hours credit (D3, planned = actual)', () => {
  it('marks the item complete and credits plannedMinutes to the matching block', () => {
    const result = applyWatchCompletion(baseDayLog, 0, video.plannedMinutes)
    expect(result.checklist?.[0].completed).toBe(true)
    expect(result.blocks?.[0].actualMinutes).toBe(12)
  })

  it('is idempotent — completing an already-complete item is a no-op (no double credit)', () => {
    const once = applyWatchCompletion(baseDayLog, 0, video.plannedMinutes)
    // Completing again returns the SAME log reference and never re-credits.
    const twice = applyWatchCompletion(once, 0, video.plannedMinutes)
    expect(twice).toBe(once)
    expect(twice.blocks?.[0].actualMinutes).toBe(12)
  })

  it('does not clobber a manually-set block actualMinutes', () => {
    const withActual: DayLog = {
      ...baseDayLog,
      blocks: [{ ...watchBlock, actualMinutes: 99 }],
    }
    const result = applyWatchCompletion(withActual, 0, video.plannedMinutes)
    expect(result.blocks?.[0].actualMinutes).toBe(99)
  })

  it('is a no-op when the index is out of range', () => {
    const result = applyWatchCompletion(baseDayLog, 5, video.plannedMinutes)
    expect(result).toBe(baseDayLog)
  })

  it('never mutates the input day log', () => {
    const snapshot = JSON.stringify(baseDayLog)
    applyWatchCompletion(baseDayLog, 0, video.plannedMinutes)
    expect(JSON.stringify(baseDayLog)).toBe(snapshot)
  })

  it('writes no XP: touches only checklist + blocks, never an xpTotal/xpLedger field', () => {
    const result = applyWatchCompletion(baseDayLog, 0, video.plannedMinutes)
    // The completion returns a DayLog with no XP total introduced by this path.
    expect(result.xpTotal).toBeUndefined()
    // Only completed + block minutes changed.
    expect(Object.keys(result).sort()).toEqual(['blocks', 'checklist', 'childId', 'date'].sort())
  })
})

describe('buildWatchArtifact — portfolio artifact only (C2)', () => {
  it('titles "Watched {title}" and tags the video subject', () => {
    const artifact = buildWatchArtifact({
      childId: 'lincoln',
      video,
      createdAt: '2026-07-19T12:00:00.000Z',
    })
    expect(artifact.title).toBe('Watched The American Revolution')
    expect(artifact.type).toBe(EvidenceType.Video)
    expect(artifact.tags.subjectBucket).toBe(SubjectBucket.SocialStudies)
    expect(artifact.tags.domain).toBe(WATCH_ARTIFACT_DOMAIN)
    expect(artifact.tags.engineStage).toBe(EngineStage.Build)
    expect(artifact.tags.location).toBe('Home')
    expect(artifact.childId).toBe('lincoln')
  })

  it('stores the optional "what we saw" note in content', () => {
    const artifact = buildWatchArtifact({
      childId: 'lincoln',
      video,
      createdAt: '2026-07-19T12:00:00.000Z',
      note: '  We learned about 1776  ',
    })
    expect(artifact.content).toBe('We learned about 1776')
  })

  it('omits content when the note is absent or blank (never blocks completion)', () => {
    expect(buildWatchArtifact({ childId: 'l', video, createdAt: 'x' }).content).toBeUndefined()
    expect(buildWatchArtifact({ childId: 'l', video, createdAt: 'x', note: '   ' }).content).toBeUndefined()
  })

  it('writes NO learner-model / concept-state / XP fields — it is only an artifact', () => {
    const artifact = buildWatchArtifact({ childId: 'l', video, createdAt: 'x', note: 'n' })
    // Non-curriculum: no skillTags on a watch artifact (never a concept-graph input).
    expect('skillTags' in artifact.tags).toBe(false)
    // No XP / diamond / concept fields leak onto the artifact.
    for (const key of ['xp', 'diamonds', 'conceptId', 'learnerModel', 'concept']) {
      expect(key in artifact).toBe(false)
    }
  })
})
