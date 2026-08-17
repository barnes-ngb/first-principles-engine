// ── The two-tap next-week flow (FEAT-150) ────────────────────────────────────
//
// One tap generates, a second tap writes. That split is the feature's central
// rail, and it lives here rather than in the confirm-card UI, because a rail
// enforced by a component is a rail one new call site away from being absent.
//
// The shape it takes: the first tap is an ordinary `ChatAction`
// (`draftNextWeek`) going through the ordinary confirm path, whose "write" is
// this hook's {@link useNextWeekDraft} `generateNextWeek`. The second tap is NOT
// an action at all — it acts on state this hook owns, produced from a draft that
// already exists. The model can emit the first and has no vocabulary for the
// second, so no reply, however it is phrased, can reach a week write in one tap.
//
// The state machine is deliberately small and one-draft-at-a-time. A second
// "draft next week" replaces the first, because two drafts of the same week on
// screen is two apply buttons for one week, and whichever the parent taps
// second silently doubles the plan.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { DraftWeeklyPlan, SkillSnapshot } from '../../core/types'
import type { ApplyWorkbookConfig } from '../planner-chat/applyWeekPlan'
import { generateNextWeekDraft, type PlanChatFn } from './generateNextWeekDraft'
import {
  formatNextWeekLabel,
  NEXT_WEEK_NOTICES,
  nextWeekDayKeys,
  partialApplyNotice,
  resolveDraftNextWeek,
  type DraftNextWeekAction,
  type NextWeekDay,
} from './nextWeekActions'
import { writeNextWeekDraft } from './writeNextWeekDraft'

export type NextWeekPhase =
  | 'idle'
  /** A generation is in flight. The confirm card reads as "applying". */
  | 'generating'
  /** A draft is on screen, awaiting the SECOND tap. */
  | 'ready'
  | 'applying'
  | 'applied'
  /** Generation failed, or an apply landed partway. `error` says which. */
  | 'error'

export interface NextWeekDraftView {
  phase: NextWeekPhase
  draft: DraftWeeklyPlan | null
  /**
   * The child this draft was GENERATED for (Codex P1, PR #1679).
   *
   * Not the same thing as the chat's active child, and the difference is a real
   * bug if it is ignored: a parent can draft Lincoln's week, switch to London's
   * tab, and tap Apply. Reading the active child at the write would then put
   * Lincoln's generated routine — built from Lincoln's snapshot, his workbook
   * positions and his priority skills — onto London's days. The draft is bound
   * to the boy it was made for, and the write targets THIS id.
   */
  childId: string
  /** Sunday-start key the draft targets — what the writer re-checks. */
  weekStart: string
  /** "Aug 24–28". What every card says out loud. */
  weekLabel: string
  /** The five weekdays the draft covers, for the day-by-day render. */
  days: NextWeekDay[]
  /** The parent's original words, echoed on the apply card. */
  instructions: string
  /** True when the local planner produced this week because the AI path failed. */
  usedLocalPlanner: boolean
  /** Plain-language failure, or null. Can be set while a draft is still ready. */
  error: string | null
  /** Days actually written, for the applied / partial message. */
  daysWritten: string[]
}

export interface UseNextWeekDraftDeps {
  familyId: string
  activeChildId: string
  children: { id: string }[]
  /** Full activity configs — used for the FEAT-62 workbook join at Apply. */
  activityConfigs: ApplyWorkbookConfig[]
  /** Routine text derived from those configs the planner's way. */
  dailyRoutine: string
  hoursPerDay: number
  snapshot: SkillSnapshot | null
  subjectTimeDefaults?: Record<string, number>
  prioritySkillTags?: string[]
  /** Parent capability. Defaults to false — fail closed. */
  canEdit?: boolean
  chat: PlanChatFn
}

const EMPTY: NextWeekDraftView = {
  phase: 'idle',
  draft: null,
  childId: '',
  weekStart: '',
  weekLabel: '',
  days: [],
  instructions: '',
  usedLocalPlanner: false,
  error: null,
  daysWritten: [],
}

export function useNextWeekDraft(deps: UseNextWeekDraftDeps) {
  const [view, setView] = useState<NextWeekDraftView>(EMPTY)

  // Deps AND the current view are read through refs at tap time rather than
  // captured in closures. Two reasons, both load-bearing:
  //   - `generateNextWeek` is threaded into the action layer, which memoises on
  //     it, so it must keep a stable identity across renders;
  //   - a tap does not require an intervening render, so the value a handler
  //     needs is the latest one, not the one its closure was built with.
  // The same pattern, for the same reasons, as `useShellyChatActions`' refs.
  const depsRef = useRef(deps)
  const viewRef = useRef<NextWeekDraftView>(EMPTY)
  // Synced in an effect rather than during render (the repo's `react-hooks/refs`
  // rule, and the sibling hook's pattern): effects run before any tap can reach
  // these callbacks, so a handler always sees the latest deps. `viewRef` is
  // written by `write` below rather than mirrored here — `write` is the only
  // thing that changes the view, so the ref and the state cannot diverge.
  useEffect(() => {
    depsRef.current = deps
  }, [deps])

  // Guards a second tap on the apply card while the first write is in flight.
  // Applying a week is emphatically NOT idempotent: Apply retains what is
  // already on a day and APPENDS the fresh plan, so a second run gives every day
  // a doubled checklist. State alone cannot hold this line — two taps inside one
  // frame both read the pre-render phase — so the ref is what actually holds it
  // and the phase is what tells the parent.
  const applyingRef = useRef(false)

  const write = useCallback((next: NextWeekDraftView) => {
    viewRef.current = next
    setView(next)
  }, [])

  const dismissNextWeek = useCallback(() => {
    applyingRef.current = false
    write(EMPTY)
  }, [write])

  // A draft is only visible under the tab it was drafted for (Codex P1, PR
  // #1679). The page renders the card unconditionally, so without this a week
  // drafted for Lincoln stays on screen under London's tab — captioned with
  // London's name by the page, offering an Apply for a plan built from Lincoln's
  // snapshot. Even with the write now bound to `view.childId`, leaving it
  // visible would be the card telling the parent something untrue about whose
  // week it is, which is the failure this whole feature is written against.
  //
  // Done as a KEYED READ rather than an effect that clears — the pattern every
  // sibling read in this folder uses (`useChatWeekDays`, `useChatActivityConfigs`,
  // `useChatPlannerDefaults`). No `setState` in an effect, no cascading render,
  // and the switch takes effect on the very render that changes the tab rather
  // than one render later. It also means a draft SURVIVES switching away and
  // back, which is the kinder behaviour: the plan is still that boy's and the
  // writer re-checks the week regardless.
  const visible = view.childId && view.childId !== deps.activeChildId ? EMPTY : view

  /**
   * The FIRST tap. Spends one plan generation and puts a draft on screen.
   *
   * Returns false when nothing was generated, so the confirm card reverts to
   * pending rather than stamping "Done ✓" over a week that does not exist —
   * the run's "no card pretending otherwise" rule.
   */
  const generateNextWeek = useCallback(
    async (action: DraftNextWeekAction): Promise<boolean> => {
      const d = depsRef.current
      const resolution = resolveDraftNextWeek(action, d.canEdit ?? false)
      if (!resolution.ok) {
        write({ ...EMPTY, phase: 'error', error: resolution.notice })
        return false
      }
      // The active-child binding, restated here as well as in the action layer:
      // a week is the largest thing this chat can write, and writing it for the
      // wrong boy is the largest way to get it wrong.
      if (action.childId !== d.activeChildId) {
        write({ ...EMPTY, phase: 'error', error: NEXT_WEEK_NOTICES.noChild })
        return false
      }

      const weekLabel = formatNextWeekLabel(resolution.days)
      write({
        ...EMPTY,
        phase: 'generating',
        childId: action.childId,
        weekStart: resolution.weekStart,
        weekLabel,
        days: resolution.days,
        instructions: action.instructions,
      })

      const result = await generateNextWeekDraft({
        familyId: d.familyId,
        childId: action.childId,
        instructions: action.instructions,
        snapshot: d.snapshot,
        hoursPerDay: d.hoursPerDay,
        dailyRoutine: d.dailyRoutine,
        subjectTimeDefaults: d.subjectTimeDefaults,
        prioritySkillTags: d.prioritySkillTags,
        chat: d.chat,
      })

      if (!result) {
        write({
          ...EMPTY,
          phase: 'error',
          error:
            "I couldn't draft a week just now — nothing was written, and nothing on next week changed. Try again in a moment, or open Plan My Week.",
        })
        return false
      }

      write({
        phase: 'ready',
        draft: result.draft,
        childId: action.childId,
        weekStart: resolution.weekStart,
        weekLabel,
        days: resolution.days,
        instructions: action.instructions,
        usedLocalPlanner: !result.usedAI,
        error: null,
        daysWritten: [],
      })
      return true
    },
    [write],
  )

  /**
   * The SECOND tap. Writes the draft to next week through the shared Apply.
   *
   * The target week is re-resolved against the clock inside
   * {@link writeNextWeekDraft}, so a draft that went stale across a
   * Sunday→Monday rollover is refused there with a reason rather than written
   * over a week the family has already started.
   */
  const applyNextWeek = useCallback(async (): Promise<void> => {
    const d = depsRef.current
    const current = viewRef.current

    if (applyingRef.current) {
      console.warn('[shellyChat] ignored a repeat next-week apply — already in flight')
      return
    }
    if (current.phase !== 'ready' || !current.draft) return

    applyingRef.current = true
    write({ ...current, phase: 'applying', error: null })

    const outcome = await writeNextWeekDraft({
      familyId: d.familyId,
      // The child the draft was GENERATED for, never the tab that happens to be
      // open now (Codex P1, PR #1679). The effect below clears a draft when the
      // context changes, so in practice these agree — but "in practice" is not
      // what a week write should rest on, and this is the value that decides
      // whose days are rewritten.
      childId: current.childId,
      weekStart: current.weekStart,
      draft: current.draft,
      children: d.children,
      activityConfigs: d.activityConfigs,
      canEdit: d.canEdit ?? false,
    })

    if (outcome.status === 'done') {
      // Terminal, and `applyingRef` stays set: the week is written, and a second
      // tap would append the whole plan to it again.
      write({
        ...viewRef.current,
        phase: 'applied',
        error: null,
        daysWritten: outcome.daysWritten,
      })
      return
    }

    if (outcome.status === 'refused') {
      // Nothing was written, so the draft stays reviewable and the guard is
      // released — this is the one outcome a retry can legitimately follow.
      applyingRef.current = false
      write({ ...viewRef.current, phase: 'ready', error: outcome.notice })
      return
    }

    // Partial: some days really landed. The draft does NOT return to 'ready' and
    // the guard stays set — offering "apply" again over a half-written week is
    // exactly how a parent ends up with Monday planned twice. The message names
    // what landed and points at Plan My Week (FEAT-138's honesty rule, at week
    // scale).
    write({
      ...viewRef.current,
      phase: 'error',
      error: partialApplyNotice(outcome.daysWritten, outcome.weekPlanWritten),
      daysWritten: outcome.daysWritten,
    })
  }, [write])

  return {
    nextWeek: visible,
    generateNextWeek,
    applyNextWeek,
    dismissNextWeek,
    /** Recomputed from the clock, for a caller that needs the window itself. */
    nextWeekDays: nextWeekDayKeys,
  }
}
