import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import LockIcon from '@mui/icons-material/Lock'
import NoteIcon from '@mui/icons-material/Note'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { addDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore'

import { useNavigate } from 'react-router-dom'
import MenuBookIcon from '@mui/icons-material/MenuBook'

import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { artifactsCollection } from '../../core/firebase/firestore'
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
import KidChapterResponse from './KidChapterResponse'
import KidConundrumResponse from './KidConundrumResponse'
import KidTeachBack from './KidTeachBack'
import { calculateXp } from './xp'

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

function getTimeLabel(minutes?: number): string {
  if (!minutes) return ''
  return `${minutes} min`
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

  const handleToggleItem = useCallback(
    (itemIndex: number) => {
      const updated = { ...dayLog }
      const updatedChecklist = [...(updated.checklist ?? [])]
      if (itemIndex < 0 || itemIndex >= updatedChecklist.length) return
      const item = updatedChecklist[itemIndex]
      const nowComplete = !item.completed
      updatedChecklist[itemIndex] = { ...item, completed: nowComplete }
      persistDayLogImmediate({ ...updated, checklist: updatedChecklist })

      // Award per-item XP when checked (not unchecked)
      if (nowComplete && child.id && familyId) {
        const label = (item.label ?? '').toLowerCase()
        const isPrayer = label.includes('prayer') || label.includes('formation') || label.includes('scripture') || label.includes('devotion')
        const xpAmount = isPrayer ? XP_AWARDS.checklistPrayer : XP_AWARDS.checklistItem
        const dedupKey = `item-${item.id ?? itemIndex}-${today}`
        void addXpEvent(familyId, child.id, isPrayer ? 'CHECKLIST_PRAYER' : 'CHECKLIST_ITEM', xpAmount, dedupKey, {
          reason: item.label ?? 'checklist item',
        }).then((awarded) => {
          if (awarded > 0) setXpToast({ amount: awarded, reason: item.label ?? 'checklist item' })
        }).catch((err) => console.error('[XP] Award failed:', err))
      }
    },
    [dayLog, persistDayLogImmediate, child.id, familyId, today],
  )

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

  const handleSkipItem = useCallback(
    (itemIndex: number) => {
      if (!dayLog?.checklist) return
      const updated = dayLog.checklist.map((ci, i) =>
        i === itemIndex ? { ...ci, skipped: true } : ci,
      )
      persistDayLogImmediate({ ...dayLog, checklist: updated })
    },
    [dayLog, persistDayLogImmediate],
  )

  /** Find the absolute index in the full checklist for a choose item. */
  const getAbsoluteIndex = useCallback(
    (chooseItem: ChecklistItem) => {
      return checklist.indexOf(chooseItem)
    },
    [checklist],
  )

  const handleSetMastery = useCallback((itemIndex: number, mastery: 'got-it' | 'working' | 'stuck') => {
    if (!dayLog?.checklist) return
    const updated = dayLog.checklist.map((ci, i) =>
      i === itemIndex ? { ...ci, mastery } : ci
    )
    persistDayLogImmediate({ ...dayLog, checklist: updated })
  }, [dayLog, persistDayLogImmediate])

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

      {/* ── MUST DO ── */}
      <SectionCard title={isLincoln ? '⛏️ Daily Quests' : 'Must Do'}>
        <Stack spacing={1}>
          {mustDo.map((item) => {
            const absIndex = checklist.indexOf(item)
            const isBookItem = /book/i.test(item.label)

            if (item.skipped) {
              return (
                <Box key={absIndex} sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover', minHeight: 56, display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ textDecoration: 'line-through', opacity: 0.4, flex: 1 }}>
                    {item.label} — skipped
                  </Typography>
                </Box>
              )
            }

            return (
              <Box key={absIndex}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    p: 1,
                    borderRadius: 2,
                    bgcolor: item.completed ? 'success.50' : 'background.paper',
                    border: '1px solid',
                    borderColor: item.completed ? 'success.200' : 'divider',
                    minHeight: 56,
                    cursor: 'pointer',
                  }}
                  onClick={() => handleToggleItem(absIndex)}
                >
                  <Checkbox
                    checked={item.completed}
                    sx={{
                      '& .MuiSvgIcon-root': { fontSize: 28 },
                      p: 0.5,
                    }}
                    color="success"
                    tabIndex={-1}
                  />
                  <Typography
                    variant="body1"
                    sx={{
                      flex: 1,
                      textDecoration: item.completed ? 'line-through' : 'none',
                      color: item.completed ? 'text.secondary' : 'text.primary',
                      fontWeight: 500,
                    }}
                  >
                    {isBookItem && <MenuBookIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'text-bottom' }} />}
                    {item.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.completed ? '✓' : getTimeLabel(item.estimatedMinutes ?? item.plannedMinutes)}
                  </Typography>
                  {!item.completed && (
                    <Button
                      size="small"
                      variant="text"
                      color="inherit"
                      onClick={(e) => { e.stopPropagation(); handleSkipItem(absIndex) }}
                      sx={{ opacity: 0.5, fontSize: '0.75rem', minWidth: 'auto', ml: 1 }}
                    >
                      Skip
                    </Button>
                  )}
                </Stack>
                {/* Book item quick link */}
                {isBookItem && !item.completed && (
                  <Box sx={{ ml: 5, mt: 0.5 }}>
                    {gateUnlocked ? (
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<MenuBookIcon />}
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(item.bookId ? `/books/${item.bookId}` : '/books')
                        }}
                        sx={{ minHeight: 32, textTransform: 'none' }}
                      >
                        Go to My Books
                      </Button>
                    ) : (
                      <Button size="small" variant="text" disabled sx={{ minHeight: 32, textTransform: 'none' }}>
                        🔒 Complete {gateThreshold - mustDoCompleted} more quest{gateThreshold - mustDoCompleted !== 1 ? 's' : ''}
                      </Button>
                    )}
                  </Box>
                )}
                {/* Per-item capture for kids */}
                {item.completed && !item.evidenceArtifactId && (
                  <Box sx={{ ml: 5, mt: 0.5 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CameraAltIcon />}
                      onClick={(e) => { e.stopPropagation(); handleKidCapture(absIndex) }}
                      sx={{ minHeight: 36 }}
                    >
                      Show your work!
                    </Button>
                  </Box>
                )}
                {item.evidenceArtifactId && (
                  <Typography variant="caption" color="success.main" sx={{ ml: 5, display: 'block' }}>
                    Work captured!
                  </Typography>
                )}
                {/* Lincoln self-report mastery */}
                {item.completed && !item.mastery && isLincoln && (
                  <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 0.5 }}>
                    <Chip label="⛏️ Easy!" size="small" color="success" variant="outlined"
                      onClick={() => handleSetMastery(absIndex, 'got-it')} />
                    <Chip label="🔨 Tricky" size="small" color="warning" variant="outlined"
                      onClick={() => handleSetMastery(absIndex, 'working')} />
                    <Chip label="🧱 Hard" size="small" color="error" variant="outlined"
                      onClick={() => handleSetMastery(absIndex, 'stuck')} />
                  </Stack>
                )}
              </Box>
            )
          })}
        </Stack>

        {/* Progress message */}
        <Stack spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">
              {mustDoCompleted} of {mustDo.length} quests done
              {mustDoSkipped > 0 && `, ${mustDoSkipped} skipped`}
            </Typography>
            {dailyXp > 0 && (
              <Chip
                label={`💎 ${dailyXp} XP earned`}
                size="small"
                color="success"
                variant="outlined"
              />
            )}
          </Stack>
          {!mustDoDone && mustDoRemaining > 0 && (
            <Typography
              variant="body1"
              color="text.secondary"
              textAlign="center"
              sx={{ fontWeight: 500 }}
            >
              {isLincoln
                ? `${mustDoRemaining} quest${mustDoRemaining !== 1 ? 's' : ''} to go, then you craft!`
                : `${mustDoRemaining} to go, then you choose!`}
            </Typography>
          )}
        </Stack>
        {mustDoDone && !isMvd && choose.length > 0 && (
          <Typography
            variant="body1"
            textAlign="center"
            sx={{ mt: 1, fontWeight: 600, color: 'success.main' }}
          >
            {isLincoln ? 'Quests complete! Craft your adventure!' : 'Great job! Now pick your adventures!'}
          </Typography>
        )}
      </SectionCard>

      {/* ── CHOOSE SECTION ── */}
      {!isMvd && choose.length > 0 && (
        <SectionCard title={isLincoln ? `🔨 Craft ${maxChoices}` : `Choose ${maxChoices}`}>
          {!mustDoDone && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'action.hover',
                mb: 1,
              }}
            >
              <LockIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
              <Typography variant="body2" color="text.secondary">
                {isLincoln
                  ? 'Complete your quests to unlock crafting!'
                  : 'Complete your must-do items to unlock choices!'}
              </Typography>
            </Stack>
          )}

          <Stack spacing={1}>
            {choose.map((item, choiceIdx) => {
              const isSelected = selectedChoices.has(choiceIdx)
              const absIndex = getAbsoluteIndex(item)
              const canSelect = mustDoDone && (isSelected || selectedChoices.size < maxChoices)
              const isLocked = !mustDoDone
              const isChooseBookItem = /book/i.test(item.label)

              if (isSelected) {
                // Selected choice acts like a must-do: checkable
                return (
                  <Box key={absIndex}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{
                        p: 1,
                        borderRadius: 2,
                        bgcolor: item.completed ? 'success.50' : 'info.50',
                        border: '1px solid',
                        borderColor: item.completed ? 'success.200' : 'info.200',
                        minHeight: 56,
                        cursor: 'pointer',
                      }}
                      onClick={() => handleToggleItem(absIndex)}
                    >
                      <Checkbox
                        checked={item.completed}
                        sx={{
                          '& .MuiSvgIcon-root': { fontSize: 28 },
                          p: 0.5,
                        }}
                        color="success"
                        tabIndex={-1}
                      />
                      <Typography
                        variant="body1"
                        sx={{
                          flex: 1,
                          textDecoration: item.completed ? 'line-through' : 'none',
                          color: item.completed ? 'text.secondary' : 'text.primary',
                          fontWeight: 500,
                        }}
                      >
                        {isChooseBookItem && <MenuBookIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'text-bottom' }} />}
                        {item.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.completed ? '✓' : getTimeLabel(item.estimatedMinutes ?? item.plannedMinutes)}
                      </Typography>
                    </Stack>
                    {/* Book item quick link */}
                    {isChooseBookItem && !item.completed && (
                      <Box sx={{ ml: 5, mt: 0.5 }}>
                        {gateUnlocked ? (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<MenuBookIcon />}
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(item.bookId ? `/books/${item.bookId}` : '/books')
                            }}
                            sx={{ minHeight: 32, textTransform: 'none' }}
                          >
                            Go to My Books
                          </Button>
                        ) : (
                          <Button size="small" variant="text" disabled sx={{ minHeight: 32, textTransform: 'none' }}>
                            🔒 Complete {gateThreshold - mustDoCompleted} more quest{gateThreshold - mustDoCompleted !== 1 ? 's' : ''}
                          </Button>
                        )}
                      </Box>
                    )}
                    {/* Per-item capture for kids */}
                    {item.completed && !item.evidenceArtifactId && (
                      <Box sx={{ ml: 5, mt: 0.5 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<CameraAltIcon />}
                          onClick={(e) => { e.stopPropagation(); handleKidCapture(absIndex) }}
                          sx={{ minHeight: 36 }}
                        >
                          Show your work!
                        </Button>
                      </Box>
                    )}
                    {item.evidenceArtifactId && (
                      <Typography variant="caption" color="success.main" sx={{ ml: 5, display: 'block' }}>
                        Work captured!
                      </Typography>
                    )}
                    {/* Lincoln self-report mastery */}
                    {item.completed && !item.mastery && isLincoln && (
                      <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 0.5 }}>
                        <Chip label="⛏️ Easy!" size="small" color="success" variant="outlined"
                          onClick={() => handleSetMastery(absIndex, 'got-it')} />
                        <Chip label="🔨 Tricky" size="small" color="warning" variant="outlined"
                          onClick={() => handleSetMastery(absIndex, 'working')} />
                        <Chip label="🧱 Hard" size="small" color="error" variant="outlined"
                          onClick={() => handleSetMastery(absIndex, 'stuck')} />
                      </Stack>
                    )}
                  </Box>
                )
              }

              // Unselected choice: radio-style selector
              return (
                <Stack
                  key={absIndex}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    p: 1,
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    minHeight: 56,
                    opacity: isLocked ? 0.45 : 1,
                    cursor: canSelect ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (canSelect) handleToggleChoice(choiceIdx)
                  }}
                >
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: '2px solid',
                      borderColor: isLocked ? 'text.disabled' : 'primary.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      ml: 0.5,
                    }}
                  />
                  <Typography
                    variant="body1"
                    sx={{
                      flex: 1,
                      color: isLocked ? 'text.disabled' : 'text.primary',
                      fontWeight: 500,
                    }}
                  >
                    {isChooseBookItem && <MenuBookIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'text-bottom' }} />}
                    {item.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {getTimeLabel(item.estimatedMinutes ?? item.plannedMinutes)}
                  </Typography>
                </Stack>
              )
            })}
          </Stack>
        </SectionCard>
      )}

      {/* ── CHAPTER RESPONSE (Lincoln only) ── */}
      {dayLog?.chapterQuestion && isLincoln && (
        <KidChapterResponse
          dayLog={dayLog}
          child={child}
          familyId={familyId}
          persistDayLogImmediate={persistDayLogImmediate}
        />
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
        <KidTeachBack
          child={child}
          familyId={familyId}
          today={today}
          dayLog={dayLog}
          persistDayLogImmediate={persistDayLogImmediate}
        />
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
      {allDone && (
        <Box
          sx={{
            textAlign: 'center',
            py: isLincoln ? 3 : 4,
            px: 2,
            bgcolor: isLincoln ? 'rgba(0,0,0,0.85)' : 'success.50',
            borderRadius: isLincoln ? 0 : 3,
            border: isLincoln ? '3px solid #FCDB5B' : '2px solid',
            borderColor: isLincoln ? '#FCDB5B' : 'success.200',
            my: 2,
          }}
        >
          {isLincoln && (
            <Typography
              sx={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '0.6rem',
                color: '#FCDB5B',
                mb: 1,
                letterSpacing: 1,
              }}
            >
              Achievement Get!
            </Typography>
          )}
          <Typography
            variant="h4"
            sx={{
              mb: 1,
              ...(isLincoln
                ? {
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '0.7rem',
                    color: '#FFFFFF',
                    lineHeight: 1.6,
                  }
                : {}),
            }}
          >
            {celebrationMessage}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: isLincoln ? 'rgba(255,255,255,0.6)' : 'text.secondary',
              ...(isLincoln
                ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.45rem' }
                : {}),
            }}
          >
            {isLincoln
              ? 'Respawn tomorrow for more XP!'
              : `${child.name}'s journey continues tomorrow!`}
          </Typography>
        </Box>
      )}

      {/* MVD completion */}
      {isMvd && mustDoDone && (
        <Box
          sx={{
            textAlign: 'center',
            py: 3,
            px: 2,
            bgcolor: isLincoln ? 'rgba(0,0,0,0.85)' : 'success.50',
            borderRadius: isLincoln ? 0 : 3,
            border: isLincoln ? '3px solid #5A8C32' : '2px solid',
            borderColor: isLincoln ? '#5A8C32' : 'success.200',
            my: 2,
          }}
        >
          <Typography
            variant="h5"
            sx={{
              mb: 1,
              ...(isLincoln
                ? {
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '0.65rem',
                    color: '#7EFC20',
                  }
                : {}),
            }}
          >
            {isLincoln ? 'Base camp secured! Rest well.' : 'Done! Rest well today. 🌟'}
          </Typography>
        </Box>
      )}

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
