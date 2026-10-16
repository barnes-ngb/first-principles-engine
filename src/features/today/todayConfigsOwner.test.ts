import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveTodayRow, TodayRowConfigsState, TodayRowKind } from './todayRowKind'
import type { TodayRowConfigLike } from './todayRowKind'
import type { ChecklistItem } from '../../core/types'
import { ActivityType, SubjectBucket } from '../../core/types/enums'

/**
 * UX-363 / Codex round 2 (P1) — the previous child's curriculum is not a settled
 * answer about this one.
 *
 * `useActivityConfigs` never resets `configs` / `loading` when `childId` changes:
 * the subscribe effect re-runs, but until its snapshot arrives the hook still
 * reports the **previous** child's list with `loading === false`. Handing that to
 * `TodayChecklist` as settled meant a similarly named row resolved to the old
 * child's workbook — and `syncScanToConfig` loads a `targetConfigId` by id
 * **without checking `childId`**, so a capture would have advanced the other
 * boy's lesson count.
 *
 * Two halves, both asserted: the hook now stamps its state with the child it
 * describes, and `TodayPage` treats a mismatch as unsettled AND withholds the
 * list itself — `configsLoading` alone would still let the wrong child's array
 * reach `findWorkbookConfigId`, `findStrandConfigId` and `useUnifiedCapture`.
 */

const TODAY_PAGE = readFileSync(
  join(process.cwd(), 'src/features/today/TodayPage.tsx'),
  'utf8',
)
const HOOK = readFileSync(
  join(process.cwd(), 'src/core/hooks/useActivityConfigs.ts'),
  'utf8',
)

describe('useActivityConfigs stamps the child its state describes', () => {
  it('exposes `configsChildId` on its result', () => {
    expect(HOOK).toMatch(/configsChildId: string \| null/)
  })

  it('stamps it on BOTH the snapshot and the error path', () => {
    // A failed read is still an answer about this child; without the stamp there
    // a consumer could not tell it from the previous child's success.
    const stamps = HOOK.match(/setConfigsChildId\(childId\)/g) ?? []
    expect(stamps.length).toBe(2)
  })

  it('CLEARS the list on the error path rather than relabelling the old one', () => {
    // Codex round 1 on `FIX-235` (P2): stamping alone said "this describes the
    // new child" over the PREVIOUS child's array, and the stamp is what
    // `TodayPage` reads to decide the list is settled enough to hand on — so
    // `TodayChecklist`'s direct consumers, which see no error flag
    // (`findStrandConfigId`, the workbook lookups), drove buttons and targeting
    // off the sibling's curriculum after a failed switch. Unlike the loading
    // path there is no snapshot coming to replace it.
    const errorHandler = HOOK.slice(
      HOOK.indexOf("console.error('[ActivityConfigs] Snapshot error:'"),
      HOOK.indexOf('setConfigsChildId(childId)', HOOK.indexOf('Snapshot error')),
    )
    expect(errorHandler).toMatch(/configsRef\.current = \[\]/)
    expect(errorHandler).toMatch(/setConfigs\(\[\]\)/)
  })

  it('does NOT clear on a plain child change — that would flash four other surfaces empty', () => {
    // The exception is the error path and only the error path; the loading path
    // is answered by the stamp, which is what `configsChildId` exists for.
    const setEmpty = HOOK.match(/setConfigs\(\[\]\)/g) ?? []
    expect(setEmpty.length).toBe(1)
  })

  it('returns it, so a consumer can compare against the child on screen', () => {
    expect(HOOK).toMatch(/\n {4}configsChildId,\n/)
  })
})

describe('TodayPage withholds a list that describes another child', () => {
  it('derives settledness by comparing the stamp against the selected child', () => {
    expect(TODAY_PAGE).toMatch(
      /const activityConfigsSettled = activityConfigsChildId === selectedChildId/,
    )
  })

  it('hands DOWN an empty list while unsettled, not the previous child’s', () => {
    expect(TODAY_PAGE).toMatch(
      /const activityConfigs = activityConfigsSettled \? rawActivityConfigs : EMPTY_ACTIVITY_CONFIGS/,
    )
  })

  it('reports unsettled as loading, so the row claims nothing meanwhile', () => {
    expect(TODAY_PAGE).toMatch(
      /const activityConfigsLoading = rawActivityConfigsLoading \|\| !activityConfigsSettled/,
    )
  })

  it('passes the gated list to the capture hook AND the checklist', () => {
    // `useUnifiedCapture` is what turns a config id into a `targetConfigId`, so a
    // gate that only reached the renderer would not close the write path.
    expect(TODAY_PAGE).toMatch(/configs: activityConfigs,/)
    expect(TODAY_PAGE).toMatch(/configs=\{activityConfigs\}/)
  })

  it('the raw list is named in exactly two places — where it is read and gated', () => {
    // Anything more is a consumer reading around the gate. `\b` keeps
    // `rawActivityConfigsLoading`, a different identifier, out of the count.
    const uses = TODAY_PAGE.match(/rawActivityConfigs\b/g) ?? []
    expect(uses.length).toBe(2)
  })

  it('the empty list is a stable reference, so deps do not churn', () => {
    expect(TODAY_PAGE).toMatch(/^const EMPTY_ACTIVITY_CONFIGS: ActivityConfig\[\] = \[\]$/m)
  })
})

describe('the effect of that gate on what a row claims', () => {
  const otherChildsConfigs: TodayRowConfigLike[] = [
    {
      id: 'wb-lincoln', name: 'Math K', type: ActivityType.Workbook,
      scannable: true, subjectBucket: SubjectBucket.Math, currentPosition: 35,
    },
  ]
  const row: ChecklistItem = {
    label: 'Math K (20m)',
    completed: false,
    subjectBucket: SubjectBucket.Math,
  }

  it('is a positive control: with that list settled, the row DOES claim it', () => {
    const resolved = resolveTodayRow(row, otherChildsConfigs)
    expect(resolved.kind).toBe(TodayRowKind.Workbook)
    expect(resolved.configId).toBe('wb-lincoln')
  })

  it('and with the gate applied — empty list, unsettled — it claims nothing', () => {
    const resolved = resolveTodayRow(row, [], TodayRowConfigsState.Loading)
    expect(resolved.kind).toBe(TodayRowKind.Unresolved)
    expect(resolved.configId).toBeNull()
  })
})

// ── Codex round 2 (P2): every row write passes the duplicate-row hint ───────

describe('every writeChecklistRow call site tells identical rows apart', () => {
  /**
   * This case used to pin the hint on TodayPage's `today-pre-completion-scan`
   * write. That door is gone — the before-work check is prospective and stamps
   * nothing on the row it was pressed from — so the hint question no longer
   * arises for it and the old assertion would have gone green on a slice of the
   * end of the file. What replaces it is the property that made the hint
   * unnecessary: this page's before-work path writes no row at all. The hint
   * control over the writes that DO exist is the case below, unchanged.
   */
  it('the before-work door writes no row — so there is no hint to pass', () => {
    expect(TODAY_PAGE).not.toContain("context: 'today-pre-completion-scan'")

    // Bounded by name, and both bounds asserted: a `-1` from `indexOf` is what
    // let the superseded assertion read the wrong 800 characters.
    const start = TODAY_PAGE.indexOf('const handleBeforeWorkPageCheck = useCallback(')
    const end = TODAY_PAGE.indexOf('const handlePageCheckPick = useCallback(', start)
    expect(start, 'TodayPage no longer defines handleBeforeWorkPageCheck').toBeGreaterThan(-1)
    expect(end, 'handlePageCheckPick no longer follows it').toBeGreaterThan(start)
    const handler = TODAY_PAGE.slice(start, end)

    // All it does is open the sheet with the row's label as prompt context.
    expect(handler).toContain('openPageCheck({')
    expect(handler).toMatch(/itemLabel: item\.label/)
    expect(handler).not.toMatch(
      /writeChecklistRow|Guarded\(|setDoc\(|updateDoc\(|addDoc\(|setPreCompletionTarget/,
    )
  })

  it('and the only row write left on this page is the accept-skip lane', () => {
    // The count is the guard: a new door that writes a checklist row shows up
    // here before it shows up in the record, and the case above cannot be
    // satisfied by moving the old write a few lines down.
    const contexts = TODAY_PAGE.match(/context: '[^']+'/g) ?? []
    expect(contexts).toEqual(["context: 'today-accept-skip'"])
  })

  it('no writeChecklistRow call site is left without one', () => {
    // Stated as a property rather than as a case: a new door that forgets the
    // hint is the same defect again, on a row shape that really exists.
    const CAPTURE_HOOK = readFileSync(
      join(process.cwd(), 'src/features/today/useUnifiedCapture.ts'),
      'utf8',
    )
    // The closing brace is matched at ANY indentation. Pinned to six spaces it
    // silently skipped TodayPage's own remaining call site, which sits two
    // levels deeper — a property test that quietly covers nothing is the
    // failure this file keeps running into.
    let checked = 0
    for (const source of [TODAY_PAGE, CAPTURE_HOOK]) {
      const calls = source.match(/writeChecklistRow\(\{[\s\S]*?\n\s*\}\)/g) ?? []
      for (const call of calls) expect(call).toMatch(/hint:/)
      checked += calls.length
    }
    // …so the sweep is asserted to have found the call sites at all.
    expect(checked).toBeGreaterThanOrEqual(2)
  })
})
