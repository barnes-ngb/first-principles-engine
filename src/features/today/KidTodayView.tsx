import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import NoteIcon from '@mui/icons-material/Note'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore'

import { useNavigate } from 'react-router-dom'
import MenuBookIcon from '@mui/icons-material/MenuBook'

import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'
import { kidPalette } from '../../app/tokens'
import {
  artifactsCollection,
  chapterBooksCollection,
  dailyArmorSessionDocId,
  dailyArmorSessionsCollection,
} from '../../core/firebase/firestore'
import { getDailyArmorSession } from '../../core/avatar/getDailyArmorSession'
import type { Artifact, ChapterBook, Child, DailyArmorSession, DayLog } from '../../core/types'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { XP_AWARDS } from '../avatar/xpAwards'
import AvatarThumbnail from '../avatar/AvatarThumbnail'
import { useAvatarProfile } from '../avatar/useAvatarProfile'
import { getDailyArmorStatusFromSession } from '../avatar/armorStatus'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from '../avatar/voxel/buildArmorPiece'
import { calculateTier } from '../avatar/voxel/tierMaterials'
import ArmorGateScreen from '../avatar/ArmorGateScreen'
import { getAppliedVoxelPieces } from '../avatar/armorPieceState'
import XpDiamondBar from '../../components/XpDiamondBar'
import { useXpLedger } from '../../core/xp/useXpLedger'
import { useDraftBook, useCompletedBook } from '../books/useBook'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useScrollToHash } from '../../core/hooks/useScrollToHash'
import ExplorerMap from './ExplorerMap'
import KidExtraLogger from './KidExtraLogger'
import KidRitualRow from './KidRitualRow'
import { countRitualsToGo, isChapterDoneToday } from './kidRitualRows'
import { useConundrumDoneToday } from './useConundrumDoneToday'
import { useTodayMiningMinutes } from './useTodayMiningMinutes'
import WorkshopGameCards from './WorkshopGameCards'
import KidCaptureForm from './KidCaptureForm'
import KidChecklist from './KidChecklist'
import WatchItemDialog from '../watch/WatchItemDialog'
import { useWatchLibrary } from '../watch/useWatchLibrary'
import { useWatchItemCompletion } from '../watch/useWatchItemCompletion'
import { computeQuestProgress, isDayAllDone } from './kidQuestGate'
import KidCelebration from './KidCelebration'
import KidChapterPool from './KidChapterPool'
import { isChapterPoolVisible, isReadAloudSectionVisible } from './chapterPool.logic'
import { useBookProgress } from './useBookProgress'
import KidConundrumResponse from './KidConundrumResponse'
import KidTeachBack from './KidTeachBack'
import UnifiedCaptureCard from './UnifiedCaptureCard'
import { useUnifiedCapture } from './useUnifiedCapture'
import { findYoungerSibling } from './teachBackRecipient'
import { calculateXp } from './xp'
interface KidTodayViewProps {
  dayLog: DayLog
  child: Child
  persistDayLogImmediate: (updated: DayLog) => void
  familyId: string
  today: string
  weekStart: string
  isMvd?: boolean
  readAloudBookId?: string
  weekFocus?: {
    theme?: string
    virtue?: string
    scriptureRef?: string
    heartQuestion?: string
    conundrum?: {
      title: string
      question: string
      lincolnPrompt: string
      londonPrompt: string
      londonDrawingPrompt?: string
    }
  } | null
}

const CELEBRATIONS = [
  'All done! Great work today! 🌟',
  'You did it! Strong day! 💪',
  'Finished! You showed up and that matters! ⭐',
  'Complete! Time to enjoy your afternoon! 🎉',
  'Done! You tackled hard things today! 🏆',
]

const MC_CELEBRATIONS = [
  'Achievement Unlocked! All quests complete!',
  'You mined through every challenge today!',
  'Full diamond day! All tasks crafted!',
  'Legendary! You cleared the whole board!',
  'Respawn tomorrow for more adventures!',
]

function getGreeting(name: string, isLincoln: boolean): string {
  const hour = new Date().getHours()
  if (isLincoln) {
    if (hour < 12) return `Rise and mine, ${name}!`
    if (hour < 17) return `Keep crafting, ${name}!`
    return `Strong day at the workbench, ${name}!`
  }
  if (hour < 12) return `Good morning, ${name}!`
  if (hour < 17) return `Good afternoon, ${name}!`
  return `Nice work today, ${name}!`
}

function getMotivation(profile: import('../../core/types').AvatarProfile): string {
  const xp = profile.totalXp
  const unlocked = new Set(VOXEL_ARMOR_PIECES.filter((p) => xp >= XP_THRESHOLDS[p.id]).map((p) => p.id))
  const next = VOXEL_ARMOR_PIECES.find((p) => !unlocked.has(p.id))
  if (next) {
    return `Keep mining to forge your ${next.name}!`
  }
  const tier = calculateTier(xp)
  return `Full ${tier.charAt(0) + tier.slice(1).toLowerCase()} armor! Keep earning.`
}

/** Get a celebration message consistent within a day. */
function getCelebration(today: string, isLincoln: boolean): string {
  const d = new Date(today + 'T00:00:00')
  const start = new Date(d.getFullYear(), 0, 0)
  const dayOfYear = Math.floor(
    (d.getTime() - start.getTime()) / 86400000,
  )
  const pool = isLincoln ? MC_CELEBRATIONS : CELEBRATIONS
  return pool[Math.abs(dayOfYear) % pool.length]
}

/**
 * Categorize checklist items into must-do and choose groups.
 * Falls back to treating the first 3 items as must-do if no category is set.
 */
export default function KidTodayView({
  dayLog,
  child,
  persistDayLogImmediate,
  familyId,
  today,
  weekStart,
  isMvd,
  readAloudBookId,
  weekFocus,
}: KidTodayViewProps) {
  const navigate = useNavigate()
  // Hero Hub mission CTAs deep-link /today#conundrum and /today#chapter; scroll
  // to those cards once they render (they depend on async weekFocus/bookProgress).
  useScrollToHash()
  const [selectedChoices, setSelectedChoices] = useState<Set<number>>(new Set())
  const [showCapture, setShowCapture] = useState<'photo' | 'note' | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [captureItemIndex, setCaptureItemIndex] = useState<number | null>(null)
  const [captureReflection, setCaptureReflection] = useState('')
  const [captureMessage, setCaptureMessage] = useState<{ text: string; severity: 'success' | 'error' | 'warning' } | null>(null)

  // Unified capture hook — same pipeline as parent view (AI scan → curriculum/artifact routing)
  const {
    handleUnifiedCapture,
    scanLoading: captureLoading,
  } = useUnifiedCapture({
    familyId,
    childId: child.id,
    childName: child.name,
    today,
    dayLog,
    persistDayLogImmediate,
    onMessage: setCaptureMessage,
    onArtifactCreated: (artifact) => setArtifacts((prev) => [artifact, ...prev]),
  })

  // XP toast state
  const [xpToast, setXpToast] = useState<{ amount: number; reason: string } | null>(null)

  // Draft book for "Continue your book" card + completed book for "Read your books" card
  const { draftBook } = useDraftBook(familyId, child.id)
  const { completedBook } = useCompletedBook(familyId, child.id)
  const { children: allChildren } = useActiveChild()

  // --- Chapter book progress for KidChapterPool ---
  const [selectedBook, setSelectedBook] = useState<ChapterBook | null>(null)
  // Clear book selection during render when no book ID (avoids setState in effect)
  if (!readAloudBookId && selectedBook !== null) {
    setSelectedBook(null)
  }
  useEffect(() => {
    if (!readAloudBookId) return
    const bookRef = doc(chapterBooksCollection(), readAloudBookId)
    getDoc(bookRef).then((snap) => {
      if (snap.exists()) {
        setSelectedBook({ ...(snap.data() as ChapterBook), id: snap.id })
      } else {
        setSelectedBook(null)
      }
    }).catch(() => setSelectedBook(null))
  }, [readAloudBookId])

  const { bookProgress, updateChapter } = useBookProgress(
    familyId,
    child.id,
    readAloudBookId,
  )

  const checklist = useMemo(() => dayLog.checklist ?? [], [dayLog.checklist])
  const {
    mustDo,
    choose,
    // Planned curated videos — their own bucket (FEAT-134), so they render in
    // their own always-open section instead of being locked inside "Craft 2".
    watch: watchItems,
    mustDoDone,
    mustDoRemaining,
    mustDoCompleted,
    mustDoSkipped,
    gateThreshold,
    gateUnlocked,
  } = useMemo(() => computeQuestProgress(checklist), [checklist])

  // Track which choose items have been selected (by their index in the choose array)
  const maxChoices = 2

  const selectedChoiceItems = useMemo(
    () => choose.filter((_, i) => selectedChoices.has(i)),
    [choose, selectedChoices],
  )

  // `choose` no longer carries watch rows, so an unwatched video can't hold the
  // day open — correct for an optional item (FEAT-134).
  const allDone = isDayAllDone({
    mustDoDone,
    isMvd: !!isMvd,
    choose,
    selectedChoiceItems,
  })

  const isLincoln = child.name.toLowerCase() === 'lincoln'
  const todayXp = useMemo(() => calculateXp(dayLog), [dayLog])
  const xpLedger = useXpLedger(familyId, child.id)
  const avatarProfile = useAvatarProfile(familyId, child.id)
  const [dailyArmorSession, setDailyArmorSession] = useState<DailyArmorSession | null>(null)

  const todayMinedMinutes = useTodayMiningMinutes(familyId, child.id, today)

  // Watch Vehicle (FEAT-104): resolve the videos this kid's plan already
  // references + shared completion (credit hours + artifact, no XP/concept).
  //
  // Deliberately the UNSCOPED library (FEAT-129). The D7 `childId | 'both'`
  // scope governs what a parent may *plan*; it must not govern what a planned
  // item can *resolve*. Re-scoping a video in the library editor (say `both` →
  // London) would otherwise drop it out of Lincoln's filtered list and leave an
  // already-planned item unplayable and uncompletable. Resolution is a
  // by-id `find`, so an unscoped list is a strict superset: it resolves
  // everything the filtered list did, and nothing extra is ever shown — only a
  // video this kid's own plan points at reaches the player. Same reasoning that
  // keeps retired videos resolvable here while dropping them from the picker.
  const { videos: watchVideos, loading: watchLoading, error: watchError } = useWatchLibrary()
  const watch = useWatchItemCompletion({
    familyId,
    childId: child.id,
    dayLog,
    persistDayLogImmediate,
    videos: watchVideos,
    dayLogId: today,
  })

  const greeting = useMemo(() => getGreeting(child.name, isLincoln), [child.name, isLincoln])
  const celebrationMessage = useMemo(() => getCelebration(today, isLincoln), [today, isLincoln])

  useEffect(() => {
    if (!familyId || !child.id || !today) return
    const docId = dailyArmorSessionDocId(child.id, today)
    const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
    const unsub = onSnapshot(sessionRef, async (snap) => {
      if (snap.exists()) {
        const raw = snap.data()
        setDailyArmorSession({
          ...raw,
          appliedPieces: Array.isArray(raw.appliedPieces) ? raw.appliedPieces : [],
          manuallyUnequipped: Array.isArray(raw.manuallyUnequipped) ? raw.manuallyUnequipped : [],
        })
        return
      }

      // New day — getDailyArmorSession atomically creates session
      // AND clears equippedPieces on the avatar profile
      await getDailyArmorSession(familyId, child.id)
      // onSnapshot will fire again with the new doc
    })
    return unsub
  }, [familyId, child.id, today])

  // ── Armor Gate: use unified status (not stale profile state) ──
  const armorStatus = avatarProfile
    ? getDailyArmorStatusFromSession(avatarProfile, dailyArmorSession)
    : null
  // Blocking gate stays on the active-tier `isSuitedUp` (unchanged) so the kid
  // is never locked out of Today. The greeting banner below uses the honest
  // daily-ritual axis: `isFullArmorOn` (all six slots on) vs the lighter
  // `dailyRitualDone` (every forged slot on — a 5/6 kid still wins).
  const armorReady = armorStatus?.isSuitedUp ?? false
  const isFullArmorOn = armorStatus?.isFullArmorOn ?? false
  const dailyRitualDone = armorStatus?.isDailyRitualComplete ?? false
  const slotsEquippedToday = armorStatus?.slotsEquippedToday ?? 0
  const showArmorGateBlocker = Boolean(armorStatus?.hasForgedPieces && !armorReady)
  const showArmorPrompt = Boolean(armorStatus && !armorStatus.hasForgedPieces)
  const equippedTodayVoxel = useMemo(
    () => getAppliedVoxelPieces(dailyArmorSession?.appliedPieces ?? []),
    [dailyArmorSession?.appliedPieces],
  )

  // Award XP when all must-do items are completed (once per day per child)
  const prevMustDoDoneRef = useRef(false)
  useEffect(() => {
    if (mustDoDone && !prevMustDoDoneRef.current && child.id && familyId) {
      void addXpEvent(
        familyId,
        child.id,
        'CHECKLIST_DAY_COMPLETE',
        10,
        `checklist_${today}`,
      ).then((awarded) => {
        if (awarded > 0) setXpToast({ amount: awarded, reason: 'All must-do items complete!' })
      }).catch((err) => console.error('[XP] Award failed:', err))
    }
    prevMustDoDoneRef.current = mustDoDone
  }, [mustDoDone, child.id, familyId, today])

  // Bonus XP when ALL items (must-do + choose) are completed
  const prevAllDoneRef = useRef(false)
  useEffect(() => {
    const totalItems = checklist.length
    if (allDone && !prevAllDoneRef.current && child.id && familyId && totalItems >= 3) {
      void addXpEvent(
        familyId,
        child.id,
        'DAILY_ALL_COMPLETE',
        XP_AWARDS.dailyAllComplete,
        `daily-bonus-${today}`,
        { reason: `All ${totalItems} items completed today!` },
      ).then((awarded) => {
        if (awarded > 0) setXpToast({ amount: awarded, reason: `All ${totalItems} items done — bonus!` })
      }).catch((err) => console.error('[XP] Award failed:', err))
    }
    prevAllDoneRef.current = allDone
  }, [allDone, child.id, familyId, today, checklist.length])

  // Track gate unlock for celebration display (state-during-render pattern)
  const [justUnlockedGate, setJustUnlockedGate] = useState(false)
  const [prevGateUnlocked, setPrevGateUnlocked] = useState(gateUnlocked)
  if (gateUnlocked !== prevGateUnlocked) {
    setPrevGateUnlocked(gateUnlocked)
    if (gateUnlocked) {
      setJustUnlockedGate(true)
    }
  }

  // Daily XP from checklist items
  const dailyXp = useMemo(
    () =>
      checklist
        .filter((i) => i.completed)
        .reduce((sum, item) => {
          const label = (item.label ?? '').toLowerCase()
          const isPrayer =
            label.includes('prayer') || label.includes('formation') || label.includes('scripture')
          return sum + (isPrayer ? XP_AWARDS.checklistPrayer : XP_AWARDS.checklistItem)
        }, 0),
    [checklist],
  )

  // Load artifacts for today
  const loadArtifacts = useCallback(() => {
    const q = query(
      artifactsCollection(familyId),
      where('childId', '==', child.id),
      where('dayLogId', '==', today),
    )
    getDocs(q).then((snap) => {
      setArtifacts(
        snap.docs.map((d) => ({ ...(d.data() as Artifact), id: d.id })),
      )
    })
  }, [familyId, child.id, today])

  useEffect(() => {
    loadArtifacts()
  }, [loadArtifacts])

  const handleToggleChoice = useCallback(
    (choiceIndex: number) => {
      setSelectedChoices((prev) => {
        const next = new Set(prev)
        if (next.has(choiceIndex)) {
          next.delete(choiceIndex)
        } else if (next.size < maxChoices) {
          next.add(choiceIndex)
        }
        return next
      })
    },
    [maxChoices],
  )

  const handleKidCapture = useCallback((index: number) => {
    setCaptureItemIndex(index)
    setCaptureReflection('')
  }, [])

  /** Wrapper around unified capture that closes the dialog on completion. */
  const handleKidPhotoCapture = useCallback(
    async (file: File) => {
      if (captureItemIndex === null) return
      await handleUnifiedCapture(file, captureItemIndex)
      setCaptureItemIndex(null)
      setCaptureReflection('')
    },
    [captureItemIndex, handleUnifiedCapture],
  )

  // --- Teach-back helpers ---
  const totalCompleted = useMemo(() => checklist.filter((i) => i.completed).length, [checklist])
  const hasEngagementFeedback = useMemo(
    () => checklist.some((i) => i.completed && i.engagement),
    [checklist],
  )
  const showTeachBackSection =
    !dayLog.teachBackDone && (totalCompleted >= 3 || hasEngagementFeedback)

  // Teach-back encodes the charter's "older teaches younger": only a child
  // with a younger sibling to teach sees it (relationship-derived, not a
  // name-gate). The youngest child (no one to teach) doesn't see the section.
  const youngerSibling = useMemo(
    () => findYoungerSibling(child, allChildren),
    [child, allChildren],
  )

  // ── Ritual rows (UX-C2b-1 / FEAT-118) ──
  // Each ritual's done flag is derived READ-ONLY from that ritual's own store.
  // Nothing here writes, and none of it reaches `dayLog.checklist` — the
  // unlock gate, per-item XP, rollover, and budget still read must-do checklist
  // items alone (see kidRitualRows.ts). Derived above the armor-gate early
  // return so hook order stays unconditional.
  const chapterRowVisible = Boolean(
    selectedBook && isReadAloudSectionVisible(true, bookProgress?.questionPool),
  )
  const chapterDone = useMemo(
    () => isChapterDoneToday(bookProgress?.questionPool, today),
    [bookProgress?.questionPool, today],
  )
  const conundrumVisible = Boolean(weekFocus?.conundrum)
  const conundrumDone = useConundrumDoneToday(familyId, child.id, today, conundrumVisible)
  const teachBackRowVisible = Boolean(showTeachBackSection && youngerSibling)
  const ritualsToGo = countRitualsToGo({
    chapterVisible: chapterRowVisible,
    chapterDone,
    conundrumVisible,
    conundrumDone,
    teachBackVisible: teachBackRowVisible,
  })

  // ── Armor Gate early return (after all hooks) ──
  if (avatarProfile && showArmorGateBlocker && armorStatus) {
    return (
      <ArmorGateScreen
        gateStatus={{
          complete: armorStatus.isSuitedUp,
          equipped: armorStatus.equippedCount,
          total: armorStatus.gateTotal,
          missing: armorStatus.missing,
          hasForgedPieces: armorStatus.hasForgedPieces,
        }}
        avatarProfile={avatarProfile}
        childName={child.name}
        equippedToday={equippedTodayVoxel}
      />
    )
  }

  // No plan state
  if (checklist.length === 0) {
    return (
      <Page>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          {greeting}
        </Typography>
        <SectionCard title="Today">
          <Typography variant="body1" color="text.secondary">
            No plan for today yet! Ask Mom or Dad to set one up.
          </Typography>
        </SectionCard>
        <SectionErrorBoundary section="kid capture">
          <UnifiedCaptureCard
            familyId={familyId}
            selectedChildId={child.id}
            today={today}
            weekPlanId={undefined}
            selectableChildren={[child]}
            todayArtifacts={artifacts}
            setTodayArtifacts={setArtifacts}
            onSnackMessage={setCaptureMessage}
            variant="kid"
            activeChild={child}
          />
        </SectionErrorBoundary>
        <ExplorerMap
          familyId={familyId}
          childId={child.id}
          weekStart={weekStart}
          todayDate={today}
          childName={child.name}
        />
        <Snackbar
          open={captureMessage !== null}
          autoHideDuration={2500}
          onClose={() => setCaptureMessage(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setCaptureMessage(null)}
            severity={captureMessage?.severity ?? 'success'}
            variant="filled"
            sx={{ width: '100%', fontWeight: 'bold' }}
          >
            {captureMessage?.text}
          </Alert>
        </Snackbar>
      </Page>
    )
  }

  return (
    <Page>
      {/* Greeting */}
      <Stack direction="row" alignItems="center" spacing={2}>
        {avatarProfile && (
          <Box sx={{ flexShrink: 0 }}>
            <AvatarThumbnail
              features={avatarProfile.characterFeatures}
              ageGroup={avatarProfile.ageGroup}
              equippedPieces={equippedTodayVoxel}
              totalXp={avatarProfile.totalXp}
              faceGrid={avatarProfile.faceGrid}
              size={64}
              animated
            />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {isFullArmorOn ? `Ready for battle, ${child.name}!` : greeting}
          </Typography>
          {isFullArmorOn && (
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : 'monospace',
                fontSize: isLincoln ? '0.4rem' : '12px',
                color: 'text.secondary',
              }}
            >
              Full armor on. Let's go!
            </Typography>
          )}
          {!isFullArmorOn && dailyRitualDone && (
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : 'monospace',
                fontSize: isLincoln ? '0.4rem' : '12px',
                color: 'text.secondary',
                mt: 0.25,
              }}
            >
              Suited up for today ✓ — {slotsEquippedToday}/6 pieces on
            </Typography>
          )}
          {!dailyRitualDone && avatarProfile && (
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : 'monospace',
                fontSize: isLincoln ? '0.4rem' : '12px',
                color: 'text.secondary',
                mt: 0.25,
              }}
            >
              {getMotivation(avatarProfile)}
            </Typography>
          )}
          {showArmorPrompt && (
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : 'monospace',
                fontSize: isLincoln ? '0.4rem' : '12px',
                color: 'text.secondary',
                mt: 0.25,
              }}
            >
              No armor forged yet—want to visit Avatar and craft your first piece?
            </Typography>
          )}
          {todayXp > 0 && (
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.55rem' : '0.75rem',
                color: isLincoln ? kidPalette.xpGreen : 'success.main',
                textShadow: isLincoln ? '1px 1px 0 rgba(0,0,0,0.3)' : undefined,
                mt: 0.5,
              }}
            >
              +{todayXp} XP today
            </Typography>
          )}
        </Box>
      </Stack>

      {/* XP bar + Diamond count — one strip, tier identity + momentum, no goal numbers */}
      {!xpLedger.loading && (
        <XpDiamondBar familyId={familyId} childId={child.id} compact earningMode />
      )}

      {justUnlockedGate && (
        <Stack alignItems="center" sx={{ py: 1 }}>
          <Typography variant="body1" fontWeight={700} color="success.main">
            🔓 Workshop + Books unlocked! Great work!
          </Typography>
        </Stack>
      )}

      {/* Morning verse */}
      {weekFocus?.scriptureRef && (
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'grey.50', mb: 2 }}>
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            📖 {weekFocus.scriptureRef}
          </Typography>
        </Box>
      )}

      {/* ── ONE LIST (UX-C2b-1 / FEAT-118) ──
          Owner-set order: chapter → must-do checklist → conundrum → teach-back
          → mining. Each ritual is a row of the same list, with a READ-ONLY done
          flag derived from its own store; none of them is written into
          `dayLog.checklist` (see kidRitualRows.ts). */}

      {/* ── CHAPTER ROW ── */}
      {chapterRowVisible && selectedBook && (
        <SectionErrorBoundary section="chapter pool">
          <KidRitualRow
            icon="📖"
            title={selectedBook.title}
            subtitle={chapterDone ? 'Answered today' : "Talk about today's chapter"}
            done={chapterDone}
            isLincoln={isLincoln}
            defaultExpanded={!chapterDone}
            anchorId="chapter"
          >
            {bookProgress && isChapterPoolVisible(bookProgress.questionPool) ? (
              <KidChapterPool
                book={selectedBook}
                bookProgress={bookProgress}
                familyId={familyId}
                childId={child.id}
                dayLog={dayLog}
                weekFocus={weekFocus}
                onChapterAnswered={updateChapter}
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                This is today&apos;s read-aloud book. A grown-up will read it with
                you and add questions to talk about.
              </Typography>
            )}
          </KidRitualRow>
        </SectionErrorBoundary>
      )}

      {/* MVD warm message */}
      {isMvd && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
          Light day today. Just these {mustDo.length}!
        </Typography>
      )}

      {/* ── CHECKLIST (Must-Do + Watch + Choose) — the spine of the one list ── */}
      <SectionErrorBoundary section="checklist">
        <KidChecklist
          mustDo={mustDo}
          choose={choose}
          watch={watchItems}
          checklist={checklist}
          maxChoices={maxChoices}
          isLincoln={isLincoln}
          isMvd={!!isMvd}
          gateUnlocked={gateUnlocked}
          gateThreshold={gateThreshold}
          mustDoCompleted={mustDoCompleted}
          mustDoSkipped={mustDoSkipped}
          mustDoDone={mustDoDone}
          mustDoRemaining={mustDoRemaining}
          ritualsRemaining={ritualsToGo}
          dailyXp={dailyXp}
          selectedChoices={selectedChoices}
          onToggleChoice={handleToggleChoice}
          dayLog={dayLog}
          child={child}
          familyId={familyId}
          today={today}
          persistDayLogImmediate={persistDayLogImmediate}
          onCaptureOpen={handleKidCapture}
          onXpToast={setXpToast}
          onWatchOpen={watch.openWatch}
        />
      </SectionErrorBoundary>

      {/* ── CONUNDRUM ROW ── */}
      {weekFocus?.conundrum && (
        <SectionErrorBoundary section="conundrum">
          <KidRitualRow
            icon="💭"
            title={weekFocus.conundrum.title}
            subtitle={conundrumDone ? 'Answered today' : 'Think about it'}
            done={conundrumDone}
            isLincoln={isLincoln}
            defaultExpanded={!conundrumDone}
            anchorId="conundrum"
          >
            <KidConundrumResponse
              conundrum={weekFocus.conundrum}
              isLincoln={isLincoln}
              child={child}
              familyId={familyId}
            />
          </KidRitualRow>
        </SectionErrorBoundary>
      )}

      {/* ── TEACH-BACK ROW (older teaches younger) ── */}
      {teachBackRowVisible && youngerSibling && (
        <SectionErrorBoundary section="teach-back">
          <KidRitualRow
            icon="🗣️"
            title={`Teach ${youngerSibling.name} something`}
            subtitle="Tell them one thing you learned"
            isLincoln={isLincoln}
            defaultExpanded={false}
          >
            <KidTeachBack
              child={child}
              recipientName={youngerSibling.name}
              familyId={familyId}
              today={today}
              dayLog={dayLog}
              persistDayLogImmediate={persistDayLogImmediate}
            />
          </KidRitualRow>
        </SectionErrorBoundary>
      )}

      {/* ── MINING ROW ──
          Always open, no checkbox, and excluded from the finish-line count:
          mining accrues minutes and has no "done" (owner decision #3). */}
      <SectionErrorBoundary section="knowledge-mine">
        <KidRitualRow
          icon="⛏️"
          title="Knowledge Mine"
          subtitle={todayMinedMinutes > 0 ? `${todayMinedMinutes} min today` : 'No mining yet today'}
          isLincoln={isLincoln}
          alwaysOpen
        >
          <Button
            fullWidth
            size="large"
            variant="contained"
            onClick={() => navigate('/quest')}
            sx={
              isLincoln
                ? {
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '0.5rem',
                    bgcolor: kidPalette.darkStone,
                    color: kidPalette.diamond,
                    minHeight: 48,
                    '&:hover': { bgcolor: '#4C4C4C' },
                  }
                : { minHeight: 48 }
            }
          >
            ⛏️ Start Mining
          </Button>
        </KidRitualRow>
      </SectionErrorBoundary>

      {/* Workshop game cards — gated behind must-do progress */}
      {familyId && allChildren.length > 0 && (
        gateUnlocked ? (
          <WorkshopGameCards familyId={familyId} childId={child.id} children={allChildren} />
        ) : (
          <SectionCard title="🔒 Game Workshop">
            <Stack spacing={1} alignItems="center" sx={{ py: 2 }}>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Complete {gateThreshold - mustDoCompleted} more quest{gateThreshold - mustDoCompleted !== 1 ? 's' : ''} to unlock!
              </Typography>
              <Stack direction="row" spacing={0.5}>
                {Array.from({ length: gateThreshold }).map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 16, height: 16, borderRadius: '50%',
                      bgcolor: i < mustDoCompleted ? 'success.main' : 'action.disabledBackground',
                    }}
                  />
                ))}
              </Stack>
            </Stack>
          </SectionCard>
        )
      )}

      {/* ── I DID MORE MINING! ── */}
      {(
        <KidExtraLogger
          dayLog={dayLog}
          persistDayLogImmediate={persistDayLogImmediate}
          familyId={familyId}
          childId={child.id}
          today={today}
        />
      )}

      {/* ── UNIFIED CAPTURE (kid variant) ── */}
      <SectionErrorBoundary section="kid capture">
        <UnifiedCaptureCard
          familyId={familyId}
          selectedChildId={child.id}
          today={today}
          weekPlanId={undefined}
          selectableChildren={[child]}
          todayArtifacts={artifacts}
          setTodayArtifacts={setArtifacts}
          onSnackMessage={setCaptureMessage}
          variant="kid"
          activeChild={child}
        />
      </SectionErrorBoundary>

      {/* ── CONTINUE YOUR BOOK (gated) ── */}
      {draftBook && (
        gateUnlocked ? (
          <Box
            onClick={() => navigate(`/books/${draftBook.id}`)}
            sx={{
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: isLincoln ? 'grey.700' : 'info.200',
              bgcolor: isLincoln ? 'rgba(0,0,0,0.6)' : 'info.50',
              cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <MenuBookIcon sx={{ color: isLincoln ? kidPalette.gold : 'info.main', fontSize: 28 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 600,
                    ...(isLincoln
                      ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.55rem', color: '#FFFFFF' }
                      : {}),
                  }}
                >
                  {isLincoln ? 'Continue crafting your book' : 'Continue your book'}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: isLincoln ? 'rgba(255,255,255,0.6)' : 'text.secondary',
                    ...(isLincoln ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.4rem' } : {}),
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  &ldquo;{draftBook.title}&rdquo; — {draftBook.pages.length} page{draftBook.pages.length !== 1 ? 's' : ''}
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  color: isLincoln ? kidPalette.gold : 'info.main',
                  fontWeight: 600,
                  ...(isLincoln ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.45rem' } : {}),
                }}
              >
                Open
              </Typography>
            </Stack>
          </Box>
        ) : (
          <Chip label="🔒 Finish quests first" variant="outlined" />
        )
      )}

      {/* ── READ YOUR BOOKS (gated, only if no draft) ── */}
      {!draftBook && completedBook && (
        gateUnlocked ? (
          <Box
            onClick={() => navigate(`/books/${completedBook.id}/read`)}
            sx={{
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: isLincoln ? 'grey.700' : 'success.200',
              bgcolor: isLincoln ? 'rgba(0,0,0,0.6)' : 'success.50',
              cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <MenuBookIcon sx={{ color: isLincoln ? kidPalette.diamond : 'success.main', fontSize: 28 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 600,
                    ...(isLincoln
                      ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.55rem', color: '#FFFFFF' }
                      : {}),
                  }}
                >
                  {isLincoln ? 'Read your book' : 'Read your book'}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: isLincoln ? 'rgba(255,255,255,0.6)' : 'text.secondary',
                    ...(isLincoln ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.4rem' } : {}),
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  &ldquo;{completedBook.title}&rdquo;
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  color: isLincoln ? kidPalette.diamond : 'success.main',
                  fontWeight: 600,
                  ...(isLincoln ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.45rem' } : {}),
                }}
              >
                Read
              </Typography>
            </Stack>
          </Box>
        ) : (
          <Chip label="🔒 Finish quests first" variant="outlined" />
        )
      )}

      {/* ── CELEBRATION ── */}
      <SectionErrorBoundary section="celebration">
        <KidCelebration
          allDone={allDone}
          mustDoDone={mustDoDone}
          isMvd={!!isMvd}
          celebrationMessage={celebrationMessage}
          isLincoln={isLincoln}
          child={child}
        />
      </SectionErrorBoundary>

      {/* ── EXPLORER MAP ── */}
      <ExplorerMap
        familyId={familyId}
        childId={child.id}
        weekStart={weekStart}
        todayDate={today}
        childName={child.name}
      />

      {/* ── MY STUFF ── */}
      <SectionCard title={isLincoln ? '🧰 Inventory' : '📸 My Stuff'}>
        {/* Quick capture buttons */}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<CameraAltIcon />}
            onClick={() => setShowCapture('photo')}
            sx={{ minHeight: 48 }}
          >
            Add Photo
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<NoteIcon />}
            onClick={() => setShowCapture('note')}
            sx={{ minHeight: 48 }}
          >
            Add Note
          </Button>
        </Stack>

        {/* Capture form */}
        {showCapture && (
          <KidCaptureForm
            type={showCapture}
            familyId={familyId}
            childId={child.id}
            today={today}
            onSave={() => {
              setShowCapture(null)
              loadArtifacts()
            }}
            onCancel={() => setShowCapture(null)}
          />
        )}

        {/* Artifacts list */}
        {artifacts.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            {isLincoln
              ? 'Nothing in your inventory yet. Capture your builds!'
              : 'Nothing captured yet today. Take a photo of your work!'}
          </Typography>
        ) : (
          <Stack spacing={1}>
            {artifacts.map((artifact) => (
              <Stack
                key={artifact.id}
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}
              >
                {artifact.type === 'Photo' && artifact.uri && (
                  <Box
                    component="img"
                    src={artifact.uri}
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 1,
                      objectFit: 'cover',
                    }}
                  />
                )}
                {artifact.type === 'Note' && (
                  <NoteIcon color="action" />
                )}
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {artifact.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(artifact.createdAt ?? '').toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </SectionCard>

      {/* --- Per-item capture dialog for kids --- */}
      <Dialog open={captureItemIndex !== null} onClose={() => !captureLoading && setCaptureItemIndex(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {captureItemIndex !== null ? dayLog.checklist?.[captureItemIndex]?.label?.replace(/\s*\(\d+m\)/, '') : ''}
        </DialogTitle>
        <DialogContent>
          {captureLoading ? (
            <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
              <CircularProgress size={48} />
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {isLincoln ? 'Analyzing your work...' : 'Saving your work...'}
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <PhotoCapture onCapture={(file: File) => { void handleKidPhotoCapture(file) }} />
              <TextField
                label="How did it go? (optional)"
                placeholder={isLincoln ? 'I got the hard one!' : 'It was fun!'}
                value={captureReflection}
                onChange={(e) => setCaptureReflection(e.target.value)}
                size="small"
                multiline
                rows={2}
              />
            </Stack>
          )}
        </DialogContent>
      </Dialog>
      {/* Kid-friendly capture feedback (no scan analysis details) */}
      <Snackbar
        open={captureMessage !== null}
        autoHideDuration={2500}
        onClose={() => setCaptureMessage(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setCaptureMessage(null)}
          severity={captureMessage?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%', fontWeight: 'bold' }}
        >
          {captureMessage?.text}
        </Alert>
      </Snackbar>
      <Snackbar
        open={xpToast !== null}
        autoHideDuration={2000}
        onClose={() => setXpToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setXpToast(null)}
          severity="success"
          variant="filled"
          sx={{ width: '100%', fontWeight: 'bold' }}
        >
          +{xpToast?.amount} XP — {xpToast?.reason}
        </Alert>
      </Snackbar>

      {/* Watch Vehicle — planned curated-video player (FEAT-104). */}
      <WatchItemDialog
        video={watch.watchVideo}
        open={watch.watchTarget !== null}
        loading={watchLoading}
        error={watchError}
        onClose={watch.closeWatch}
        onComplete={watch.completeWatch}
        voiceProfile={{ id: child.id, voiceInputEnhanced: child.voiceInputEnhanced }}
      />
    </Page>
  )
}
