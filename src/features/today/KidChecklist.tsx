import { useCallback } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import LockIcon from '@mui/icons-material/Lock'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import { useNavigate } from 'react-router-dom'

import SectionCard from '../../components/SectionCard'
import type { ChecklistItem, Child, DayLog } from '../../core/types'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { XP_AWARDS } from '../avatar/xpAwards'

function getTimeLabel(minutes?: number): string {
  if (!minutes) return ''
  return `${minutes} min`
}

interface KidChecklistProps {
  mustDo: ChecklistItem[]
  choose: ChecklistItem[]
  checklist: ChecklistItem[]
  maxChoices: number
  isLincoln: boolean
  isMvd: boolean
  gateUnlocked: boolean
  gateThreshold: number
  mustDoCompleted: number
  mustDoSkipped: number
  mustDoDone: boolean
  mustDoRemaining: number
  dailyXp: number
  selectedChoices: Set<number>
  onToggleChoice: (choiceIndex: number) => void
  dayLog: DayLog
  child: Child
  familyId: string
  today: string
  persistDayLogImmediate: (updated: DayLog) => void
  onCaptureOpen: (itemIndex: number) => void
  onXpToast: (toast: { amount: number; reason: string }) => void
}

export default function KidChecklist({
  mustDo,
  choose,
  checklist,
  maxChoices,
  isLincoln,
  isMvd,
  gateUnlocked,
  gateThreshold,
  mustDoCompleted,
  mustDoSkipped,
  mustDoDone,
  mustDoRemaining,
  dailyXp,
  selectedChoices,
  onToggleChoice,
  dayLog,
  child,
  familyId,
  today,
  persistDayLogImmediate,
  onCaptureOpen,
  onXpToast,
}: KidChecklistProps) {
  const navigate = useNavigate()

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
          if (awarded > 0) onXpToast({ amount: awarded, reason: item.label ?? 'checklist item' })
        }).catch((err) => console.error('[XP] Award failed:', err))
      }
    },
    [dayLog, persistDayLogImmediate, child.id, familyId, today, onXpToast],
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

  return (
    <>
      {/* ── MUST DO ── */}
      <SectionCard title={isLincoln ? '⛏️ Daily Quests' : 'Must Do'}>
        <Stack spacing={1}>
          {mustDo.map((item) => {
            const absIndex = checklist.indexOf(item)

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
                    {/book/i.test(item.label) && <MenuBookIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'text-bottom' }} />}
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
                {/book/i.test(item.label) && !item.completed && (
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
                      onClick={(e) => { e.stopPropagation(); onCaptureOpen(absIndex) }}
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
                // Selected choice: render like active item but with info color when not completed
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
                          onClick={(e) => { e.stopPropagation(); onCaptureOpen(absIndex) }}
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
                    if (canSelect) onToggleChoice(choiceIdx)
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
    </>
  )
}
