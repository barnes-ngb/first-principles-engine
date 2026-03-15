import { useCallback, useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
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

import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { artifactsCollection } from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import type { Artifact, ChecklistItem, Child, DayLog } from '../../core/types/domain'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import MinecraftAvatar from '../minecraft/MinecraftAvatar'
import ExplorerMap from './ExplorerMap'
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
  const [selectedChoices, setSelectedChoices] = useState<Set<number>>(new Set())
  const [showCapture, setShowCapture] = useState<'photo' | 'note' | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [captureItemIndex, setCaptureItemIndex] = useState<number | null>(null)
  const [captureReflection, setCaptureReflection] = useState('')

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

  const greeting = useMemo(() => getGreeting(child.name, isLincoln), [child.name, isLincoln])
  const celebrationMessage = useMemo(() => getCelebration(today, isLincoln), [today, isLincoln])

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
        {isLincoln && (
          <Box sx={{ flexShrink: 0 }}>
            <MinecraftAvatar xp={todayXp * 10} scale={3} />
          </Box>
        )}
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {greeting}
          </Typography>
          {isLincoln && todayXp > 0 && (
            <Typography
              sx={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '0.55rem',
                color: '#7EFC20',
                textShadow: '1px 1px 0 rgba(0,0,0,0.3)',
                mt: 0.5,
              }}
            >
              +{todayXp} XP today
            </Typography>
          )}
        </Box>
      </Stack>

      {/* Morning verse */}
      {weekFocus?.scriptureRef && (
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'grey.50', mb: 2 }}>
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            📖 {weekFocus.scriptureRef}
          </Typography>
        </Box>
      )}

      {/* MVD warm message */}
      {isMvd && (
        <Typography variant="body1" color="text.secondary" sx={{ mt: -1 }}>
          Light day today. Just these {mustDo.length}!
        </Typography>
      )}

      {/* ── MUST DO ── */}
      <SectionCard title={isLincoln ? '⛏️ Daily Quests' : 'Must Do'}>
        <Stack spacing={1}>
          {mustDo.map((item) => {
            const absIndex = checklist.indexOf(item)
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
                    {item.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.completed ? '✓' : getTimeLabel(item.estimatedMinutes ?? item.plannedMinutes)}
                  </Typography>
                </Stack>
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
                        {item.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.completed ? '✓' : getTimeLabel(item.estimatedMinutes ?? item.plannedMinutes)}
                      </Typography>
                    </Stack>
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
