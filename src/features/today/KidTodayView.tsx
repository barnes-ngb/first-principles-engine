import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import LockIcon from '@mui/icons-material/Lock'
import MicIcon from '@mui/icons-material/Mic'
import NoteIcon from '@mui/icons-material/Note'
import StopIcon from '@mui/icons-material/Stop'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { addDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import { useNavigate } from 'react-router-dom'
import MenuBookIcon from '@mui/icons-material/MenuBook'

import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { artifactsCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import type { Artifact, ChecklistItem, Child, DayLog } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { addXpEvent } from '../../core/xp/addXpEvent'
import AvatarThumbnail from '../avatar/AvatarThumbnail'
import { useAvatarProfile } from '../avatar/useAvatarProfile'
import MinecraftXpBar from '../avatar/MinecraftXpBar'
import { useXpLedger } from '../../core/xp/useXpLedger'
import { useDraftBook } from '../books/useBook'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import ExplorerMap from './ExplorerMap'
import WorkshopGameCards from './WorkshopGameCards'
import KidCaptureForm from './KidCaptureForm'
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

  // "I Did More Mining!" extra activity logger state
  const [showExtraLog, setShowExtraLog] = useState(false)
  const [extraActivity, setExtraActivity] = useState<{ label: string; subject: string } | null>(null)
  const [extraMinutes, setExtraMinutes] = useState<number | null>(null)
  const [savingExtra, setSavingExtra] = useState(false)
  const [extraItems, setExtraItems] = useState<Array<{ label: string; minutes: number }>>([])

  // Teach-back state (Lincoln only)
  const [showTeachBack, setShowTeachBack] = useState(false)
  const [teachSubject, setTeachSubject] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  // Draft book for "Continue your book" card
  const { draftBook } = useDraftBook(familyId, child.id)
  const { children: allChildren } = useActiveChild()

  const checklist = useMemo(() => dayLog.checklist ?? [], [dayLog.checklist])
  const { mustDo, choose } = useMemo(() => categorizeItems(checklist), [checklist])

  const mustDoDone = mustDo.length > 0 && mustDo.every((item) => item.completed)
  const mustDoRemaining = mustDo.filter((item) => !item.completed).length

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
      )
    }
    prevMustDoDoneRef.current = mustDoDone
  }, [mustDoDone, child.id, familyId, today])

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

  // Populate extra activity items from existing dayLog on load
  useEffect(() => {
    if (!dayLog?.checklist) return
    const extras = dayLog.checklist
      .filter((item) => item.source === 'manual' && item.completed)
      .map((item) => ({
        label: item.label.replace(/\s*\(\d+m\)\s*$/, ''),
        minutes: item.estimatedMinutes ?? 0,
      }))
    setExtraItems(extras)
  }, [dayLog?.checklist])

  const handleSaveExtra = useCallback(async () => {
    if (!extraActivity || !extraMinutes || !dayLog) return
    setSavingExtra(true)
    try {
      const newItem: ChecklistItem = {
        label: `${extraActivity.label} (${extraMinutes}m)`,
        completed: true,
        estimatedMinutes: extraMinutes,
        subjectBucket: extraActivity.subject as SubjectBucket,
        source: 'manual' as const,
        category: 'choose' as const,
        mvdEssential: false,
        engagement: 'engaged' as const,
      }

      const updatedChecklist = [...(dayLog.checklist ?? []), newItem]
      persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })

      setShowExtraLog(false)
      setExtraActivity(null)
      setExtraMinutes(null)
    } catch (err) {
      console.error('Extra activity save failed:', err)
    }
    setSavingExtra(false)
  }, [extraActivity, extraMinutes, dayLog, persistDayLogImmediate])

  const handleToggleItem = useCallback(
    (itemIndex: number) => {
      const updated = { ...dayLog }
      const updatedChecklist = [...(updated.checklist ?? [])]
      if (itemIndex < 0 || itemIndex >= updatedChecklist.length) return
      updatedChecklist[itemIndex] = {
        ...updatedChecklist[itemIndex],
        completed: !updatedChecklist[itemIndex].completed,
      }
      persistDayLogImmediate({ ...updated, checklist: updatedChecklist })
    },
    [dayLog, persistDayLogImmediate],
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

  /** Find the absolute index in the full checklist for a choose item. */
  const getAbsoluteIndex = useCallback(
    (chooseItem: ChecklistItem) => {
      return checklist.indexOf(chooseItem)
    },
    [checklist],
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

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch (err) {
      console.error('Mic access failed:', err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }, [])

  const handleSaveTeachBack = useCallback(async () => {
    if (!teachSubject || !child.id || !familyId) return
    setSaving(true)
    try {
      let mediaUrl: string | undefined
      if (audioBlob) {
        const filename = `teachback_${Date.now()}.webm`
        const storageRef = ref(storage, `families/${familyId}/artifacts/${filename}`)
        await uploadBytes(storageRef, audioBlob)
        mediaUrl = await getDownloadURL(storageRef)
      }

      await addDoc(artifactsCollection(familyId), {
        childId: child.id,
        title: `Teach-back: ${teachSubject}`,
        type: EvidenceType.Audio,
        dayLogId: today,
        tags: {
          engineStage: EngineStage.Explain,
          subjectBucket: (teachSubject as SubjectBucket) ?? SubjectBucket.Other,
          domain: 'speech',
          location: 'home',
        },
        ...(mediaUrl ? { mediaUrl } : {}),
        notes: `Lincoln taught London about ${teachSubject}`,
        createdAt: new Date().toISOString(),
      })

      persistDayLogImmediate({ ...dayLog, teachBackDone: true })
      setShowTeachBack(false)
    } catch (err) {
      console.error('Teach-back save failed:', err)
    }
    setSaving(false)
  }, [teachSubject, child.id, familyId, audioBlob, today, dayLog, persistDayLogImmediate])

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
              equippedPieces={avatarProfile.equippedPieces}
              totalXp={avatarProfile.totalXp}
              size={64}
              animated
            />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {greeting}
          </Typography>
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

      {/* Morning verse */}
      {weekFocus?.scriptureRef && (
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'grey.50', mb: 2 }}>
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            📖 {weekFocus.scriptureRef}
          </Typography>
        </Box>
      )}

      {/* Workshop game cards */}
      {familyId && allChildren.length > 0 && (
        <WorkshopGameCards familyId={familyId} childId={child.id} children={allChildren} />
      )}

      {/* MVD warm message */}
      {isMvd && (
        <Typography variant="body1" color="text.secondary" sx={{ mt: -1 }}>
          Light day today. Just these {mustDo.length}!
        </Typography>
      )}

      {/* ── I DID MORE MINING! (Lincoln only) ── */}
      {isLincoln && (
        <SectionCard title="⛏️ I Did More Mining!">
          <Stack spacing={2} sx={{ py: 1 }}>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>
              Did extra work on your tablet or on your own? Log it here!
            </Typography>

            {!showExtraLog ? (
              <Button
                variant="outlined"
                color="primary"
                size="large"
                onClick={() => setShowExtraLog(true)}
                sx={{ alignSelf: 'center' }}
              >
                ⛏️ I Did More!
              </Button>
            ) : (
              <Stack spacing={2}>
                {/* What did you do? — single tap */}
                <Typography variant="subtitle2">What did you work on?</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {[
                    { label: '📖 Reading Eggs', subject: 'Reading' },
                    { label: '🔢 Math App', subject: 'Math' },
                    { label: '📚 Reading', subject: 'Reading' },
                    { label: '✏️ Writing', subject: 'LanguageArts' },
                    { label: '🔬 Science', subject: 'Science' },
                    { label: '🎮 Other', subject: 'Other' },
                  ].map((opt) => (
                    <Chip
                      key={opt.label}
                      label={opt.label}
                      onClick={() => setExtraActivity(opt)}
                      color={extraActivity?.label === opt.label ? 'primary' : 'default'}
                      variant={extraActivity?.label === opt.label ? 'filled' : 'outlined'}
                      sx={{ fontSize: '0.95rem', py: 2.5 }}
                    />
                  ))}
                </Stack>

                {/* How long? — single tap */}
                <Typography variant="subtitle2">How long?</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {[
                    { label: '15 min', minutes: 15 },
                    { label: '30 min', minutes: 30 },
                    { label: '45 min', minutes: 45 },
                    { label: '1 hour', minutes: 60 },
                  ].map((opt) => (
                    <Chip
                      key={opt.label}
                      label={opt.label}
                      onClick={() => setExtraMinutes(opt.minutes)}
                      color={extraMinutes === opt.minutes ? 'primary' : 'default'}
                      variant={extraMinutes === opt.minutes ? 'filled' : 'outlined'}
                      sx={{ fontSize: '0.95rem', py: 2.5 }}
                    />
                  ))}
                </Stack>

                {/* Save */}
                <Button
                  variant="contained"
                  color="success"
                  disabled={!extraActivity || !extraMinutes || savingExtra}
                  onClick={handleSaveExtra}
                  size="large"
                >
                  {savingExtra ? 'Saving...' : '💎 Log It!'}
                </Button>

                <Button
                  variant="text"
                  size="small"
                  onClick={() => { setShowExtraLog(false); setExtraActivity(null); setExtraMinutes(null) }}
                >
                  Cancel
                </Button>
              </Stack>
            )}

            {/* Show already-logged extras for today */}
            {extraItems.length > 0 && (
              <Stack spacing={0.5}>
                <Typography variant="caption" color="text.secondary">Logged today:</Typography>
                {extraItems.map((item, i) => (
                  <Chip
                    key={i}
                    label={`${item.label} — ${item.minutes}m`}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                ))}
              </Stack>
            )}
          </Stack>
        </SectionCard>
      )}

      {/* ── MUST DO ── */}
      <SectionCard title={isLincoln ? '⛏️ Daily Quests' : 'Must Do'}>
        <Stack spacing={1}>
          {mustDo.map((item) => {
            const absIndex = checklist.indexOf(item)
            const isBookItem = /book/i.test(item.label)
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
                </Stack>
                {/* Book item quick link */}
                {isBookItem && !item.completed && (
                  <Box sx={{ ml: 5, mt: 0.5 }}>
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
              </Box>
            )
          })}
        </Stack>

        {/* Progress message */}
        {!mustDoDone && (
          <Typography
            variant="body1"
            color="text.secondary"
            textAlign="center"
            sx={{ mt: 1, fontWeight: 500 }}
          >
            {isLincoln
              ? `${mustDoRemaining} quest${mustDoRemaining !== 1 ? 's' : ''} to go, then you craft!`
              : `${mustDoRemaining} to go, then you choose!`}
          </Typography>
        )}
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

      {/* ── TEACH-BACK (Lincoln only) ── */}
      {showTeachBackSection && (
        <SectionCard title="⛏️ I Taught London Something!">
          <Stack spacing={2} alignItems="center" sx={{ py: 1 }}>
            <Typography variant="body1" sx={{ textAlign: 'center' }}>
              Did you explain something to London today? Tap to mine a knowledge diamond!
            </Typography>

            {!showTeachBack ? (
              <Button
                variant="contained"
                color="success"
                size="large"
                onClick={() => setShowTeachBack(true)}
                sx={{ fontSize: '1.1rem', py: 1.5, px: 4 }}
              >
                💎 I Taught London!
              </Button>
            ) : (
              <Stack spacing={2} sx={{ width: '100%' }}>
                {/* Subject picker — single tap chips */}
                <Typography variant="subtitle2">What was it about?</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {['Reading', 'Math', 'Science', 'Other'].map((subject) => (
                    <Chip
                      key={subject}
                      label={subject}
                      onClick={() => setTeachSubject(subject)}
                      color={teachSubject === subject ? 'primary' : 'default'}
                      variant={teachSubject === subject ? 'filled' : 'outlined'}
                      sx={{ fontSize: '1rem', py: 2.5, px: 1 }}
                    />
                  ))}
                </Stack>

                {/* Audio capture — Lincoln's primary input */}
                <Button
                  variant="outlined"
                  startIcon={isRecording ? <StopIcon /> : <MicIcon />}
                  onClick={isRecording ? stopRecording : startRecording}
                  color={isRecording ? 'error' : 'primary'}
                  size="large"
                >
                  {isRecording ? 'Stop Recording' : '🎤 Say What You Taught'}
                </Button>
                {audioUrl && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <audio src={audioUrl} controls style={{ flex: 1 }} />
                    <Chip label="✓ Recorded" color="success" size="small" />
                  </Stack>
                )}

                {/* Save button */}
                <Button
                  variant="contained"
                  color="success"
                  disabled={!teachSubject || saving}
                  onClick={handleSaveTeachBack}
                  size="large"
                >
                  {saving ? 'Saving...' : '💎 Mine This Diamond!'}
                </Button>
              </Stack>
            )}
          </Stack>
        </SectionCard>
      )}

      {/* ── CONTINUE YOUR BOOK ── */}
      {draftBook && (
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
    </Page>
  )
}
