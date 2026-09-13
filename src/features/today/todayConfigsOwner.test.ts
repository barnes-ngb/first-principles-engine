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

describe('every writeCaptureRow call site tells identical rows apart', () => {
  it('TodayPage\'s pre-completion scan passes the hint the capture paths pass', () => {
    // Apply retains a completed row and appends a fresh one with the same label
    // and subject, so both carry the same `checklistItemKey`. Without the hint,
    // `resolveCaptureRowIndex` falls back to the first match and stamps
    // `scanned: true` on the older completed twin rather than on the row whose
    // page was just scanned.
    const call = TODAY_PAGE.slice(
      TODAY_PAGE.indexOf("context: 'today-pre-completion-scan'") - 800,
      TODAY_PAGE.indexOf("context: 'today-pre-completion-scan'"),
    )
    expect(call).toMatch(/hint: \{ index, completed: !!item\.completed \}/)
  })

  it('no writeCaptureRow call site is left without one', () => {
    // Stated as a property rather than as a case: a new door that forgets the
    // hint is the same defect again, on a row shape that really exists.
    const CAPTURE_HOOK = readFileSync(
      join(process.cwd(), 'src/features/today/useUnifiedCapture.ts'),
      'utf8',
    )
    for (const source of [TODAY_PAGE, CAPTURE_HOOK]) {
      const calls = source.match(/writeCaptureRow\(\{[\s\S]*?\n {6}\}\)/g) ?? []
      for (const call of calls) expect(call).toMatch(/hint:/)
    }
  })
})
