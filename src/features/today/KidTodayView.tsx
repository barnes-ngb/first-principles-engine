import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import NoteIcon from '@mui/icons-material/Note'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { addDoc, doc, getDocs, query, updateDoc, where, orderBy } from 'firebase/firestore'

import { useNavigate } from 'react-router-dom'
import MenuBookIcon from '@mui/icons-material/MenuBook'

import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'
import { artifactsCollection, evaluationSessionsCollection } from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import type { Artifact, ChecklistItem, Child, DayLog } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { XP_AWARDS } from '../avatar/xpAwards'
import AvatarThumbnail from '../avatar/AvatarThumbnail'
import { useAvatarProfile } from '../avatar/useAvatarProfile'
import { getArmorGateStatus } from '../avatar/armorGate'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from '../avatar/voxel/buildArmorPiece'
import { calculateTier } from '../avatar/voxel/tierMaterials'
import ArmorGateScreen from '../avatar/ArmorGateScreen'
import MinecraftXpBar from '../avatar/MinecraftXpBar'
import { useXpLedger } from '../../core/xp/useXpLedger'
import { useDraftBook } from '../books/useBook'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import ExplorerMap from './ExplorerMap'
import KidExtraLogger from './KidExtraLogger'
import WorkshopGameCards from './WorkshopGameCards'
import KidCaptureForm from './KidCaptureForm'
import KidChecklist from './KidChecklist'
import KidCelebration from './KidCelebration'
import KidChapterResponse from './KidChapterResponse'
import KidConundrumResponse from './KidConundrumResponse'
import KidTeachBack from './KidTeachBack'
import { calculateXp } from './xp'
import type { EvaluationSession } from '../../core/types'
import type { InteractiveSessionData } from '../quest/questTypes'

type QuestSession = EvaluationSession & Partial<InteractiveSessionData>

/** Query today's completed quest sessions for a child. */
function useTodayQuests(familyId: string, childId: string, today: string) {
  const [quests, setQuests] = useState<QuestSession[]>([])
  const [streakDays, setStreakDays] = useState(0)

  useEffect(() => {
    if (!childId || !familyId) return
    const todayStart = today + 'T00:00:00'
    const todayEnd = today + 'T23:59:59'
    const q = query(
      evaluationSessionsCollection(familyId),
      where('childId', '==', childId),
      where('sessionType', '==', 'interactive'),
      where('status', '==', 'complete'),
      where('evaluatedAt', '>=', todayStart),
      where('evaluatedAt', '<=', todayEnd),
      orderBy('evaluatedAt', 'desc'),
    )
    getDocs(q).then((snap) => {
      const sessions = snap.docs.map((d) => ({ ...(d.data() as QuestSession), id: d.id }))
      setQuests(sessions)
      // Use the streak from the most recent session
      if (sessions.length > 0 && sessions[0].streakDays) {
        setStreakDays(sessions[0].streakDays)
      }
    }).catch((err) => console.error('[Quests] Load failed:', err))
  }, [familyId, childId, today])

  const totalDiamonds = quests.reduce((sum, s) => sum + (s.diamondsMined ?? 0), 0)
  const domains = [...new Set(quests.map((s) => s.domain).filter(Boolean))]
  const maxLevel = quests.reduce((max, s) => Math.max(max, s.finalLevel ?? 0), 0)

  return { quests, totalDiamonds, domains, maxLevel, streakDays }
}

/** Compact Minecraft-styled card showing today's quest results or an invite to mine. */
function DiamondsMined({
  totalDiamonds,
  domains,
  maxLevel,
  streakDays,
  hasQuests,
  isLincoln,
  onMineMore,
}: {
  totalDiamonds: number
  domains: string[]
  maxLevel: number
  streakDays: number
  hasQuests: boolean
  isLincoln: boolean
  onMineMore: () => void
}) {
  const mcFont = isLincoln ? '"Press Start 2P", monospace' : 'monospace'

  if (!hasQuests) {
    return (
      <Box
        onClick={onMineMore}
        sx={{
          p: 2,
          borderRadius: 2,
          bgcolor: isLincoln ? 'rgba(0,0,0,0.6)' : 'grey.50',
          border: '1px solid',
          borderColor: isLincoln ? 'grey.700' : 'divider',
          cursor: 'pointer',
          '&:hover': { borderColor: 'primary.main' },
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography sx={{ fontSize: '1.5rem' }}>⛏️</Typography>
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 600,
                ...(isLincoln ? { fontFamily: mcFont, fontSize: '0.55rem', color: '#FFFFFF' } : {}),
              }}
            >
              Ready to mine?
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: isLincoln ? 'rgba(255,255,255,0.6)' : 'text.secondary',
                ...(isLincoln ? { fontFamily: mcFont, fontSize: '0.4rem' } : {}),
              }}
            >
              Start a Knowledge Mine quest
            </Typography>
          </Box>
          <Typography
            sx={{
              color: isLincoln ? '#5BFCEE' : 'primary.main',
              fontWeight: 600,
              ...(isLincoln ? { fontFamily: mcFont, fontSize: '0.45rem' } : {}),
            }}
          >
            Go
          </Typography>
        </Stack>
      </Box>
    )
  }

  const domainLabel = domains.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(' · ')

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: isLincoln ? 'rgba(0,0,0,0.75)' : 'grey.50',
        border: '1px solid',
        borderColor: isLincoln ? '#5BFCEE' : 'info.light',
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: '1.2rem' }}>⛏️</Typography>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            ...(isLincoln ? { fontFamily: mcFont, fontSize: '0.5rem', color: '#FFFFFF' } : {}),
          }}
        >
          Today&apos;s Mining
        </Typography>
        {streakDays > 1 && (
          <Chip
            label={`\uD83D\uDD25 ${streakDays} day streak!`}
            size="small"
            sx={{
              bgcolor: isLincoln ? 'rgba(252,219,91,0.2)' : 'warning.50',
              color: isLincoln ? '#FCDB5B' : 'warning.dark',
              fontWeight: 600,
              ...(isLincoln ? { fontFamily: mcFont, fontSize: '0.35rem' } : {}),
            }}
          />
        )}
      </Stack>
      <Typography
        sx={{
          fontSize: '1.2rem',
          letterSpacing: 2,
          mb: 0.5,
        }}
      >
        {'💎'.repeat(Math.min(totalDiamonds, 10))}
        {totalDiamonds > 10 && ' ...'}
      </Typography>
      <Typography
        sx={{
          fontFamily: mcFont,
          fontSize: isLincoln ? '0.5rem' : '0.85rem',
          color: isLincoln ? '#5BFCEE' : 'info.main',
          fontWeight: 700,
          mb: 0.5,
        }}
      >
        {totalDiamonds} diamond{totalDiamonds !== 1 ? 's' : ''} mined!
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: isLincoln ? 'rgba(255,255,255,0.6)' : 'text.secondary',
          ...(isLincoln ? { fontFamily: mcFont, fontSize: '0.35rem' } : {}),
        }}
      >
        {domainLabel} · Level {maxLevel}
      </Typography>
      <Box sx={{ mt: 1.5 }}>
        <Button
          size="small"
          variant={isLincoln ? 'contained' : 'outlined'}
          onClick={onMineMore}
          sx={isLincoln ? {
            fontFamily: mcFont,
            fontSize: '0.4rem',
            bgcolor: '#3C3C3C',
            color: '#5BFCEE',
            '&:hover': { bgcolor: '#4C4C4C' },
          } : {}}
        >
          Mine More →
        </Button>
      </Box>
    </Box>
  )
}

interface KidTodayViewProps {
  dayLog: DayLog
  child: Child
  persistDayLogImmediate: (updated: DayLog) => void
  familyId: string
  today: string
  weekStart: string
  isMvd?: boolean
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
    const xpAway = XP_THRESHOLDS[next.id] - xp
    return `${xpAway} XP to ${next.name}!`
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
function categorizeItems(checklist: ChecklistItem[]): {
  mustDo: ChecklistItem[]
  choose: ChecklistItem[]
} {
  const hasCategories = checklist.some((item) => item.category)

  if (hasCategories) {
    return {
      mustDo: checklist.filter(
        (item) => item.category === 'must-do' || (!item.category && item.mvdEssential),
      ),
      choose: checklist.filter((item) => item.category === 'choose'),
    }
  }

  // Fallback: first 3 items are must-do, rest are choose
  return {
    mustDo: checklist.slice(0, Math.min(3, checklist.length)),
    choose: checklist.slice(3),
  }
}

export default function KidTodayView({
  dayLog,
  child,
  persistDayLogImmediate,
  familyId,
  today,
  weekStart,
  isMvd,
  weekFocus,
}: KidTodayViewProps) {
  const navigate = useNavigate()
  const [selectedChoices, setSelectedChoices] = useState<Set<number>>(new Set())
  const [showCapture, setShowCapture] = useState<'photo' | 'note' | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [captureItemIndex, setCaptureItemIndex] = useState<number | null>(null)
  const [captureReflection, setCaptureReflection] = useState('')

  // XP toast state
  const [xpToast, setXpToast] = useState<{ amount: number; reason: string } | null>(null)

  // Draft book for "Continue your book" card
  const { draftBook } = useDraftBook(familyId, child.id)
  const { children: allChildren } = useActiveChild()

  const checklist = useMemo(() => dayLog.checklist ?? [], [dayLog.checklist])
  const { mustDo, choose } = useMemo(() => categorizeItems(checklist), [checklist])

  const mustDoDone = mustDo.length > 0 && mustDo.every((item) => item.completed)
  const mustDoRemaining = mustDo.filter((item) => !item.completed && !item.skipped).length

  // Gate: 3+ must-do items completed unlocks Workshop and Books
  const mustDoCompleted = mustDo.filter((i) => i.completed).length
  const mustDoSkipped = mustDo.filter((i) => i.skipped).length
  const gateThreshold = Math.min(3, mustDo.length)
  const gateUnlocked = mustDoCompleted >= gateThreshold

  // Track which choose items have been selected (by their index in the choose array)
  const maxChoices = 2

  const selectedChoiceItems = useMemo(
    () => choose.filter((_, i) => selectedChoices.has(i)),
    [choose, selectedChoices],
  )

  const allDone =
    mustDoDone &&
    (isMvd || choose.length === 0 || selectedChoiceItems.every((item) => item.completed))

  const isLincoln = child.name.toLowerCase() === 'lincoln'
  const todayXp = useMemo(() => calculateXp(dayLog), [dayLog])
  const xpLedger = useXpLedger(familyId, child.id)
  const avatarProfile = useAvatarProfile(familyId, child.id)

  const { totalDiamonds, domains, maxLevel, streakDays, quests: todayQuests } = useTodayQuests(familyId, child.id, today)

  const greeting = useMemo(() => getGreeting(child.name, isLincoln), [child.name, isLincoln])
  const celebrationMessage = useMemo(() => getCelebration(today, isLincoln), [today, isLincoln])

  // ── Armor Gate: block Today until all unlocked pieces are equipped ──
  const armorGateStatus = avatarProfile ? getArmorGateStatus(avatarProfile) : null
  const armorReady = armorGateStatus?.complete ?? false

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

  const handleKidPhotoCapture = useCallback(
    async (file: File) => {
      if (captureItemIndex === null || !dayLog.checklist) return
      const item = dayLog.checklist[captureItemIndex]
      try {
        const artifact: Omit<Artifact, 'id'> = {
          childId: child.id,
          title: `${item.label.replace(/\s*\(\d+m\)/, '')} — ${child.name}'s work`,
          type: EvidenceType.Photo,
          dayLogId: today,
          createdAt: new Date().toISOString(),
          tags: {
            engineStage: EngineStage.Build,
            domain: '',
            subjectBucket: item.subjectBucket ?? SubjectBucket.Other,
            location: 'Home',
          },
          ...(captureReflection ? { notes: captureReflection } : {}),
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })

        // Link artifact to checklist item
        const updatedChecklist = dayLog.checklist.map((ci, i) =>
          i === captureItemIndex ? { ...ci, evidenceArtifactId: docRef.id } : ci
        )
        persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
        setArtifacts((prev) => [{ ...artifact, id: docRef.id, uri: downloadUrl } as Artifact, ...prev])
        setCaptureItemIndex(null)
        setCaptureReflection('')
      } catch (err) {
        console.error('Kid capture failed:', err)
      }
    },
    [captureItemIndex, captureReflection, dayLog, child, today, familyId, persistDayLogImmediate],
  )

  // --- Teach-back helpers (Lincoln audio capture) ---
  const totalCompleted = useMemo(() => checklist.filter((i) => i.completed).length, [checklist])
  const hasEngagementFeedback = useMemo(
    () => checklist.some((i) => i.completed && i.engagement),
    [checklist],
  )
  const showTeachBackSection =
    isLincoln && !dayLog.teachBackDone && (totalCompleted >= 3 || hasEngagementFeedback)

  // ── Armor Gate early return (after all hooks) ──
  if (avatarProfile && !armorReady && armorGateStatus) {
    return (
      <ArmorGateScreen
        gateStatus={armorGateStatus}
        avatarProfile={avatarProfile}
        childName={child.name}
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
        <ExplorerMap
          familyId={familyId}
          childId={child.id}
          weekStart={weekStart}
          todayDate={today}
          childName={child.name}
        />
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
              equippedPieces={avatarProfile.equippedPieces ?? []}
              totalXp={avatarProfile.totalXp}
              faceGrid={avatarProfile.faceGrid}
              size={64}
              animated
            />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {armorReady ? `Ready for battle, ${child.name}!` : greeting}
          </Typography>
          {armorReady && (
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
          {!armorReady && avatarProfile && (
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
          {todayXp > 0 && (
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.55rem' : '0.75rem',
                color: isLincoln ? '#7EFC20' : 'success.main',
                textShadow: isLincoln ? '1px 1px 0 rgba(0,0,0,0.3)' : undefined,
                mt: 0.5,
              }}
            >
              +{todayXp} XP today
            </Typography>
          )}
        </Box>
      </Stack>

      {/* XP bar (Lincoln only) */}
      {isLincoln && !xpLedger.loading && (
        <MinecraftXpBar totalXp={xpLedger.totalXp} todayXp={todayXp} compact />
      )}

      {/* Gate banner */}
      {!gateUnlocked && checklist.length > 0 && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="center"
          sx={{
            py: 1,
            px: 2,
            bgcolor: 'warning.light',
            borderRadius: 1,
            opacity: 0.9,
          }}
        >
          <Typography variant="body2" fontWeight={600}>
            ⛏️ {mustDoCompleted}/{gateThreshold} quests done
          </Typography>
          <Typography variant="body2" color="text.secondary">
            — complete {gateThreshold - mustDoCompleted} more to unlock Workshop + Books!
          </Typography>
        </Stack>
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

      {/* Diamonds Mined — today's quest summary */}
      <SectionErrorBoundary section="diamonds-mined">
        <DiamondsMined
          totalDiamonds={totalDiamonds}
          domains={domains}
          maxLevel={maxLevel}
          streakDays={streakDays}
          hasQuests={todayQuests.length > 0}
          isLincoln={isLincoln}
          onMineMore={() => navigate('/quest')}
        />
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

      {/* MVD warm message */}
      {isMvd && (
        <Typography variant="body1" color="text.secondary" sx={{ mt: -1 }}>
          Light day today. Just these {mustDo.length}!
        </Typography>
      )}

      {/* ── I DID MORE MINING! (Lincoln only) ── */}
      {isLincoln && (
        <KidExtraLogger
          dayLog={dayLog}
          persistDayLogImmediate={persistDayLogImmediate}
        />
      )}

      {/* ── CHECKLIST (Must-Do + Choose) ── */}
      <SectionErrorBoundary section="checklist">
        <KidChecklist
          mustDo={mustDo}
          choose={choose}
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
        />
      </SectionErrorBoundary>

      {/* ── CHAPTER RESPONSE (Lincoln only) ── */}
      {dayLog?.chapterQuestion && isLincoln && (
        <SectionErrorBoundary section="chapter response">
          <KidChapterResponse
            dayLog={dayLog}
            child={child}
            familyId={familyId}
            persistDayLogImmediate={persistDayLogImmediate}
          />
        </SectionErrorBoundary>
      )}

      {/* ── CONUNDRUM RESPONSE ── */}
      {weekFocus?.conundrum && (
        <KidConundrumResponse
          conundrum={weekFocus.conundrum}
          isLincoln={isLincoln}
          child={child}
          familyId={familyId}
        />
      )}

      {/* ── TEACH-BACK (Lincoln only) ── */}
      {showTeachBackSection && (
        <SectionErrorBoundary section="teach-back">
          <KidTeachBack
            child={child}
            familyId={familyId}
            today={today}
            dayLog={dayLog}
            persistDayLogImmediate={persistDayLogImmediate}
          />
        </SectionErrorBoundary>
      )}

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
              <MenuBookIcon sx={{ color: isLincoln ? '#FCDB5B' : 'info.main', fontSize: 28 }} />
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
                  color: isLincoln ? '#FCDB5B' : 'info.main',
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
      <Dialog open={captureItemIndex !== null} onClose={() => setCaptureItemIndex(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {captureItemIndex !== null ? dayLog.checklist?.[captureItemIndex]?.label?.replace(/\s*\(\d+m\)/, '') : ''}
        </DialogTitle>
        <DialogContent>
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
        </DialogContent>
      </Dialog>
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
    </Page>
  )
}
