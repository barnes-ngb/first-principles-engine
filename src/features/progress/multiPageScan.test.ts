import { describe, it, expect, vi } from 'vitest'

import { processScanBatch, summarizeScanBatch } from './multiPageScan'
import type { BatchScanHandlers, PageOutcome } from './multiPageScan'
import { isWorkbookMatch } from '../../core/hooks/useScanToActivityConfig'
import type { ScanConfigResult } from '../../core/hooks/useScanToActivityConfig'
import type { ScanRecord, WorksheetScanResult } from '../../core/types'

// A worksheet scan record for a given curriculum + lesson.
function worksheetRecord(
  name: string,
  subject: string,
  lessonNumber: number | null,
): ScanRecord {
  const results: WorksheetScanResult = {
    pageType: 'worksheet',
    subject,
    specificTopic: '',
    skillsTargeted: [],
    estimatedDifficulty: 'appropriate',
    recommendation: 'do',
    recommendationReason: '',
    estimatedMinutes: 30,
    teacherNotes: '',
    curriculumDetected: {
      provider: 'gatb',
      name,
      lessonNumber,
      pageNumber: null,
      levelDesignation: null,
    },
  }
  return {
    childId: 'lincoln',
    imageUrl: '',
    storagePath: '',
    results,
    action: 'pending',
  }
}

/**
 * Faithful in-memory find-or-create that mirrors `syncScanToConfig`'s
 * generic (non-targeted) path: it re-reads the current config list on every
 * call (so a prior sequential write is visible) and uses the real, unchanged
 * DATA-15 `isWorkbookMatch` matcher. This lets us assert the merge-vs-distinct
 * outcome end-to-end at the orchestration level without Firestore.
 */
function makeFakeStore() {
  const configs: { id: string; name: string; subject: string; position: number }[] = []
  let counter = 0
  const syncOne = async (results: WorksheetScanResult): Promise<ScanConfigResult> => {
    const detected = results.curriculumDetected
    const name = detected?.name || results.subject
    const subject = results.subject
    const lesson = detected?.lessonNumber ?? null
    const match = configs.find(
      (c) =>
        isWorkbookMatch(c.name, name, c.subject, subject) ||
        isWorkbookMatch(c.name, results.subject, c.subject, subject),
    )
    if (match) {
      if (lesson != null && lesson > match.position) match.position = lesson
      return {
        action: 'updated',
        configId: match.id,
        configName: match.name,
        position: match.position,
      }
    }
    const id = `cfg-${++counter}`
    configs.push({ id, name, subject, position: lesson ?? 1 })
    return { action: 'created', configId: id, configName: name, position: lesson ?? 1 }
  }
  return { configs, syncOne }
}

describe('processScanBatch — sequential apply', () => {
  it('(a) two pages of the SAME workbook → one config at the max lesson (merged)', async () => {
    const store = makeFakeStore()
    const files = [new File([], 'p1.jpg'), new File([], 'p2.jpg')]
    const records = [
      worksheetRecord('GATB Math', 'Math', 33),
      worksheetRecord('GATB Math', 'Math', 34),
    ]
    const handlers: BatchScanHandlers = {
      scanOne: async (_file, i) => records[i],
      syncOne: store.syncOne,
    }

    const summary = await processScanBatch(files, handlers)

    // One config only, advanced to the higher lesson.
    expect(store.configs).toHaveLength(1)
    expect(store.configs[0].position).toBe(34)
    // Second page is re-labelled as a merge.
    expect(summary.outcomes.map((o) => o.status)).toEqual(['created', 'merged'])
    expect(summary.mergedConfigs).toBe(1)
    expect(summary.message).toContain('Added GATB Math → L34')
    expect(summary.message).toContain('2 pages merged into GATB Math')
  })

  it('(b) two DIFFERENT workbooks → two separate configs', async () => {
    const store = makeFakeStore()
    const files = [new File([], 'p1.jpg'), new File([], 'p2.jpg')]
    const records = [
      worksheetRecord('GATB Math', 'Math', 12),
      worksheetRecord('Reading Eggs', 'Reading', 1),
    ]
    const handlers: BatchScanHandlers = {
      scanOne: async (_file, i) => records[i],
      syncOne: store.syncOne,
    }

    const summary = await processScanBatch(files, handlers)

    expect(store.configs).toHaveLength(2)
    expect(summary.createdCount).toBe(2)
    expect(summary.mergedConfigs).toBe(0)
    expect(summary.outcomes.map((o) => o.status)).toEqual(['created', 'created'])
    expect(summary.message).toContain('Added GATB Math → L12')
    expect(summary.message).toContain('Added Reading Eggs → L1')
  })

  it('(c) a mid-batch scan error does not abort the rest; the summary reports it', async () => {
    const store = makeFakeStore()
    const files = [new File([], 'p1.jpg'), new File([], 'p2.jpg'), new File([], 'p3.jpg')]
    const records = [worksheetRecord('GATB Math', 'Math', 5), null, worksheetRecord('GATB Math', 'Math', 7)]
    const scanOne = vi.fn(async (_file: File, i: number) => {
      if (i === 1) throw new Error('rate limited')
      return records[i]
    })
    const handlers: BatchScanHandlers = { scanOne, syncOne: store.syncOne }

    const summary = await processScanBatch(files, handlers)

    // All three pages were attempted (loop never aborts).
    expect(scanOne).toHaveBeenCalledTimes(3)
    // The two good pages still merged into one config.
    expect(store.configs).toHaveLength(1)
    expect(store.configs[0].position).toBe(7)
    expect(summary.failedCount).toBe(1)
    expect(summary.message).toContain('1 page failed')
    expect(summary.message).toContain('GATB Math')
  })

  it('processes strictly sequentially — page N+1 starts only after page N applies', async () => {
    const order: string[] = []
    const files = [new File([], 'p1.jpg'), new File([], 'p2.jpg')]
    const records = [worksheetRecord('GATB Math', 'Math', 1), worksheetRecord('GATB Math', 'Math', 2)]
    const handlers: BatchScanHandlers = {
      scanOne: async (_file, i) => {
        order.push(`scan-${i}`)
        return records[i]
      },
      syncOne: async (results) => {
        const lesson =
          'curriculumDetected' in results ? results.curriculumDetected?.lessonNumber : null
        order.push(`sync-${lesson}`)
        return { action: 'updated', configId: 'cfg-1', configName: 'GATB Math', position: lesson ?? 0 }
      },
    }

    await processScanBatch(files, handlers)

    expect(order).toEqual(['scan-0', 'sync-1', 'scan-1', 'sync-2'])
  })
})

describe('summarizeScanBatch', () => {
  it('reports the combined created / merged / failed shape', () => {
    const outcomes: PageOutcome[] = [
      { index: 0, status: 'updated', configId: 'a', configName: 'GATB Math', position: 34 },
      { index: 1, status: 'created', configId: 'b', configName: 'Reading Eggs', position: 1 },
      { index: 2, status: 'updated', configId: 'a', configName: 'GATB Math', position: 34 },
      { index: 3, status: 'failed', error: 'boom' },
    ]
    const summary = summarizeScanBatch(outcomes)
    expect(summary.message).toBe(
      'Updated GATB Math → L34; 2 pages merged into GATB Math; Added Reading Eggs → L1; 1 page failed',
    )
    expect(summary.mergedConfigs).toBe(1)
    expect(summary.failedCount).toBe(1)
    // Third page (2nd on config a) is re-labelled merged.
    expect(summary.outcomes[2].status).toBe('merged')
  })

  it('notes skipped (non-workbook) pages', () => {
    const summary = summarizeScanBatch([{ index: 0, status: 'skipped' }])
    expect(summary.message).toBe('1 page not recognized')
    expect(summary.skippedCount).toBe(1)
  })

  it('falls back to a friendly message when there is nothing to report', () => {
    expect(summarizeScanBatch([]).message).toBe('No workbook pages recognized')
  })
})
