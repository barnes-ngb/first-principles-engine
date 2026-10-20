import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Fab from '@mui/material/Fab'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'

import ActiveChildLine from '../../components/ActiveChildLine'
import ContextBar from '../../components/ContextBar'
import HelpStrip from '../../components/HelpStrip'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { LoadingState } from '../../components/states'
import { formatDateYmd, parseDateYmd } from '../../core/utils/format'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useActivityConfigs } from '../../core/hooks/useActivityConfigs'
import {
  logStrandSession,
  STRAND_SESSION_FAILED_CLEAN,
  StrandSessionFailure,
  StrandSessionRefused,
} from '../../core/firebase/strandSessionWrites'
import StrandSessionDialog from '../progress/StrandSessionDialog'
import type { StrandSessionEvidence } from '../progress/strandSession'
import { useScrollToHash } from '../../core/hooks/useScrollToHash'
import { useAI, TaskType } from '../../core/ai/useAI'
import {
  chapterBooksCollection,
  scansCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import { useProfile } from '../../core/profile/useProfile'
import type { ActivityConfig, ChapterBook, ChapterQuestionPoolItem, ChecklistItem as ChecklistItemType, CurriculumDetected, DailyPlan, DraftDayPlan, DraftPlanItem, ScanRecord, SkillSnapshot, WatchVideo, WorksheetScanResult } from '../../core/types'
import { effectiveRecommendation, isWorksheetScan } from '../../core/types'
import TeachHelperDialog from '../planner/TeachHelperDialog'
import {
  EnergyLevel,
  PlanType,
  SkipReason,
  SubjectBucket,
} from '../../core/types/enums'
import { getWeekRange } from '../../core/utils/time'
import { weekdayName } from './dayProgressLabels'
import { getTemplateForChild } from './dailyPlanTemplates'
import { buildMaterialsPrompt, openPrintWindow } from '../planner-chat/generateMaterials'
import ChapterQuestionPool from './ChapterQuestionPool'
import { buildChapterPoolItem } from './chapterPool.logic'
import { useBookProgress } from './useBookProgress'
import {
  applyChapterPoolToAll,
  collectExistingChapterPool,
} from './applyChapterPoolForChild'
import DayStatusRow from './DayStatusRow'
import HelperPanel from './HelperPanel'
import KidTodayView from './KidTodayView'
import LifeDayCard from './LifeDayCard'
import MineRecapCard from './MineRecapCard'
import TeachBackSection from './TeachBackSection'
import { useLatestMineSession } from './useLatestMineSession'
import TodayChecklist from './TodayChecklist'
import WatchItemDialog from '../watch/WatchItemDialog'
import WatchLibraryPicker from '../watch/WatchLibraryPicker'
import { useWatchLibrary } from '../watch/useWatchLibrary'
import { useWatchItemCompletion } from '../watch/useWatchItemCompletion'
import { appendWatchItemToDayLog } from '../watch/watchDayItem'
import { checklistItemKey } from './dayWriteGuard'
import { resolvePreCompletionScanIndex, type PreCompletionScanTarget } from './preCompletionScanIdentity'
import {
  liveDayEditLockReason,
  moveItemToLiveDay,
  swapWatchVideoOnLiveDay,
} from './liveDayEdit'
import MoveToDayDialog from './MoveToDayDialog'
import UnifiedCaptureCard from './UnifiedCaptureCard'
import { useDailyPlan } from './useDailyPlan'
import {
  dailyPlanGateNote,
  dailyPlanSaveFailureNotice,
  dailyPlanSaveMovedOnNotice,
  dailyPlanSaveSupersededNotice,
  type DailyPlanSaveOutcome,
} from './dailyPlanGate'
import { useDayLog } from './useDayLog'
import {
  TodayDecision,
  childIdFromScopeKey,
  todayScopeKey,
  todayScopeResetNotice,
} from './todayScope'
import { useRolloverUnchecked } from './useRolloverUnchecked'
import { useUnappliedDraft } from './useUnappliedDraft'
import { selectTodayDayBanner } from './unappliedDraft'
import { useUnifiedCapture } from './useUnifiedCapture'
import { useTodayArtifacts } from './useTodayArtifacts'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'
import DraftReadyCard from '../monthly-review/DraftReadyCard'
import { skipRowWriteNotice, writeChecklistRow } from './dayChecklistRowWrite'
import { todayRowConfigsState } from './todayRowKind'
import BeforeWorkPageCheckCard from './BeforeWorkPageCheckCard'
import BeforeWorkPageCheckDialog from './BeforeWorkPageCheckDialog'
import { useBeforeWorkPageCheck } from './useBeforeWorkPageCheck'
import WeekFocusCard from './WeekFocusCard'
import WeekRibbon from './WeekRibbon'
import { ribbonWeekStart } from './weekRibbon.logic'
import WorkshopGameCards from './WorkshopGameCards'

/** Stable empty list, so gating on it does not churn every consumer's deps. */
const EMPTY_ACTIVITY_CONFIGS: ActivityConfig[] = []

export default function TodayPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const initialDate = useMemo(() => {
    if (dateParam && parseDateYmd(dateParam)) return dateParam
    return formatDateYmd(new Date())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const today = selectedDate
  const realToday = useMemo(() => formatDateYmd(new Date()), [])
  const isToday = selectedDate === realToday

  // Hero Hub mission CTAs deep-link /today#conundrum and /today#chapter; scroll
  // to those cards once they render (they depend on async weekFocus/bookProgress).
  useScrollToHash()

  const handlePrevDay = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(prev + 'T00:00:00')
      d.setDate(d.getDate() - 1)
      return formatDateYmd(d)
    })
  }, [])

  const handleNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(prev + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      return formatDateYmd(d)
    })
  }, [])

  const handleGoToToday = useCallback(() => {
    setSelectedDate(formatDateYmd(new Date()))
  }, [])

  const selectedDayName = useMemo(
    () =>
      new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
    [selectedDate],
  )

  // UX-28: the page heading names the day being viewed. It read "Today" over a
  // banner saying "Viewing Monday, Aug 10 (past)"; the checklist card's title
  // is guarded the same way (`dayPlanTitle`), so the two never disagree.
  const pageHeading = isToday ? 'Today' : (weekdayName(selectedDate) ?? 'Day Plan')

  // Compute Mon-Fri dates for the week containing selectedDate
  const weekDayDates = useMemo(() => {
    const parsed = new Date(selectedDate + 'T00:00:00')
    const range = getWeekRange(parsed, 1)
    const monday = new Date(range.start + 'T00:00:00')
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
    return labels.map((label, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return { label, dateKey: formatDateYmd(d) }
    })
  }, [selectedDate])

  const familyId = useFamilyId()
  /**
   * UX-358 — the two capability questions this page asks have ONE answer each,
   * and it is not written here.
   *
   * This page used to compute both itself: `isKidProfile` was
   * `profile === UserProfile.Lincoln || profile === UserProfile.London`, a
   * hand-written member list identical to `useActiveChild().isChildProfile`,
   * which it was already calling on the very next line; `canEditLiveDay` was
   * `profile === UserProfile.Parents`, a hand-written copy of `useProfile()`'s
   * own `canEdit`. Three definitions of two boundaries, on the page that writes
   * nine collections — and adding a third child profile would have silently
   * handed him the parent surface, edit mode included.
   *
   * This repo's standing rule (`resolveDailyBudget`, `SECTION_FOR_TYPE`,
   * `DAY_TYPE_SHAPE`) is **never hand-write the member list**. Reading the two
   * canonical answers changes no behaviour for any of the three profiles that
   * exist — including an unselected one, where `canEdit` and `isChildProfile`
   * are both false exactly as the literals were — and it means a fourth profile
   * is a decision made once.
   */
  const { canEdit } = useProfile()
  // UX-425: no `setActiveChildId` / `addChild` / `isLoading` here any more —
  // the page no longer offers a way to choose or add a child. It reads the
  // active one; the shell's chip is what changes it.
  const {
    children,
    activeChildId: selectedChildId,
    activeChild,
    isChildProfile: isKidProfile,
  } = useActiveChild()
  const artifactSectionRef = useRef<HTMLDivElement>(null)

  // FEAT-62 (legacy-item fallback): scannable workbook configs let unstamped items
  // resolve their workbook by name/subject match for routed capture + backfill.
  const {
    configs: rawActivityConfigs,
    loading: rawActivityConfigsLoading,
    error: activityConfigsError,
    configsChildId: activityConfigsChildId,
  } = useActivityConfigs(selectedChildId)
  // UX-363, Codex round 2 (P1): the hook does not reset `configs` / `loading`
  // when the child changes, so between a switch and the next snapshot they still
  // describe the PREVIOUS child. Treating that as settled let a similarly named
  // row resolve to the old child's workbook — and `syncScanToConfig` loads a
  // `targetConfigId` by id without checking `childId`, so a capture would have
  // advanced the other boy's lesson count. Until the hook's state is stamped with
  // the child on screen it is an unsettled read, and the list handed to the
  // checklist and to the capture hook is EMPTY rather than the wrong child's:
  // `configsLoading` alone would still leave the raw array reaching
  // `findWorkbookConfigId` and `findStrandConfigId`.
  const activityConfigsSettled = activityConfigsChildId === selectedChildId
  const activityConfigs = activityConfigsSettled ? rawActivityConfigs : EMPTY_ACTIVITY_CONFIGS
  const activityConfigsLoading = rawActivityConfigsLoading || !activityConfigsSettled
  // UX-403: the page, the checklist and the capture hook all resolve a row
  // against this one state. `todayRowConfigsState` owns the precedence (a failed
  // read is not still loading) so a third surface cannot get it backwards.
  const activityConfigsState = todayRowConfigsState(
    activityConfigsLoading,
    !!activityConfigsError,
  )

  const [strandSessionId, setStrandSessionId] = useState<string | null>(null)
  const [strandSessionSaving, setStrandSessionSaving] = useState(false)
  const [strandSessionError, setStrandSessionError] = useState<string | null>(null)
  const [energy, setEnergy] = useState<EnergyLevel>(EnergyLevel.Normal)
  const [planType, setPlanType] = useState<PlanType>(PlanType.Normal)
  const [teachHelperItem, setTeachHelperItem] = useState<ChecklistItemType | null>(null)
  const [teachHelperOpen, setTeachHelperOpen] = useState(false)
  const [printingMaterials, setPrintingMaterials] = useState(false)
  const [todaySnapshot, setTodaySnapshot] = useState<SkillSnapshot | null>(null)

  const selectableChildren = children
  const selectedChild = activeChild

  // Resolve the active template and routine items for the selected child.
  // Priority: child.routineItems (Firestore) → template.routineItems → undefined (all).
  const activeTemplate = useMemo(
    () => (selectedChild ? getTemplateForChild(selectedChild.name) : undefined),
    [selectedChild],
  )
  const activeRoutineItems = useMemo(
    () => selectedChild?.routineItems ?? activeTemplate?.routineItems,
    [selectedChild?.routineItems, activeTemplate?.routineItems],
  )

  const {
    dayLog,
    saveState,
    weekPlanId,
    weekFocus,
    readAloudBookId,
    snackMessage,
    setSnackMessage,
    persistDayLogImmediate,
  } = useDayLog({
    familyId,
    selectedChildId,
    today,
    selectedChild,
    activeTemplate,
    activeRoutineItems,
  })

  // Watch Vehicle (FEAT-104): resolve the videos this child's plan already
  // references + the shared completion (credit hours + artifact, no XP/concept).
  // Parent surface.
  //
  // Deliberately the UNSCOPED library (FEAT-129) — see `KidTodayView` for the
  // reasoning: D7 scope decides what may be *planned*, never what a planned item
  // may *resolve*, or re-scoping an entry in the library editor would strand an
  // already-planned item.
  const { videos: watchVideos, loading: watchLoading, error: watchError } = useWatchLibrary()
  // FEAT-132: adding a video to the LIVE day. Separate subscription from the
  // resolution one above, and deliberately SCOPED to the child (D7) — scope
  // decides what may be *planned*, so the picker sees only in-scope videos while
  // resolution above stays unscoped so an already-planned item never strands.
  const {
    videos: scopedWatchVideos,
    loading: scopedWatchLoading,
    error: scopedWatchError,
    addVideo: addWatchVideo,
  } = useWatchLibrary(selectedChildId)
  const [watchPickerOpen, setWatchPickerOpen] = useState(false)
  const watch = useWatchItemCompletion({
    familyId,
    childId: selectedChildId,
    dayLog,
    persistDayLogImmediate,
    videos: watchVideos,
    dayLogId: today,
  })

  /**
   * FEAT-132: put a vetted video on the live day. Writes a REAL watch row —
   * `itemType: 'watch'` + `watchVideoId`, built by the shared `watchDayItem`
   * builder so it is indistinguishable from a planned one to the player, the
   * completion path, and the hours math. A free-text "Watch: …" row would carry
   * no video for the player to resolve.
   *
   * Purely additive to the checklist and routed through the same canonical
   * `persistDayLogImmediate` lane every other Today edit uses, so no completion,
   * logged minute, or evidence link can be disturbed. Writes no XP and no
   * learner-model state — adding a row is not watching it.
   */
  const handleAddWatchToDay = useCallback(
    (video: WatchVideo) => {
      setWatchPickerOpen(false)
      if (!dayLog) return
      persistDayLogImmediate(appendWatchItemToDayLog(dayLog, video))
    },
    [dayLog, persistDayLogImmediate],
  )

  // ── Live-day structural edits (FEAT-138) ───────────────────────────────────
  //
  // Move and swap for today's rows (remove already lived in `TodayChecklist`).
  // Both are parent capability, checked HERE as well as by withholding the
  // affordance — kids render `KidTodayView`, which has no edit mode, but the
  // guard does not assume the surface is the only gate.
  //
  // Move is the one that can't use `persistDayLogImmediate`: the target day is a
  // DIFFERENT document, so it goes through `liveDayEdit.moveItemToLiveDay`
  // (append-to-target then remove-from-source, both via the preservation guard).
  // Today's own `onSnapshot` brings the source-day change back into view.
  // UX-358 — `useProfile().canEdit`, the one definition, not a second copy of
  // its expression. See the note where it is read.
  const canEditLiveDay = canEdit
  const [moveTargetIndex, setMoveTargetIndex] = useState<number | null>(null)
  const [swapTargetIndex, setSwapTargetIndex] = useState<number | null>(null)

  // ── UX-343: a change of child or day closes what was open, and says so ─────
  //
  // Every dialog on this page writes with the LIVE `selectedChildId` and the
  // LIVE date, and every one of them outlives the tap that opened it. A strand
  // session captured for one boy could be incremented onto the other's strand; a
  // move target picked from one child's checklist resolves, on confirm, to
  // whatever row now sits at that index in the other's. That is the owner's own
  // report — *"Shelly added content for Lincoln on London's page"* — as a race
  // rather than a typo, and it is reachable today through this page's own
  // `ChildSelector`, with the app-bar switcher still off (`UX-330`).
  //
  // The census verdict is RESET: the work is cheap to redo and expensive to get
  // wrong. RESET's second half is *make the loss visible*, so the decisions that
  // were open are named. `TodayChecklist` reports its own four up through
  // `onOpenDecisionsChange`, because the `key` below clears them by remounting
  // and a remount cannot speak for itself.
  //
  // State-during-render, matching `useDayLog`'s own guard: an effect would leave
  // one render in which a stale dialog is still on screen over the new child,
  // which is the exact window this closes.
  const scopeKey = todayScopeKey(selectedChildId, today)
  const checklistOpenRef = useRef<TodayDecision[]>([])
  // Codex round 2 (P1): the chapter pool is mounted OUTSIDE the checklist, so it
  // needs its own key and its own reporting — keying `TodayChecklist` alone left
  // a typed chapter note standing across a child switch, ready to be written
  // onto the newly-selected child's `bookProgress`.
  const chapterOpenRef = useRef<TodayDecision[]>([])
  // Stable, so each card's reporting effect runs when its open SET moves rather
  // than on every render of this page.
  const handleChecklistOpenDecisions = useCallback((open: TodayDecision[]) => {
    checklistOpenRef.current = open
  }, [])
  const handleChapterOpenDecisions = useCallback((open: TodayDecision[]) => {
    chapterOpenRef.current = open
  }, [])
  const [openScopeKey, setOpenScopeKey] = useState(scopeKey)
  if (openScopeKey !== scopeKey) {
    const wasFor = childIdFromScopeKey(openScopeKey)
    const open: TodayDecision[] = [
      ...checklistOpenRef.current,
      ...chapterOpenRef.current,
    ]
    if (strandSessionId !== null) open.push(TodayDecision.StrandSession)
    if (moveTargetIndex !== null) open.push(TodayDecision.MoveItem)
    if (swapTargetIndex !== null) open.push(TodayDecision.SwapVideo)
    if (watchPickerOpen) open.push(TodayDecision.AddVideo)
    // Codex round 3 (P1): two more page-owned dialogs. The watch player's
    // `completeWatch` applies its target's INDEX to the live checklist and
    // writes an artifact and credited minutes for the live child; the teach
    // helper holds the item it was opened for and is handed the live `childId`.
    if (watch.watchTarget !== null) open.push(TodayDecision.WatchVideo)
    if (teachHelperOpen) open.push(TodayDecision.TeachHelper)
    setOpenScopeKey(scopeKey)
    checklistOpenRef.current = []
    chapterOpenRef.current = []
    setStrandSessionId(null)
    setStrandSessionError(null)
    setMoveTargetIndex(null)
    setSwapTargetIndex(null)
    setWatchPickerOpen(false)
    watch.closeWatch()
    setTeachHelperOpen(false)
    setTeachHelperItem(null)
    // Named only when the previous scope was a DIFFERENT child. Paging from
    // Tuesday to Wednesday for the same boy closes the same dialogs and is worth
    // the same sentence, but "Lincoln was selected" would be a strange way to
    // say it, so the nameless variant carries that case.
    const notice = todayScopeResetNotice(
      open,
      wasFor && wasFor !== selectedChildId
        ? (children.find((c) => c.id === wasFor)?.name ?? null)
        : null,
    )
    if (notice) setSnackMessage(notice)
  }

  const handleMoveItemToDay = useCallback(
    (index: number, toDateKey: string) => {
      if (!canEditLiveDay || !dayLog || !selectedChildId) return
      const item = dayLog.checklist?.[index]
      if (!item) return
      void (async () => {
        const outcome = await moveItemToLiveDay({
          canEdit: canEditLiveDay,
          familyId,
          childId: selectedChildId,
          fromDateKey: today,
          toDateKey,
          itemKey: checklistItemKey(item),
        }).catch((err) => {
          console.error('[Today] Failed to move the item to another day', err)
          return null
        })
        if (!outcome) {
          setSnackMessage({ text: "Couldn't move that. It's still on today.", severity: 'error' })
          return
        }
        if (outcome.status === 'refused') {
          setSnackMessage({
            text: liveDayEditLockReason(outcome.refusal, activeChild?.name),
            severity: 'warning',
          })
          return
        }
        if (outcome.status === 'duplicated') {
          // Survivable by design: it reached the other day but is still here.
          setSnackMessage({
            text: "Added to the other day, but it's still on today too — remove it here.",
            severity: 'warning',
          })
          return
        }
        setSnackMessage({ text: 'Moved.', severity: 'success' })
      })()
    },
    [canEditLiveDay, dayLog, selectedChildId, familyId, today, activeChild?.name, setSnackMessage],
  )

  /**
   * Swap the video on a row of the live day.
   *
   * Goes through `liveDayEdit.swapWatchVideoOnLiveDay` rather than the pure
   * transform + `persistDayLogImmediate` (Codex P1 on PR #1658). The difference
   * is not stylistic: `persistDayLogImmediate` writes the WHOLE document from
   * this component's in-memory `dayLog`, on the observe-only (`enforce: false`)
   * manual-edit lane. If a boy completes a row on the other device between this
   * snapshot rendering and the parent choosing a replacement, that write would
   * clobber the completion, its credited minutes and its evidence link — and the
   * local `checklistItemEditLock` check could not see it, because it is reading
   * the same stale snapshot. The writer re-reads the saved document, re-checks
   * the completed-row rule against what is actually there, and enforces
   * preservation. Today's `onSnapshot` brings the result back into view.
   *
   * The planner's swap already used this writer; now both surfaces do.
   */
  const handleSwapWatchOnDay = useCallback(
    (video: WatchVideo) => {
      const index = swapTargetIndex
      setSwapTargetIndex(null)
      if (!canEditLiveDay || index === null || !dayLog || !selectedChildId) return
      const item = dayLog.checklist?.[index]
      if (!item || item.itemType !== 'watch') return
      void (async () => {
        const outcome = await swapWatchVideoOnLiveDay({
          canEdit: canEditLiveDay,
          familyId,
          childId: selectedChildId,
          dateKey: today,
          itemKey: checklistItemKey(item),
          video,
        }).catch((err) => {
          console.error('[Today] Failed to change the video on this row', err)
          return null
        })
        if (!outcome || outcome.status !== 'done') {
          setSnackMessage({
            text:
              outcome?.status === 'refused'
                ? liveDayEditLockReason(outcome.refusal, activeChild?.name)
                : "Couldn't change that video. Try again.",
            severity: outcome?.status === 'refused' ? 'warning' : 'error',
          })
          return
        }
        setSnackMessage({ text: `Now watching “${video.title}”.`, severity: 'success' })
      })()
    },
    [canEditLiveDay, swapTargetIndex, dayLog, selectedChildId, familyId, today, activeChild?.name, setSnackMessage],
  )

  // (Rollover is wired below, after dailyPlan is loaded so MVD/low-energy can halve the budget.)

  // --- Chapter book progress (pool-based read-aloud tracking) ---
  const [selectedBook, setSelectedBook] = useState<ChapterBook | null>(null)

  useEffect(() => {
    if (!readAloudBookId) {
      setSelectedBook(null)
      return
    }
    // One-shot fetch — books don't change mid-session
    const bookRef = doc(chapterBooksCollection(), readAloudBookId)
    getDoc(bookRef).then((snap) => {
      if (snap.exists()) {
        setSelectedBook({ ...snap.data(), id: snap.id })
      } else {
        setSelectedBook(null)
      }
    }).catch((err) => {
      console.error('Failed to fetch chapter book:', err)
      setSelectedBook(null)
    })
  }, [readAloudBookId])

  const {
    bookProgress,
    loading: bookProgressLoading,
    loadFailed: bookProgressFailed,
    updateChapter,
  } = useBookProgress(familyId, selectedChildId, readAloudBookId)

  // UX-355 — `updateChapter` answers a `ChapterSaveOutcome` instead of throwing
  // into nothing, and `ChapterQuestionPool` reads it: the reporting belongs
  // beside the note she typed rather than in a snack at the bottom of a long
  // page, and that component's `catch` blocks were already what kept the note on
  // screen. A wrapper HERE that reported and then resolved normally would have
  // stopped those `catch` blocks running and deleted her note on exactly the
  // failure the reporting was added for (Codex round 1, P1).

  // Load/persist daily plan (energy + planType) to Firestore
  const {
    dailyPlan,
    isEditable: dayPlanEditable,
    isLoading: dayPlanLoading,
    loadFailed: dayPlanReadFailed,
    saveDailyPlan,
  } = useDailyPlan({
    familyId,
    childId: selectedChildId,
    date: today,
  })

  /**
   * Restore energy + planType from the saved dailyPlan on load.
   *
   * UX-345 — the `if (dailyPlan)` guard alone never CLEARED, so on a child
   * change the two values stayed at the previous child's until (and unless) the
   * new child's document supplied replacements. Both ride in every
   * `saveDailyPlan` payload beside `sessions`, so a settled read that finds no
   * plan has to seed the defaults rather than leave his brother's day type
   * standing. Only once the read has SETTLED: a plan absent because the read is
   * still open is not a plan absent.
   */
  useEffect(() => {
    if (dailyPlan) {
      setEnergy(dailyPlan.energy)
      setPlanType(dailyPlan.planType)
      return
    }
    if (!dayPlanLoading && !dayPlanReadFailed) {
      setEnergy(EnergyLevel.Normal)
      setPlanType(PlanType.Normal)
    }
  }, [dailyPlan, dayPlanLoading, dayPlanReadFailed])

  // --- Rollover: carry forward unchecked items from previous school day + enforce daily budget ---
  //
  // UX-356(b) — when yesterday could not be READ, the page says so rather than
  // carrying on as though nothing had been left to carry over. Reported once per
  // child+day, because the rollover itself runs once.
  const handleRolloverReadFailed = useCallback(() => {
    setSnackMessage({
      text: "Couldn't check yesterday for anything to carry over. Nothing was added to today.",
      severity: 'warning',
    })
  }, [setSnackMessage])

  useRolloverUnchecked({
    familyId,
    childId: selectedChildId,
    today,
    dayLog,
    dailyPlan,
    persistDayLogImmediate,
    onReadFailed: handleRolloverReadFailed,
  })

  // --- Unapplied-draft awareness (FEAT-111 P2): does a drafted-but-unapplied
  // plan exist for this week? Drives the actionable "review and apply" banner on
  // empty/upcoming days so Today never shows a silently empty day. ---
  const draftRead = useUnappliedDraft(
    familyId,
    selectedChildId,
    weekDayDates[0]?.dateKey,
  )

  const { todayArtifacts, todayArtifactsFailed, todayArtifactsLoading, setTodayArtifacts, loadTodayArtifacts } =
    useTodayArtifacts(familyId, selectedChildId, today, setSnackMessage)

  // --- Unified capture hook (shared with kid views) ---
  const {
    handleUnifiedCapture,
    handleUnifiedCaptureBatch,
    handleBackfillWorkbookScan,
    scanItemIndex,
    setScanItemIndex,
    scanResult,
    scanLoading,
    scanError,
    clearScan,
    recordScanAction,
    syncScanToConfig,
    // No `runScan` here any more: the before-work door was its only caller on
    // this page, and the prospective check does not use the retrospective
    // pipeline (which persists a `scans` document).
  } = useUnifiedCapture({
    familyId,
    childId: selectedChildId,
    childName: activeChild?.name ?? 'Student',
    today,
    dayLog,
    onMessage: setSnackMessage,
    onArtifactCreated: (artifact) => {
      setTodayArtifacts((prev) => [artifact, ...prev])
    },
    configs: activityConfigs,
    configsState: activityConfigsState,
  })

  /**
   * The retrospective scan-result panel's binding.
   *
   * Nothing sets this target any more: the before-work door that used to set it
   * now runs the prospective check, which binds no row (see
   * `handleBeforeWorkPageCheck` below). It is kept, with the panel and its
   * handlers, because the panel's own writes and their tests are legacy
   * retrospective behaviour this run is not changing — see
   * `docs/review/BEFORE_WORK_PAGE_CHECK.md` § "What is left behind".
   */
  const [preCompletionTarget, setPreCompletionTarget] = useState<PreCompletionScanTarget | null>(null)
  const preCompletionRequestRef = useRef<object | null>(null)
  const scanResultItemIndex = resolvePreCompletionScanIndex(
    preCompletionTarget, { familyId, childId: selectedChildId, dateKey: today }, scanResult?.id, dayLog,
  )

  const { chat: aiChat } = useAI()

  // Parent recap of the child's latest Knowledge Mine session dated today (read-only).
  const { session: latestMineSession } = useLatestMineSession(
    familyId,
    selectedChildId,
    today,
  )

  const handleRetryChapterGen = useCallback(async () => {
    if (!selectedBook || !selectedChildId || !familyId) return
    try {
      setSnackMessage({ text: 'Generating chapter questions...', severity: 'success' })

      // Collect the family's existing pool across EVERY learner (canonical "same
      // questions"), then copy it to every kid — siblings who already have a
      // chapter no-op, kids missing it get the exact item. This backfills London
      // from Lincoln WITHOUT regenerating (FEAT-19).
      const existingMap = await collectExistingChapterPool(familyId, children, selectedBook.id)
      const backfilled = await applyChapterPoolToAll(
        familyId, children, selectedBook, [...existingMap.values()],
      )

      // AI-generate ONLY chapters no kid has yet.
      const missingChapters = selectedBook.chapters?.filter(
        (c) => !existingMap.has(c.number),
      ) ?? []

      if (missingChapters.length === 0) {
        setSnackMessage({
          text: backfilled > 0
            ? `Chapter questions copied for ${selectedBook.title}!`
            : 'Chapter questions already generated.',
          severity: 'success',
        })
        return
      }

      const result = await aiChat({
        familyId,
        childId: selectedChildId,
        taskType: TaskType.ChapterQuestions,
        messages: [{
          role: 'user',
          content: JSON.stringify({
            bookTitle: selectedBook.title,
            author: selectedBook.author,
            chapters: missingChapters,
            childName: activeChild?.name,
            weekTheme: weekFocus?.theme,
            weekVirtue: weekFocus?.virtue,
          }),
        }],
      })

      if (!result?.message) {
        setSnackMessage({ text: "Couldn't generate chapter questions.", severity: 'error' })
        return
      }

      let questions: Array<{ chapter: number; questionType: string; question: string }> = []
      try {
        const parsed = JSON.parse(result.message) as unknown
        questions = Array.isArray(parsed) ? parsed as typeof questions : []
      } catch {
        setSnackMessage({ text: "Couldn't parse chapter questions.", severity: 'error' })
        return
      }

      const newPoolItems: ChapterQuestionPoolItem[] = questions
        .map((q) =>
          buildChapterPoolItem(q, selectedBook.chapters?.find((c) => c.number === q.chapter)?.title),
        )
        .filter((item): item is ChapterQuestionPoolItem => item !== null)

      // The read-aloud is a family book: write the SAME newly-generated pool to
      // every learner so each kid (Lincoln + London) gets the questions on their
      // Today and records their own answers (FEAT-17). Deduped by chapter.
      await applyChapterPoolToAll(familyId, children, selectedBook, newPoolItems)

      setSnackMessage({ text: `Chapter questions ready for ${selectedBook.title}!`, severity: 'success' })
    } catch (err) {
      console.error('Failed to retry chapter question generation', err)
      setSnackMessage({ text: "Couldn't generate chapter questions.", severity: 'error' })
    }
  }, [selectedBook, selectedChildId, familyId, activeChild, weekFocus, aiChat, setSnackMessage, children])

  // Default activity configs (routine, formation, workbooks) are seeded by the
  // `useActivityConfigs(selectedChildId)` mounted above — this page used to ALSO
  // call `ensureDefaultActivityConfigs` here, with the same familyId and the same
  // child, which made Today a second seed path on top of the hook's (UX-231).
  // The seeder is idempotent now, so a duplicate call is merely wasted; it is
  // gone because the fewest call paths is the point.

  // Load skill snapshot for print materials
  useEffect(() => {
    if (!selectedChildId) return
    const ref = doc(skillSnapshotsCollection(familyId), selectedChildId)
    getDoc(ref).then((snap) => {
      if (snap.exists()) setTodaySnapshot(snap.data() as SkillSnapshot)
    }).catch(() => { /* ignore */ })
  }, [familyId, selectedChildId])

  // Load recent scan feedback for today's checklist items
  const scanScope = JSON.stringify([familyId, selectedChildId])
  const [feedbackRead, setFeedbackRead] = useState<{
    scope: string; visit: number; attempt: number; status: 'loading' | 'ready' | 'unavailable'
    data: Record<string, { topic: string; recommendation: 'do' | 'skip' | 'quick-review' | 'modify'; estimatedMinutes?: number }>
  }>({ scope: scanScope, visit: 0, attempt: 0, status: 'loading', data: {} })
  if (feedbackRead.scope !== scanScope) {
    setFeedbackRead({ scope: scanScope, visit: feedbackRead.visit + 1, attempt: 0, status: 'loading', data: {} })
  }
  const feedbackVisit = feedbackRead.visit
  const feedbackAttempt = feedbackRead.attempt
  const scanFeedbackBySubject = feedbackRead.status === 'ready' ? feedbackRead.data : {}
  useEffect(() => {
    if (!familyId || !selectedChildId) return
    let active = true
    const q = query(
      scansCollection(familyId),
      where('childId', '==', selectedChildId),
      orderBy('createdAt', 'desc'),
      limit(20),
    )
    getDocs(q).then((snap) => {
      if (!active) return
      const feedback: typeof scanFeedbackBySubject = {}
      for (const d of snap.docs) {
        const scan = { ...d.data(), id: d.id } as ScanRecord
        if (!scan.results || !isWorksheetScan(scan.results)) continue
        const r = scan.results as WorksheetScanResult
        const rec = effectiveRecommendation(scan) ?? r.recommendation
        const subject = (r.subject || '').toLowerCase()
        const key = subject.includes('math') ? 'Math'
          : subject.includes('reading') || subject.includes('phonics') ? 'Reading'
          : subject.includes('language') ? 'LanguageArts'
          : subject.includes('science') ? 'Science'
          : subject.includes('history') ? 'History'
          : subject.includes('art') ? 'Art'
          : subject.includes('music') ? 'Music'
          : subject
        if (!feedback[key]) {
          feedback[key] = {
            topic: r.specificTopic || '',
            recommendation: rec,
            estimatedMinutes: r.estimatedMinutes,
          }
        }
      }
      setFeedbackRead((prev) => prev.visit === feedbackVisit && prev.attempt === feedbackAttempt ? { ...prev, status: 'ready', data: feedback } : prev)
    }).catch((err) => {
      if (!active) return
      console.error('[TodayPage] Failed to load scan guidance', err)
      setFeedbackRead((prev) => prev.visit === feedbackVisit && prev.attempt === feedbackAttempt ? { ...prev, status: 'unavailable', data: {} } : prev)
    })
    return () => { active = false }
  }, [familyId, selectedChildId, feedbackVisit, feedbackAttempt])
  const retryScanFeedback = useCallback(() => {
    setFeedbackRead((prev) => prev.scope === scanScope && prev.visit === feedbackVisit && prev.status === 'unavailable'
      ? { ...prev, attempt: prev.attempt + 1, status: 'loading', data: {} } : prev)
  }, [scanScope, feedbackVisit])

  // Real-time recent scans for inline analysis panels
  const [recentScansRead, setRecentScansRead] = useState<{
    scope: string; visit: number; attempt: number; status: 'loading' | 'ready' | 'unavailable'; data: ScanRecord[]
  }>({ scope: scanScope, visit: 0, attempt: 0, status: 'loading', data: [] })
  if (recentScansRead.scope !== scanScope) {
    setRecentScansRead({ scope: scanScope, visit: recentScansRead.visit + 1, attempt: 0, status: 'loading', data: [] })
  }
  const recentScansVisit = recentScansRead.visit
  const recentScansAttempt = recentScansRead.attempt
  const todayRecentScans = recentScansRead.status === 'ready' ? recentScansRead.data : []
  useEffect(() => {
    if (!familyId || !selectedChildId) return
    let active = true
    const q = query(
      scansCollection(familyId),
      where('childId', '==', selectedChildId),
      orderBy('createdAt', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!active) return
        const data = snap.docs.map((d) => ({ ...(d.data() as ScanRecord), id: d.id }))
        setRecentScansRead((prev) => prev.visit === recentScansVisit && prev.attempt === recentScansAttempt ? { ...prev, status: 'ready', data } : prev)
      },
      (err) => {
        if (!active) return
        console.error('[TodayPage] Failed to load scans', err)
        setRecentScansRead((prev) => prev.visit === recentScansVisit && prev.attempt === recentScansAttempt ? { ...prev, status: 'unavailable', data: [] } : prev)
      },
    )
    return () => { active = false; unsub() }
  }, [familyId, selectedChildId, recentScansVisit, recentScansAttempt])
  const retryRecentScans = useCallback(() => {
    setRecentScansRead((prev) => prev.scope === scanScope && prev.visit === recentScansVisit && prev.status === 'unavailable'
      ? { ...prev, attempt: prev.attempt + 1, status: 'loading', data: [] } : prev)
  }, [scanScope, recentScansVisit])

  /** Map energy level to plan type: normal → Normal Day, low/overwhelmed → MVD. */
  const energyToPlanType = (level: EnergyLevel): PlanType =>
    level === EnergyLevel.Normal ? PlanType.Normal : PlanType.Mvd

  /**
   * The day this page is showing RIGHT NOW — the target a rollback is allowed to
   * touch (Codex round 1, P1).
   *
   * A ref, synced in an effect, because `reportPlanSave` runs from a `.then`
   * that closed over the callback as it stood when the tap happened: a value
   * captured in that callback's dependencies would be the OLD child, which is
   * exactly the comparison that must not be made.
   */
  const planTargetRef = useRef(`${selectedChildId}|${today}`)
  useEffect(() => {
    planTargetRef.current = `${selectedChildId}|${today}`
  }, [selectedChildId, today])

  /**
   * Which day-status tap is the newest — the day log's identity guard, in the
   * one form this surface can have (Codex round 2, P1).
   *
   * Two taps can be in flight at once: the energy group and the day-type menu
   * are a second apart. An unconditional rollback then puts the OLDER failure's
   * captured values over the newer optimistic ones, and a later tap persists
   * that stale value. `useDayLog` guards this by object identity; energy and
   * plan type are enum strings with no identity, so a monotonic sequence is what
   * plays that part.
   */
  const planEditSeqRef = useRef(0)

  /**
   * The plan as STORED — what a rollback goes back to when we have one.
   *
   * Better than the values captured at the tap, because after two failures in a
   * row the second tap's "previous" is the first tap's optimistic value, which
   * never landed. The stored document is the only thing known to have. When
   * there is none — an unsettled or failed read, where nothing was written
   * either — the captured values are right and are used instead.
   */
  const storedPlanRef = useRef<DailyPlan | null>(null)
  useEffect(() => {
    storedPlanRef.current = dailyPlan
  }, [dailyPlan])

  /**
   * UX-352 — an optimistic day-status edit that did not land is taken back and
   * said out loud, exactly as a checklist edit is. Both controls here update the
   * screen before the write resolves, and `saveDailyPlan` can decline in four
   * ways; before this, three of them reached the parent as nothing at all.
   *
   * **The rollback is scoped to the day it was made on** (Codex round 1, P1). A
   * save left in flight across a child switch would otherwise restore one
   * child's energy and plan type onto his brother's page, where the restore
   * effect above would not clear them (it only re-runs when `dailyPlan` moves)
   * and the next tap would persist one of them into the brother's document —
   * `UX-345` again, through the rollback written to report it. When the page has
   * moved on, nothing is restored and the failure is **still reported**, naming
   * the child it belonged to: silence is what this row exists to end.
   */
  const reportPlanSave = useCallback(
    (
      outcome: DailyPlanSaveOutcome,
      target: string,
      seq: number,
      prevEnergy: EnergyLevel,
      prevPlanType: PlanType,
    ) => {
      if (outcome.ok) return
      if (planTargetRef.current !== target) {
        const movedChildId = target.split('|')[0]
        const movedChildName =
          movedChildId && movedChildId !== selectedChildId
            ? (children.find((c) => c.id === movedChildId)?.name ?? null)
            : null
        setSnackMessage(dailyPlanSaveMovedOnNotice(movedChildName))
        return
      }
      if (planEditSeqRef.current !== seq) {
        // A newer tap is on screen. Restoring would undo it — and the sentence
        // may not claim a rollback that did not happen.
        setSnackMessage(dailyPlanSaveSupersededNotice())
        return
      }
      const stored = storedPlanRef.current
      const goBackTo =
        stored && stored.childId === target.split('|')[0]
          ? { energy: stored.energy, planType: stored.planType }
          : { energy: prevEnergy, planType: prevPlanType }
      setEnergy(goBackTo.energy)
      setPlanType(goBackTo.planType)
      setSnackMessage(dailyPlanSaveFailureNotice(outcome.reason))
    },
    [setSnackMessage, children, selectedChildId],
  )

  const handleEnergyChange = useCallback(
    (newEnergy: EnergyLevel) => {
      const target = `${selectedChildId}|${today}`
      const seq = (planEditSeqRef.current += 1)
      const prevEnergy = energy
      const prevPlanType = planType
      setEnergy(newEnergy)
      // FEAT-200: a Life Day is an explicit choice about what KIND of day this
      // is, so the energy toggle must not silently undo it. Energy still derives
      // Normal/MVD for every day that was never marked a Life Day — byte-for-byte
      // the prior behaviour — but on a Life Day it records energy alone.
      const newPlanType =
        planType === PlanType.Life ? PlanType.Life : energyToPlanType(newEnergy)
      setPlanType(newPlanType)
      void saveDailyPlan(newEnergy, newPlanType).then((outcome) =>
        reportPlanSave(outcome, target, seq, prevEnergy, prevPlanType),
      )
    },
    [saveDailyPlan, planType, energy, reportPlanSave, selectedChildId, today],
  )

  /**
   * FEAT-200: the parent names the kind of day directly. Writes ONLY
   * `dailyPlans.planType` — the day's checklist and blocks are never touched, in
   * either direction, so switching to a Life Day hides the checklist and
   * switching back restores it exactly. A day is not destroyed by relabelling it.
   */
  const handleDayTypeChange = useCallback(
    (newPlanType: PlanType) => {
      const target = `${selectedChildId}|${today}`
      const seq = (planEditSeqRef.current += 1)
      const prevPlanType = planType
      setPlanType(newPlanType)
      void saveDailyPlan(energy, newPlanType).then((outcome) =>
        reportPlanSave(outcome, target, seq, energy, prevPlanType),
      )
    },
    [saveDailyPlan, energy, planType, reportPlanSave, selectedChildId, today],
  )

  // --- Print materials handler ---

  const handlePrintTodayMaterials = useCallback(async () => {
    if (!dayLog?.checklist || !selectedChildId) return
    setPrintingMaterials(true)

    try {
      const parseMinutes = (label: string): number => {
        const match = label.match(/\((\d+)m\)/)
        return match ? parseInt(match[1]) : 15
      }

      const todayPlan: DraftDayPlan = {
        day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        timeBudgetMinutes: 150,
        items: (dayLog.checklist ?? [])
          .filter((i) => !i.completed)
          .map((i) => ({
            id: i.id ?? '',
            title: i.label.replace(/\s*\(\d+m\)\s*$/, ''),
            subjectBucket: (i.subjectBucket ?? SubjectBucket.Other) as DraftPlanItem['subjectBucket'],
            estimatedMinutes: i.estimatedMinutes ?? i.plannedMinutes ?? parseMinutes(i.label),
            skillTags: i.skillTags ?? [],
            isAppBlock: false,
            accepted: true,
          })),
      }

      const prompt = buildMaterialsPrompt(
        todayPlan,
        {
          name: activeChild?.name ?? 'Student',
          birthdate: activeChild?.birthdate,
          grade: activeChild?.grade,
          motivators: activeChild?.motivators,
          interests: activeChild?.interests,
          strengths: activeChild?.strengths,
        },
        todaySnapshot,
        weekFocus?.theme,
      )

      const response = await aiChat({
        familyId,
        childId: selectedChildId,
        taskType: TaskType.Chat,
        messages: [{ role: 'user', content: prompt }],
      })

      if (response?.message) {
        openPrintWindow(response.message, `${activeChild?.name ?? 'Student'} - Today`)
      }
    } catch (err) {
      console.error('Material generation failed:', err)
      setSnackMessage({ text: 'Failed to generate materials. Try again.', severity: 'error' })
    } finally {
      setPrintingMaterials(false)
    }
  }, [dayLog, selectedChildId, activeChild, todaySnapshot, weekFocus, aiChat, familyId, setSnackMessage])

  // ── The before-work page check (the PROSPECTIVE door) ──────────────────────
  //
  // This replaces the old pre-completion "should I skip?" scan, which asked a
  // prospective question through a retrospective pipeline: it handed the page to
  // an untargeted `syncScanToConfig` (which fuzzy-matched the cover text and
  // could create or advance a workbook), wrote `childSkillMaps` from
  // `alignsWithSnapshot`, stamped the row `scanned: true`, saved a `scans`
  // document that `loadRecentScansContext` then read as evidence — equating its
  // `skip` recommendation with mastery — and offered *Add to plan*, *Skip*,
  // *Update position* and *Accept skip* under the answer. Every one of those is
  // a claim about the child, from a page he had not touched.
  //
  // The replacement writes nothing at all (see `beforeWorkPageCheck.ts` for the
  // contract and `docs/review/BEFORE_WORK_PAGE_CHECK.md` for the persistence
  // decision). It is reachable two ways — the day's own card, which needs no
  // planned workbook and no AI-written `skipGuidance`, and a planned row's
  // button, which now opens the SAME safe flow rather than the old one. The
  // identity preparation the old row write needed is gone with the write.
  const pageCheckCanCheck = canEditLiveDay && !isKidProfile
  const pageCheck = useBeforeWorkPageCheck({
    familyId,
    childId: selectedChildId ?? '',
    dateKey: today,
    // The gate at the ENTRY. The controller asks the same question again at the
    // tap, off a ref rather than this render's value, and `canEdit` is the one
    // canonical parent answer this page already reads.
    canCheck: pageCheckCanCheck,
  })

  /**
   * The sheet's open state is the SCOPE it was opened under, not a boolean.
   *
   * A boolean survives a child switch, and a sheet left open over a new child is
   * a sheet whose next tap is about the wrong boy. Comparing against the
   * controller's live `scopeToken` closes it in the same render the switch
   * happens in — no effect, so nothing stale is ever painted.
   *
   * Deliberately the SCOPE token and not the selection token: the selection
   * token also advances on close, cancel and retry, and keying the sheet to it
   * would make "Check another page" close the sheet it is retrying in. Retiring
   * the picker is a separate call below.
   */
  const [pageCheckOpenToken, setPageCheckOpenToken] = useState<string | null>(null)
  const [pageCheckContext, setPageCheckContext] = useState<{ itemLabel?: string; subjectBucket?: string } | null>(null)
  const pageCheckOpen = pageCheckOpenToken === pageCheck.scopeToken

  const openPageCheck = useCallback(
    (context?: { itemLabel?: string; subjectBucket?: string }) => {
      if (!pageCheckCanCheck || !selectedChildId) return
      // Opening is itself a retirement: a file still sitting in a picker opened
      // before the sheet was last closed must not arrive as if it were this
      // session's choice.
      pageCheck.beginPickerSession()
      setPageCheckContext(context ?? null)
      setPageCheckOpenToken(pageCheck.scopeToken)
    },
    [pageCheckCanCheck, selectedChildId, pageCheck],
  )

  const closePageCheck = useCallback(() => {
    setPageCheckOpenToken(null)
    setPageCheckContext(null)
    pageCheck.close()
  }, [pageCheck])

  /**
   * A planned row's door. It carries the row's label and subject as capture
   * CONTEXT for the prompt only — it binds no row, prepares no identity, and
   * returns nothing that could be written back to one.
   */
  const handleBeforeWorkPageCheck = useCallback(
    (item: ChecklistItemType) => {
      openPageCheck({
        itemLabel: item.label.replace(/\s*\(\d+m\)/, ''),
        ...(item.subjectBucket ? { subjectBucket: item.subjectBucket } : {}),
      })
    },
    [openPageCheck],
  )

  const handlePageCheckPick = useCallback(
    (file: File, token: string) => {
      // The token is the identity the camera / picker was opened under. The
      // controller refuses it when it is no longer the live one, which is the
      // case this page cannot see: the native picker is open above it.
      void pageCheck.start(file, pageCheckContext ?? undefined, token)
    },
    [pageCheck, pageCheckContext],
  )

  const handleScanAddToPlan = useCallback(() => {
    if (!scanResult?.results || scanResultItemIndex == null || !dayLog?.checklist) return
    const r = scanResult.results
    // Only worksheet/workbook scans can be added to plan — skip certificates
    if (r.pageType === 'certificate') return
    const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
      i === scanResultItemIndex
        ? {
            ...ci,
            subjectBucket: (r.subject.charAt(0).toUpperCase() + r.subject.slice(1)) as SubjectBucket,
            estimatedMinutes: r.estimatedMinutes,
            plannedMinutes: r.estimatedMinutes,
            skillTags: r.skillsTargeted.map((s: { skill: string }) => s.skill),
            skipGuidance: r.recommendation === 'skip' || r.recommendation === 'quick-review'
              ? `${r.recommendation}: ${r.recommendationReason}`
              : undefined,
          }
        : ci,
    )
    persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
    if (scanResult) void recordScanAction(familyId, scanResult, 'added')
    clearScan()
    preCompletionRequestRef.current = null
    setPreCompletionTarget(null)
    setScanItemIndex(null)
  }, [scanResult, scanResultItemIndex, dayLog, familyId, persistDayLogImmediate, recordScanAction, clearScan, setScanItemIndex])

  const handleScanSkip = useCallback(() => {
    if (scanResultItemIndex == null) return
    if (scanResult) void recordScanAction(familyId, scanResult, 'skipped')
    clearScan()
    preCompletionRequestRef.current = null
    setPreCompletionTarget(null)
    setScanItemIndex(null)
  }, [scanResult, scanResultItemIndex, familyId, recordScanAction, clearScan, setScanItemIndex])

  const handleClearScan = useCallback(() => {
    clearScan()
    preCompletionRequestRef.current = null
    setPreCompletionTarget(null)
    setScanItemIndex(null)
  }, [clearScan, setScanItemIndex])

  const handleScanUpdatePosition = useCallback(
    async (curriculum: CurriculumDetected) => {
      if (!familyId || !selectedChildId || !curriculum.lessonNumber) return

      try {
        const result = await syncScanToConfig(selectedChildId, {
          pageType: 'worksheet',
          subject: curriculum.name || 'unknown',
          specificTopic: '',
          skillsTargeted: [],
          estimatedDifficulty: 'appropriate',
          recommendation: 'do',
          recommendationReason: '',
          estimatedMinutes: 30,
          teacherNotes: '',
          curriculumDetected: curriculum,
        })

        if (result.action === 'created') {
          setSnackMessage({ text: `New workbook "${result.configName}" created at Lesson ${curriculum.lessonNumber}!`, severity: 'success' })
        } else {
          setSnackMessage({ text: `Position updated to Lesson ${curriculum.lessonNumber}!`, severity: 'success' })
        }
      } catch (err) {
        console.error('[TodayPage] Failed to update position', err)
        setSnackMessage({ text: 'Failed to update position', severity: 'error' })
      }
    },
    [familyId, selectedChildId, syncScanToConfig, setSnackMessage],
  )

  const handleSkipToNext = useCallback(
    async (nextLesson: number) => {
      if (!familyId || !selectedChildId || !scanResult?.results) return
      const results = scanResult.results
      if (results.pageType === 'certificate') return

      const curriculum = results.curriculumDetected
      if (!curriculum) return

      try {
        await syncScanToConfig(selectedChildId, {
          ...results,
          curriculumDetected: { ...curriculum, lessonNumber: nextLesson },
        })
        setSnackMessage({ text: `Skipping ahead — next lesson: ${nextLesson}`, severity: 'success' })
      } catch (err) {
        console.error('[TodayPage] Failed to skip to next lesson', err)
        setSnackMessage({ text: 'Failed to update position', severity: 'error' })
      }
    },
    [familyId, selectedChildId, scanResult, syncScanToConfig, setSnackMessage],
  )

  const handleAcceptSkip = useCallback(
    async (): Promise<boolean> => {
      if (!familyId || !selectedChildId || !dayLog || !scanResult?.results) return false
      const results = scanResult.results
      if (results.pageType === 'certificate') return false

      const curriculum = results.curriculumDetected
      if (!curriculum?.lessonNumber) return false

      const index = resolvePreCompletionScanIndex(
        preCompletionTarget, { familyId, childId: selectedChildId, dateKey: today }, scanResult.id, dayLog,
      )
      if (index == null) {
        setSnackMessage({ text: 'This scan is no longer linked to one row in this plan. Scan the intended row again before accepting.', severity: 'warning' })
        return false
      }
      const item = dayLog.checklist![index]
      const itemKey = preCompletionTarget!.itemId
      // Capture identity before either await. The row patch reads the latest
      // saved checklist, while navigation cannot redirect this confirmed work.
      const target = {
        familyId,
        childId: selectedChildId,
        dateKey: today,
        itemKey,
        hint: { index, completed: !!item.completed },
      }

      try {
        // Advance currentPosition by +1, as explicitly confirmed by this tap.
        await syncScanToConfig(selectedChildId, {
          ...results,
          curriculumDetected: { ...curriculum, lessonNumber: curriculum.lessonNumber + 1 },
        })

        // Record parentOverride on the scan record.
        if (scanResult.id) {
          const override = {
            recommendation: 'skip' as const,
            overriddenBy: familyId,
            overriddenAt: new Date().toISOString(),
            note: 'Accepted AI skip recommendation',
          }
          await updateDoc(doc(scansCollection(familyId), scanResult.id), { parentOverride: override })
        }

        const outcome = await writeChecklistRow({
          ...target,
          hint: target.hint,
          requireUniqueIdentity: true,
          patch: { skipped: true, skipReason: SkipReason.AiRecommended },
          context: 'today-accept-skip',
        })
        const notice = skipRowWriteNotice(outcome)
        if (notice) {
          setSnackMessage({ text: notice, severity: 'warning' })
          return false
        }
        setSnackMessage({ text: 'Skipped. Moving forward.', severity: 'success' })
        return true
      } catch (err) {
        console.error('[TodayPage] Failed to accept skip recommendation', err)
        setSnackMessage({ text: 'Failed to finish accepting the skip. Curriculum progress may already have advanced; check it before trying again.', severity: 'error' })
        return false
      }
    },
    [familyId, selectedChildId, dayLog, scanResult, preCompletionTarget, syncScanToConfig, today, setSnackMessage],
  )

  // --- Loading state ---

  const scrollToArtifacts = useCallback(() => {
    artifactSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleSnackMessage = useCallback(
    (msg: { text: string; severity: 'success' | 'error' | 'warning' }) => setSnackMessage(msg),
    [setSnackMessage],
  )

  // ── Strand session capture from the day (UX-283) ─────────────────────────
  // The day-surface sibling of the Curriculum row's button. This page owns the
  // dialog and the write because a session moves a curriculum row's count, and
  // that belongs beside the other config writes rather than in a checklist
  // renderer. Parent-only twice over: kids return `KidTodayView` above this,
  // and the handler is only ever passed from here.
  const strandSessionConfig = useMemo(
    () => activityConfigs.find((c) => c.id === strandSessionId) ?? null,
    [activityConfigs, strandSessionId],
  )

  const handleLogStrandSession = useCallback(
    async (topic: string, evidence: StrandSessionEvidence) => {
      if (!familyId || !selectedChildId || !strandSessionConfig) return
      setStrandSessionSaving(true)
      setStrandSessionError(null)
      try {
        const { artifacts } = await logStrandSession({
          familyId,
          config: strandSessionConfig,
          childId: selectedChildId,
          topic,
          evidence,
          dayLogId: today,
        })
        // Today's evidence list is filled by a one-shot `getDocs` that reruns
        // only on a family / child / date change, so a new artifact is invisible
        // until reload unless the writer adds it — which is what every other
        // capture path on this page already does (Codex round 2). It also feeds
        // the checklist's photo resolution.
        setTodayArtifacts((prev) => [...artifacts, ...prev])
        setStrandSessionId(null)
        setSnackMessage({ text: 'Session recorded.', severity: 'success' })
      } catch (err) {
        // Says what did NOT happen rather than implying it was recorded, and
        // leaves the dialog open with her capture intact.
        setStrandSessionError(
          // Both of ours carry the parent-facing sentence already: a refusal
          // states the rule, and a failure states which of the two truths
          // applies — cleaned up, or evidence left behind that a blind retry
          // would duplicate (Codex round 1).
          // One base for every failure that carries its own sentence (Codex
          // round 2), rather than a growing `instanceof` list here: a refusal
          // states the rule; a failure states which truth applies — cleaned up,
          // evidence left behind that a blind retry would duplicate, or the
          // strand removed while the dialog was open.
          err instanceof StrandSessionRefused || err instanceof StrandSessionFailure
            ? err.message
            : STRAND_SESSION_FAILED_CLEAN,
        )
      } finally {
        setStrandSessionSaving(false)
      }
    },
    [familyId, selectedChildId, strandSessionConfig, today, setSnackMessage, setTodayArtifacts],
  )

  // Kid profile early return — render dedicated kid view
  if (isKidProfile && dayLog && activeChild) {
    const weekRange = getWeekRange(parseDateYmd(today) ?? new Date(), 1)
    return (
      <KidTodayView
        dayLog={dayLog}
        child={activeChild}
        persistDayLogImmediate={persistDayLogImmediate}
        familyId={familyId}
        today={today}
        weekStart={weekRange.start}
        isMvd={planType === PlanType.Mvd}
        weekFocus={weekFocus}
        readAloudBookId={readAloudBookId}
      />
    )
  }

  if (!dayLog) {
    return (
      <Page>
        <ContextBar
          page="today"
          activeChild={activeChild}
          dateKey={today}
        />
        {/* UX-362 / UX-426: which boy, before anything about him — same order
            as the loaded page below. The selector that used to say it is gone
            (UX-425); the sentence says it instead, for a parent and a kid
            alike, because the page's own heading is *Today* and names nobody. */}
        <ActiveChildLine hint={!isKidProfile} />
        <Typography variant="h4" component="h1">{pageHeading}</Typography>
        <HelpStrip
          pageKey="today"
          text="Tap items off as you go — everything saves itself."
        />
        {selectedChildId && (
          <SectionCard title="DayLog">
            <LoadingState label="Loading today's log..." />
          </SectionCard>
        )}
      </Page>
    )
  }

  return (
    <Page>
      {/* FIX-266: parent Today opts in to words for the capture jump. Kid
          profiles return `KidTodayView` above, and the `!dayLog` bar passes no
          capture callback, so this is the only bar carrying a label. */}
      <ContextBar
        page="today"
        activeChild={activeChild}
        dateKey={today}
        onCaptureArtifact={scrollToArtifacts}
        captureActionLabel="Log extra work"
      />

      {/* ── UX-362 / UX-425 / UX-426: which boy, before anything about him ──
          AUDIT-228 counted six things about one particular child rendering
          above the control that says which child — the ContextBar chip, this
          heading, the day arrows, `WeekRibbon`'s five dots, the day banner and
          `HelpStrip`. `UX-362` made the chip the real switcher and moved the
          selector up beside it. `UX-425` then removed BOTH in-page controls
          (owner, 2026-09-13, reversing *"the in-page selectors stay"*): the one
          place a parent chooses the child is the chip in the shell.

          What the selector was also doing here is NAMING the child, and this
          page's heading is *Today* — so the sentence stays even though the
          control does not. `UX-313`'s rule: a records surface names its target
          before the tap. Today writes `days`, `dailyPlans`, `artifacts`,
          `scans` and `activityConfigs`, so it is exactly that surface.

          A kid gets the same sentence without the switch hint — capability,
          never a name, the answer `ChildSwitcherChip` gives the chip above. */}
      <ActiveChildLine hint={!isKidProfile} />

      <Typography variant="h4" component="h1">{pageHeading}</Typography>

      {/* Day Switcher */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <IconButton size="small" onClick={handlePrevDay} aria-label="Previous day">
          <ChevronLeftIcon />
        </IconButton>

        <Stack alignItems="center" spacing={0}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {selectedDayName}
          </Typography>
          {!isToday && (
            <Button size="small" variant="text" onClick={handleGoToToday} sx={{ py: 0, minHeight: 'auto' }}>
              Back to today
            </Button>
          )}
        </Stack>

        <IconButton size="small" onClick={handleNextDay} aria-label="Next day">
          <ChevronRightIcon />
        </IconButton>
      </Stack>

      {/* --- Week Ribbon: 5-dot Mon-Fri progress + day switcher (parent only) --- */}
      {selectedChildId && (
        <SectionErrorBoundary section="week ribbon">
          <WeekRibbon
            childId={selectedChildId}
            familyId={familyId}
            weekStart={ribbonWeekStart(selectedDate)}
            today={realToday}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </SectionErrorBoundary>
      )}

      {(() => {
        const isPast =
          new Date(selectedDate + 'T00:00:00') <
          new Date(realToday + 'T00:00:00')
        const dayIsEmpty = (dayLog?.checklist?.length ?? 0) === 0
        const banner = selectTodayDayBanner({
          isToday,
          isPast,
          dayIsEmpty,
          hasUnappliedDraft: draftRead.hasDraft,
          draftStatus: draftRead.status,
        })

        if (banner === 'draft-loading') {
          return <Typography role="status" variant="body2" sx={{ mb: 1 }}>Checking this week's plan…</Typography>
        }
        if (banner === 'draft-unavailable') {
          return (
            <Alert severity="warning" sx={{ mb: 1 }} action={<Button color="inherit" size="small" onClick={draftRead.retry}>Try again</Button>}>
              Couldn't check this week's draft plan.
            </Alert>
          )
        }

        // FEAT-111 P2: a plan is drafted but never applied → actionable,
        // non-blaming prompt (charter) deep-linking to the planner (which lands
        // in review phase while an unapplied draft exists). Shows on empty or
        // upcoming days so Today never renders a silently empty day.
        if (banner === 'draft') {
          return (
            <Alert
              severity="warning"
              sx={{ mb: 1 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => navigate('/planner/chat')}
                >
                  Review &amp; apply
                </Button>
              }
            >
              A plan for this week is drafted but not applied — review and apply
              it?
            </Alert>
          )
        }
        if (banner === 'past') {
          return (
            <Alert severity="info" sx={{ mb: 1 }}>
              {`Viewing ${selectedDayName} (past). You can mark items complete or add notes.`}
            </Alert>
          )
        }
        // FEAT-111 P4: only tell the parent items will appear when the upcoming
        // day is genuinely empty — never when applied items already sit on it.
        if (banner === 'upcoming-empty') {
          return (
            <Alert severity="info" sx={{ mb: 1 }}>
              {`Viewing ${selectedDayName} (upcoming). Items will appear on this day.`}
            </Alert>
          )
        }
        return null
      })()}

      <HelpStrip
        pageKey="today"
        text="Tap items off as you go — everything saves itself."
      />

      <HelperPanel template={activeTemplate} />

      {/* --- Energy + day type (UX-182) ---
           Extracted to `DayStatusRow` so the two questions get a line each: on a
           phone the old single row clipped FEAT-200's day-type control off the
           right edge and pushed the save indicator off-screen entirely. --- */}
      <DayStatusRow
        energy={energy}
        onEnergyChange={handleEnergyChange}
        planType={planType}
        canEditDayType={canEditLiveDay && dayPlanEditable}
        onDayTypeChange={handleDayTypeChange}
        saveState={saveState}
        /* UX-345 — GATE: both controls write the plan document, so neither is
           live until this child's read has settled, and neither comes back
           after one that failed. */
        planSettled={dayPlanEditable}
        planNote={dailyPlanGateNote({
          isLoading: dayPlanLoading,
          loadFailed: dayPlanReadFailed,
          hasTarget: Boolean(selectedChildId),
        })}
      />

      {/* --- FEAT-200: on a Life Day, Today is a place to RECORD, not a list to
           finish. The checklist is HIDDEN, never deleted — the day doc is
           untouched, so switching back restores it exactly. --- */}
      {selectedChild && planType === PlanType.Life && (
        <SectionErrorBoundary section="life day">
          <LifeDayCard
            // Keyed by the day it records: the note field's local draft resets
            // with the day rather than following the parent onto another child.
            key={`${selectedChildId}_${today}`}
            dayLog={dayLog}
            persistDayLogImmediate={persistDayLogImmediate}
            canEdit={canEditLiveDay}
          />
        </SectionErrorBoundary>
      )}

      {/* --- The before-work page check (parent, prospective, writes nothing) ---
           Deliberately OUTSIDE the checklist block and outside the Life-day
           condition: the whole point is that it is reachable with an empty
           plan, with no workbook row, and with no AI-written skip guidance.
           It names the child from the same active-child context the header
           line above already read — there is no second selector here. */}
      {selectedChild && (
        <SectionErrorBoundary section="before-work page check">
          <BeforeWorkPageCheckCard
            childName={selectedChild.name}
            canCheck={pageCheckCanCheck}
            onOpen={() => openPageCheck()}
          />
          <BeforeWorkPageCheckDialog
            open={pageCheckOpen}
            childName={selectedChild.name}
            status={pageCheck.status}
            summary={pageCheck.summary}
            photoPreviewUrl={pageCheck.photoPreviewUrl}
            itemLabel={pageCheck.itemLabel}
            cancelled={pageCheck.cancelled}
            selectionToken={pageCheck.selectionToken}
            onPick={handlePageCheckPick}
            onCancel={pageCheck.cancel}
            onRetry={pageCheck.close}
            onClose={closePageCheck}
          />
        </SectionErrorBoundary>
      )}

      {/* --- Today's Plan checklist (PRIMARY) --- */}
      {selectedChild && planType !== PlanType.Life && (
        <SectionErrorBoundary section="checklist">
        {feedbackRead.status === 'loading' && (
          <Typography role="status" variant="body2">Checking scan guidance…</Typography>
        )}
        {feedbackRead.status === 'unavailable' && (
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={retryScanFeedback}>Try again</Button>}>
            Couldn't load scan guidance.
          </Alert>
        )}
        {recentScansRead.status === 'loading' && (
          <Typography role="status" variant="body2">Loading recent scans…</Typography>
        )}
        {recentScansRead.status === 'unavailable' && (
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={retryRecentScans}>Try again</Button>}>
            Couldn't load recent scans.
          </Alert>
        )}
        <TodayChecklist
          // UX-343 — the checklist's own dialogs and drafts (a lesson-video
          // search with an hours logger in it, a row's photo dialog, a typed
          // review note, a half-filled new row) all write with the live child
          // and date. Keyed by the scope, exactly as `LifeDayCard` beside it
          // already is, so none of them can outlive the identity they were
          // started under; the sentence naming what was closed is raised by the
          // scope guard above, off the set this component reports up.
          key={scopeKey}
          onOpenDecisionsChange={handleChecklistOpenDecisions}
          dayLog={dayLog}
          selectedChild={selectedChild}
          selectedChildId={selectedChildId}
          familyId={familyId}
          today={today}
          isToday={isToday}
          planType={planType}
          todaySnapshot={todaySnapshot}
          activeRoutineItems={activeRoutineItems}
          persistDayLogImmediate={persistDayLogImmediate}
          onTeachHelperOpen={(item) => {
            setTeachHelperItem(item)
            setTeachHelperOpen(true)
          }}
          onWatchOpen={watch.openWatch}
          onAddWatchItem={() => setWatchPickerOpen(true)}
          onStrandSessionOpen={(configId) => {
            setStrandSessionError(null)
            setStrandSessionId(configId)
          }}
          onMoveItemToDay={canEditLiveDay ? (index) => setMoveTargetIndex(index) : undefined}
          onSwapWatchItem={canEditLiveDay ? (index) => setSwapTargetIndex(index) : undefined}
          onUnifiedCapture={handleUnifiedCapture}
          onUnifiedCaptureBatch={handleUnifiedCaptureBatch}
          onBackfillWorkbookScan={handleBackfillWorkbookScan}
          todayArtifacts={todayArtifacts}
          configs={activityConfigs}
          // UX-363 / Codex round 1 (P2): an unread or failed configs read is not
          // an empty curriculum. The hook already distinguishes the three states.
          configsLoading={activityConfigsLoading}
          configsFailed={!!activityConfigsError}
          // The planned row's before-work door, now the safe one. The old
          // `onPreCompletionScan` / `onPreparePreCompletionScan` pair is no
          // longer passed: this door takes no photo on the row, binds no row
          // identity and prepares none.
          onBeforeWorkPageCheck={handleBeforeWorkPageCheck}
          scanResultItemIndex={scanResultItemIndex}
          captureLoading={scanLoading}
          captureItemIndex={scanItemIndex}
          scanResult={scanResult}
          scanError={scanError}
          onScanAddToPlan={handleScanAddToPlan}
          onScanSkip={handleScanSkip}
          onClearScan={handleClearScan}
          onUpdatePosition={handleScanUpdatePosition}
          onSkipToNext={handleSkipToNext}
          onAcceptSkip={handleAcceptSkip}
          onPrintMaterials={handlePrintTodayMaterials}
          printingMaterials={printingMaterials}
          scanFeedbackBySubject={scanFeedbackBySubject}
          scanFeedbackAvailable={feedbackRead.status === 'ready'}
          recentScans={todayRecentScans}
          recentScansAvailable={recentScansRead.status === 'ready'}
        />
        </SectionErrorBoundary>
      )}

      {/* --- For you today: parent-facing cards, below the primary checklist --- */}
      <Typography variant="overline" color="text.secondary" sx={{ mt: 1 }}>
        For you today
      </Typography>

      {/* --- Week Focus + Conundrum --- */}
      {weekFocus && (
        <SectionErrorBoundary section="week focus">
          <Box id="conundrum" />
          <WeekFocusCard
            weekFocus={weekFocus}
            familyId={familyId}
            selectedChildId={selectedChildId}
            today={today}
            onArtifactSaved={loadTodayArtifacts}
            onSnackMessage={handleSnackMessage}
          />
        </SectionErrorBoundary>
      )}

      {/* --- Chapter Question Pool (read-aloud discussion) --- */}
      <SectionErrorBoundary section="chapter question">
        <Box id="chapter" />
        <ChapterQuestionPool
          // UX-343, Codex round 2 (P1) — keyed on the same scope as the
          // checklist, so a note typed for one boy cannot be saved onto the
          // other's book progress; it reports its own draft up so the reset
          // notice can name it.
          key={scopeKey}
          onOpenDecisionsChange={handleChapterOpenDecisions}
          book={selectedBook}
          bookProgress={bookProgress}
          bookProgressLoading={bookProgressLoading}
          bookProgressFailed={bookProgressFailed}
          onChapterAnswered={updateChapter}
          dayLog={dayLog}
          persistDayLogImmediate={persistDayLogImmediate}
          onRetryGeneration={() => void handleRetryChapterGen()}
        />
      </SectionErrorBoundary>

      {/* --- Knowledge Mine parent recap (no-shame, read-only, today only) --- */}
      {latestMineSession && (
        <SectionErrorBoundary section="mine recap">
          <MineRecapCard
            session={latestMineSession}
            childName={selectedChild?.name ?? 'Your child'}
          />
        </SectionErrorBoundary>
      )}

      {/* --- Draft Ready: surface unpublished monthly books --- */}
      {familyId && (
        <SectionErrorBoundary section="monthly draft ready">
          <DraftReadyCard familyId={familyId} />
        </SectionErrorBoundary>
      )}

      {/* --- Teach-Back (a child with a younger sibling, after 50%+ must-do) --- */}
      {selectedChild && (
        <SectionErrorBoundary section="teach-back">
          <TeachBackSection
            dayLog={dayLog}
            selectedChild={selectedChild}
            children={children}
            familyId={familyId}
            selectedChildId={selectedChildId}
            today={today}
            persistDayLogImmediate={persistDayLogImmediate}
            onArtifactSaved={loadTodayArtifacts}
            onSnackMessage={handleSnackMessage}
          />
        </SectionErrorBoundary>
      )}

      {/* --- Workshop Game Cards (fun extras, below daily plan) --- */}
      {familyId && children.length > 0 && (
        <WorkshopGameCards familyId={familyId} children={children} />
      )}

      {/* --- Unified Capture (artifact + hours + category, single surface) --- */}
      <div ref={artifactSectionRef} />
      <SectionErrorBoundary section="unified capture">
        <UnifiedCaptureCard
          familyId={familyId}
          selectedChildId={selectedChildId}
          today={today}
          weekPlanId={weekPlanId}
          selectableChildren={selectableChildren}
          todayArtifacts={todayArtifacts}
          setTodayArtifacts={setTodayArtifacts}
          todayChecklist={dayLog?.checklist ?? []}
          artifactsFailed={todayArtifactsFailed}
          artifactsLoading={todayArtifactsLoading}
          familyTimeZone={selectedChild?.settings?.timeZone}
          onSnackMessage={handleSnackMessage}
        />
      </SectionErrorBoundary>

      {selectedChildId && (
        <TeachHelperDialog
          open={teachHelperOpen}
          onClose={() => { setTeachHelperOpen(false); setTeachHelperItem(null) }}
          familyId={familyId}
          childId={selectedChildId}
          childName={selectedChild?.name ?? ''}
          item={teachHelperItem}
          weekTheme={weekFocus?.theme}
        />
      )}

      {/* Watch Vehicle — add a vetted video to the LIVE day (FEAT-132). Only
          reachable from the parent shell's edit mode (kids render KidTodayView
          and never get here), and the same picker the planner uses, so inline
          vet-in and "Manage library" come along for free. */}
      <WatchLibraryPicker
        open={watchPickerOpen}
        onClose={() => setWatchPickerOpen(false)}
        videos={scopedWatchVideos}
        loading={scopedWatchLoading}
        error={scopedWatchError}
        onSelect={handleAddWatchToDay}
        onAddVideo={async (video) => { await addWatchVideo(video) }}
        onManageLibrary={() => navigate('/watch')}
      />

      {/* UX-283 — record a strand session from the day it was planned for. The
          same dialog the Curriculum row opens, so there is one capture surface
          and one write. `isChildProfile` is false by construction here: a kid
          profile returned `KidTodayView` long before this line. */}
      {strandSessionConfig && (
        <StrandSessionDialog
          open
          config={strandSessionConfig}
          isChildProfile={false}
          voiceProfile={{ id: selectedChildId ?? '' }}
          saving={strandSessionSaving}
          error={strandSessionError}
          onClose={() => {
            setStrandSessionId(null)
            setStrandSessionError(null)
          }}
          onSave={(topic, evidence) => void handleLogStrandSession(topic, evidence)}
        />
      )}

      {/* FEAT-138 — change which video a row on the LIVE day points at. Same
          picker as the add path, so the retired-video filter (FEAT-129) holds
          here too: a retired video can never come back onto a day. */}
      <WatchLibraryPicker
        open={swapTargetIndex !== null}
        onClose={() => setSwapTargetIndex(null)}
        videos={scopedWatchVideos}
        loading={scopedWatchLoading}
        error={scopedWatchError}
        onSelect={handleSwapWatchOnDay}
        onAddVideo={async (video) => { await addWatchVideo(video) }}
        onManageLibrary={() => navigate('/watch')}
      />

      {/* FEAT-138 — move a row to another day of this week. */}
      <MoveToDayDialog
        open={moveTargetIndex !== null}
        itemLabel={
          moveTargetIndex !== null ? dayLog?.checklist?.[moveTargetIndex]?.label ?? '' : ''
        }
        options={weekDayDates.map((d) => ({ dateKey: d.dateKey, label: d.label }))}
        currentDateKey={today}
        onClose={() => setMoveTargetIndex(null)}
        onPick={(dateKey) => {
          if (moveTargetIndex !== null) handleMoveItemToDay(moveTargetIndex, dateKey)
          setMoveTargetIndex(null)
        }}
      />

      {/* Watch Vehicle — planned curated-video player (FEAT-104). */}
      <WatchItemDialog
        video={watch.watchVideo}
        open={watch.watchTarget !== null}
        loading={watchLoading}
        error={watchError}
        onClose={watch.closeWatch}
        onComplete={watch.completeWatch}
        voiceProfile={
          selectedChild?.id
            ? { id: selectedChild.id, voiceInputEnhanced: activeChild?.voiceInputEnhanced }
            : undefined
        }
      />

      <Fab
        color="primary"
        size="medium"
        sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 10 }}
        onClick={() => navigate('/chat')}
        aria-label="Ask AI"
      >
        <AutoAwesomeIcon />
      </Fab>

      <Snackbar
        open={snackMessage !== null}
        autoHideDuration={snackMessage?.text === 'Saved' ? 1500 : 4000}
        onClose={() => setSnackMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackMessage(null)}
          severity={snackMessage?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackMessage?.text}
        </Alert>
      </Snackbar>
    </Page>
  )
}
