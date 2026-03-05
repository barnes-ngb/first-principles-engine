import { useCallback, useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import LockIcon from '@mui/icons-material/Lock'
import NoteIcon from '@mui/icons-material/Note'
import { getDocs, query, where } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { artifactsCollection } from '../../core/firebase/firestore'
import type { Artifact, ChecklistItem, Child, DayLog } from '../../core/types/domain'
import ExplorerMap from './ExplorerMap'
import KidCaptureForm from './KidCaptureForm'

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

function getGreeting(name: string): string {
  const hour = new Date().getHours()
  if (hour < 12) return `Good morning, ${name}!`
  if (hour < 17) return `Good afternoon, ${name}!`
  return `Nice work today, ${name}!`
}

function getTimeLabel(minutes?: number): string {
  if (!minutes) return ''
  return `${minutes} min`
}

/** Get a celebration message consistent within a day. */
function getCelebration(today: string): string {
  const d = new Date(today + 'T00:00:00')
  const start = new Date(d.getFullYear(), 0, 0)
  const dayOfYear = Math.floor(
    (d.getTime() - start.getTime()) / 86400000,
  )
  return CELEBRATIONS[Math.abs(dayOfYear) % CELEBRATIONS.length]
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

  const greeting = useMemo(() => getGreeting(child.name), [child.name])
  const celebrationMessage = useMemo(() => getCelebration(today), [today])

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
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
        {greeting}
      </Typography>

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
      <SectionCard title="Must Do">
        <Stack spacing={1}>
          {mustDo.map((item) => {
            const absIndex = checklist.indexOf(item)
            return (
              <Stack
                key={absIndex}
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
            {mustDoRemaining} to go, then you choose!
          </Typography>
        )}
        {mustDoDone && !isMvd && choose.length > 0 && (
          <Typography
            variant="body1"
            textAlign="center"
            sx={{ mt: 1, fontWeight: 600, color: 'success.main' }}
          >
            Great job! Now pick your adventures!
          </Typography>
        )}
      </SectionCard>

      {/* ── CHOOSE SECTION ── */}
      {!isMvd && choose.length > 0 && (
        <SectionCard title={`Choose ${maxChoices}`}>
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
                Complete your must-do items to unlock choices!
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
                  <Stack
                    key={absIndex}
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
            py: 4,
            px: 2,
            bgcolor: 'success.50',
            borderRadius: 3,
            border: '2px solid',
            borderColor: 'success.200',
            my: 2,
          }}
        >
          <Typography variant="h4" sx={{ mb: 1 }}>
            {celebrationMessage}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {child.name}&apos;s journey continues tomorrow!
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
            bgcolor: 'success.50',
            borderRadius: 3,
            border: '2px solid',
            borderColor: 'success.200',
            my: 2,
          }}
        >
          <Typography variant="h5" sx={{ mb: 1 }}>
            Done! Rest well today. 🌟
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
      <SectionCard title="📸 My Stuff">
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
            Nothing captured yet today. Take a photo of your work!
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
    </Page>
  )
}
