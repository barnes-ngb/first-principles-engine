import { describe, expect, it, vi } from 'vitest'

import {
  failedPageIndexes,
  failureReason,
  processScanBatch,
  summarizeScanBatch,
} from './multiPageScan'
import type { BatchScanHandlers, PageOutcome } from './multiPageScan'
import type { ScanConfigResult } from '../../core/hooks/useScanToActivityConfig'
import type { ScanRecord } from '../../core/types'

/**
 * UX-275 — a batch collected a reason for every failed page and then summarised
 * it away, so the parent read "2 pages failed" and had nothing to act on. These
 * pin the reason to the summary and the failed pages to the retry set.
 */

function failed(index: number, error?: string): PageOutcome {
  return { index, status: 'failed', ...(error ? { error } : {}) }
}

const UNSUPPORTED = "Can't read this picture — it's a HEIC file, and the scanner needs a JPEG."

describe('summarizeScanBatch — the failure keeps its reason', () => {
  it('names the reason beside the count', () => {
    const s = summarizeScanBatch([failed(0, UNSUPPORTED), failed(1, UNSUPPORTED)])
    expect(s.failedCount).toBe(2)
    expect(s.message).toContain('2 pages failed')
    expect(s.message).toContain('HEIC')
  })

  it('says a reason once, however many pages gave it', () => {
    const s = summarizeScanBatch([0, 1, 2, 3].map((i) => failed(i, UNSUPPORTED)))
    expect(s.message.match(/HEIC/g)).toHaveLength(1)
  })

  it('carries two distinct reasons, and no more', () => {
    const s = summarizeScanBatch([
      failed(0, 'unsupported format'),
      failed(1, 'AI service unavailable'),
      failed(2, 'a third thing entirely'),
    ])
    expect(s.message).toContain('unsupported format')
    expect(s.message).toContain('AI service unavailable')
    expect(s.message).not.toContain('a third thing entirely')
  })

  it('falls back to the bare count rather than a dangling dash', () => {
    const s = summarizeScanBatch([failed(0), failed(1)])
    expect(s.message).toBe('2 pages failed')
  })

  it('clamps a very long reason instead of filling the screen', () => {
    const s = summarizeScanBatch([failed(0, 'x'.repeat(400))])
    expect(s.message.length).toBeLessThan(200)
    expect(s.message).toContain('…')
  })

  it('leaves a clean batch unchanged', () => {
    const s = summarizeScanBatch([
      { index: 0, status: 'created', configId: 'c1', configName: 'GATB Math', position: 12 },
    ])
    expect(s.message).toBe('Added GATB Math → L12')
    expect(failureReason(s.outcomes)).toBeNull()
  })
})

describe('failedPageIndexes — which photos are worth keeping', () => {
  it('returns only the pages that failed, by staging index', () => {
    const s = summarizeScanBatch([
      { index: 0, status: 'created', configId: 'c1', configName: 'GATB Math', position: 4 },
      failed(1, UNSUPPORTED),
      { index: 2, status: 'skipped' },
      failed(3, UNSUPPORTED),
    ])
    expect(failedPageIndexes(s)).toEqual([1, 3])
  })

  it('keeps nothing when every page landed', () => {
    const s = summarizeScanBatch([
      { index: 0, status: 'created', configId: 'c1', configName: 'A', position: 1 },
    ])
    expect(failedPageIndexes(s)).toEqual([])
  })
})

describe('processScanBatch — a thrown reason reaches the page outcome', () => {
  const file = (n: string) => new File(['x'], n, { type: 'image/jpeg' })

  it('records the reason a scan handler threw, and keeps going', async () => {
    const handlers: BatchScanHandlers = {
      scanOne: vi.fn(async (_f: File, i: number): Promise<ScanRecord | null> => {
        if (i === 0) throw new Error(UNSUPPORTED)
        return {
          childId: 'lincoln',
          imageUrl: '',
          storagePath: '',
          results: {
            pageType: 'worksheet',
            subject: 'math',
            specificTopic: '',
            skillsTargeted: [],
            estimatedDifficulty: 'appropriate',
            recommendation: 'do',
            recommendationReason: '',
            estimatedMinutes: 30,
            teacherNotes: '',
            curriculumDetected: {
              provider: 'gatb',
              name: 'GATB Math',
              lessonNumber: 9,
              pageNumber: null,
              levelDesignation: null,
            },
          },
          action: 'pending',
        }
      }),
      syncOne: async (): Promise<ScanConfigResult> => ({
        action: 'updated',
        configId: 'c1',
        configName: 'GATB Math',
        position: 9,
      }),
    }

    const summary = await processScanBatch([file('a.heic'), file('b.jpg')], handlers)

    expect(summary.failedCount).toBe(1)
    expect(summary.outcomes[0].error).toBe(UNSUPPORTED)
    expect(summary.message).toContain('HEIC')
    // The good page still landed — one bad photo never aborts the batch.
    expect(summary.message).toContain('GATB Math')
    expect(handlers.scanOne).toHaveBeenCalledTimes(2)
  })
})
