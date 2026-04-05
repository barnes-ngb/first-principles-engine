import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import CheckIcon from '@mui/icons-material/Check'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import PrintIcon from '@mui/icons-material/Print'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import ScanButton from '../../components/ScanButton'
import ScanResultsPanel from '../../components/ScanResultsPanel'
import SectionCard from '../../components/SectionCard'
import type {
  ChecklistItem as ChecklistItemType,
  CurriculumDetected,
  DayLog,
  SkillSnapshot,
} from '../../core/types'
import {
  PlanType,
  RoutineItemKey,
  SubjectBucket,
} from '../../core/types/enums'
import type { ScanRecord } from '../../core/types/planning'
import { autoFillBlockMinutes } from './daylog.model'
import { syncChecklistToRoutine } from './checklistRoutineSync'
import { calculateXp } from './xp'

const subjectBucketColor: Record<string, string> = {
  Reading: '#3b82f6',
  LanguageArts: '#8b5cf6',
  Math: '#10b981',
  Science: '#06b6d4',
  History: '#f59e0b',
  Art: '#ec4899',
  Music: '#a855f7',
  PE: '#f97316',
  Other: '#6b7280',
}

/** Infer a subject bucket from the item label when subjectBucket is not set. */
function inferSubjectBucket(label: string): string | undefined {
  const lower = label.toLowerCase()
  if (/\bread|reading eggs|phonics|book\b/.test(lower)) return 'Reading'
  if (/\bmath|addition|subtraction|multiply|division|arithmetic\b/.test(lower)) return 'Math'
  if (/\blanguage|grammar|writing|spelling|handwriting\b/.test(lower)) return 'LanguageArts'
  if (/\bscience|experiment|nature|biology\b/.test(lower)) return 'Science'
  if (/\bhistory|social studies|geography\b/.test(lower)) return 'History'
  if (/\bart|draw|paint|craft\b/.test(lower)) return 'Art'
  if (/\bmusic|piano|sing\b/.test(lower)) return 'Music'
  if (/\bpe|exercise|movement|run\b/.test(lower)) return 'PE'
  return undefined
}

/** Get color for a checklist item, using subjectBucket or inferring from label. */
function getItemColor(item: ChecklistItemType): string | undefined {
  const bucket = item.subjectBucket ?? inferSubjectBucket(item.label)
  return bucket ? (subjectBucketColor[bucket] ?? '#6b7280') : undefined
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

type SparkleMode = 'scan' | 'generate' | 'none'

const scanPatterns = [
  /good and the beautiful/i,
  /gatb/i,
  /language arts workbook/i,
  /reading eggs/i,
  /workbook/i,
]

const noSparklePatterns = [/prayer/i, /scripture/i, /devotion/i]

function getSparkleMode(item: ChecklistItemType): SparkleMode {
  const label = item.label || ''
  if (noSparklePatterns.some((p) => p.test(label))) return 'none'
  if (item.lessonCardId) return 'generate'
  if (scanPatterns.some((p) => p.test(label))) return 'scan'
  return 'generate'
}

function formatTime12h(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

interface TodayChecklistProps {
  dayLog: DayLog
  selectedChild: { name: string; id?: string }
  selectedChildId: string
  familyId: string
  today: string
  planType: PlanType
  todaySnapshot: SkillSnapshot | null
  activeRoutineItems: RoutineItemKey[] | undefined
  persistDayLogImmediate: (updated: DayLog) => void
  onTeachHelperOpen: (item: ChecklistItemType) => void
  onCaptureOpen: (index: number) => void
  onScanCapture: (file: File, index: number) => void
  scanLoading: boolean
  scanItemIndex: number | null
  scanResult: ScanRecord | null
  scanError: string | null
  onScanAddToPlan: () => void
  onScanSkip: () => void
  onClearScan: () => void
  onUpdatePosition?: (curriculum: CurriculumDetected) => void
  onPrintMaterials: () => void
  printingMaterials: boolean
}

export default function TodayChecklist({
  dayLog,
  selectedChild,
  planType,
  activeRoutineItems,
  persistDayLogImmediate,
  onTeachHelperOpen,
  onCaptureOpen,
  onScanCapture,
  scanLoading,
  scanItemIndex,
  scanResult,
  scanError,
  onScanAddToPlan,
  onScanSkip,
  onClearScan,
  onUpdatePosition,
  onPrintMaterials,
  printingMaterials,
}: TodayChecklistProps) {
  const navigate = useNavigate()
  const [editingPlan, setEditingPlan] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemMinutes, setNewItemMinutes] = useState(15)
  const [newItemSubject, setNewItemSubject] = useState<SubjectBucket>(SubjectBucket.Other)
  const [gradeNote, setGradeNote] = useState<{ index: number; text: string } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const rawChecklist = dayLog.checklist ?? []
  const hasPlanItems = rawChecklist.length > 0
  const isMvd = planType === PlanType.Mvd
  // When no items are marked mvdEssential, default first 3 as essential
  const essentialCount = rawChecklist.filter(i => i.mvdEssential).length
  const checklist = essentialCount > 0
    ? rawChecklist
    : rawChecklist.map((item, i) => ({ ...item, mvdEssential: i < 3 }))
  const completedCount = checklist.filter((item) => item.completed).length
  const parseMinutesFromLabel = (label: string): number => {
    const match = label.match(/\((\d+)m\)/)
    return match ? parseInt(match[1]) : 0
  }
  const totalPlannedMinutes = checklist.reduce((sum, item) => {
    return sum + (item.plannedMinutes ?? item.estimatedMinutes ?? parseMinutesFromLabel(item.label))
  }, 0)
  const completedMinutes = checklist
    .filter((ci) => ci.completed)
    .reduce((sum, ci) => sum + (ci.plannedMinutes ?? ci.estimatedMinutes ?? parseMinutesFromLabel(ci.label)), 0)
  const xp = calculateXp(dayLog, activeRoutineItems)
  const isLincoln = selectedChild?.name?.toLowerCase() === 'lincoln'

  const estimatedFinishLabel = (() => {
    const remainingMinutes = checklist
      .filter((ci) => !ci.completed)
      .reduce((sum, ci) => sum + (ci.plannedMinutes ?? ci.estimatedMinutes ?? parseMinutesFromLabel(ci.label)), 0)
    if (remainingMinutes > 0 && completedCount < checklist.length) {
      const est = new Date(now + remainingMinutes * 60_000)
      return ` \u00B7 Est. finish: ${formatTime12h(est)}`
    }
    return ''
  })()

  // Engagement pattern insights
  const itemsWithEngagement = checklist.filter((ci) => ci.engagement)
  const engagementCounts = itemsWithEngagement.reduce((acc, ci) => {
    if (ci.engagement) acc[ci.engagement] = (acc[ci.engagement] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const handleReorder = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= rawChecklist.length) return
    const updated = [...rawChecklist]
    const temp = updated[fromIndex]
    updated[fromIndex] = updated[toIndex]
    updated[toIndex] = temp
    persistDayLogImmediate({ ...dayLog, checklist: updated })
  }

  const handleDeleteItem = (index: number) => {
    const item = rawChecklist[index]
    const updatedChecklist = rawChecklist.filter((_, i) => i !== index)
    // If planner-sourced, also remove matching block
    let updatedBlocks = dayLog.blocks ?? []
    if (item.source === 'planner') {
      updatedBlocks = (dayLog.blocks ?? []).filter((block) => {
        const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
        return !matchesLabel
      })
    }
    persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist, blocks: updatedBlocks })
  }

  const handleEditLabel = (index: number, newLabel: string) => {
    const updatedChecklist = rawChecklist.map((ci, i) =>
      i === index ? { ...ci, label: newLabel } : ci
    )
    persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
  }

  const handleEditMinutes = (index: number, minutes: number) => {
    const item = rawChecklist[index]
    const updatedChecklist = rawChecklist.map((ci, i) =>
      i === index ? { ...ci, plannedMinutes: minutes } : ci
    )
    // Also update the corresponding block's plannedMinutes
    const updatedBlocks = (dayLog.blocks ?? []).map((block) => {
      const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
      if (matchesLabel) return { ...block, plannedMinutes: minutes }
      return block
    })
    persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist, blocks: updatedBlocks })
  }

  const handleAddItem = () => {
    if (!newItemTitle.trim()) return
    const newItem: ChecklistItemType = {
      label: newItemTitle.trim(),
      completed: false,
      plannedMinutes: newItemMinutes,
      subjectBucket: newItemSubject,
      source: 'manual',
    }
    const updatedChecklist = [...rawChecklist, newItem]
    persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
    setNewItemTitle('')
    setNewItemMinutes(15)
    setNewItemSubject(SubjectBucket.Other)
    setAddingItem(false)
  }

  const handleEngagement = (index: number, engagement: ChecklistItemType['engagement']) => {
    const updatedChecklist = rawChecklist.map((ci, i) =>
      i === index ? { ...ci, engagement } : ci
    )
    persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
  }

  const handleToggleItem = (index: number) => {
    const item = rawChecklist[index]
    const newCompleted = !item.completed
    const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
      i === index ? { ...ci, completed: newCompleted } : ci
    )
    // Auto-set actualMinutes on corresponding block when checking
    const minutes = item.estimatedMinutes ?? item.plannedMinutes ?? 0
    let updatedBlocks = dayLog.blocks ?? []
    if (newCompleted && minutes > 0) {
      updatedBlocks = (dayLog.blocks ?? []).map((block) => {
        const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
        const titleClean = item.label.replace(/\s*\(\d+m\)\s*$/, '')
        const matchesTitle = block.title != null && (
          block.title === titleClean ||
          titleClean.toLowerCase().includes(block.title.toLowerCase())
        )
        if ((matchesLabel || matchesTitle) && (block.actualMinutes == null || block.actualMinutes === 0)) {
          return { ...block, actualMinutes: minutes }
        }
        return block
      })
    } else if (!newCompleted) {
      // Clear auto-populated actualMinutes when unchecking
      updatedBlocks = (dayLog.blocks ?? []).map((block) => {
        const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
        const titleClean = item.label.replace(/\s*\(\d+m\)\s*$/, '')
        const matchesTitle = block.title != null && (
          block.title === titleClean ||
          titleClean.toLowerCase().includes(block.title.toLowerCase())
        )
        if ((matchesLabel || matchesTitle) && block.actualMinutes === minutes) {
          return { ...block, actualMinutes: undefined }
        }
        return block
      })
    }
    // Sync checklist → routine fields → XP
    const synced = syncChecklistToRoutine(
      { ...dayLog, checklist: updatedChecklist, blocks: updatedBlocks },
      item, newCompleted, activeRoutineItems,
    )
    const withMinutes = autoFillBlockMinutes(synced, activeRoutineItems)
    const withXp = { ...withMinutes, xpTotal: calculateXp(withMinutes, activeRoutineItems) }
    persistDayLogImmediate(withXp)
  }

  const handleSaveGradeNote = (index: number, text: string) => {
    if (!dayLog?.checklist || !text.trim()) return
    const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
      i === index ? { ...ci, gradeResult: text.trim() } : ci
    )
    persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
    setGradeNote(null)
  }

  return (
    <SectionCard title="Today's Plan" action={
      hasPlanItems ? (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Button
            size="small"
            variant="text"
            startIcon={printingMaterials ? <CircularProgress size={14} /> : <PrintIcon />}
            onClick={onPrintMaterials}
            disabled={printingMaterials}
            sx={{ minWidth: 0, px: 1 }}
          >
            {printingMaterials ? 'Generating...' : 'Print'}
          </Button>
          <IconButton size="small" onClick={() => { setEditingPlan(!editingPlan); setAddingItem(false) }}>
            {editingPlan ? <CheckIcon /> : <EditIcon />}
          </IconButton>
        </Stack>
      ) : undefined
    }>
      {hasPlanItems ? (
        <Stack spacing={1.5}>
          {/* Summary line with XP */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {formatMinutes(totalPlannedMinutes)} planned{' \u00B7 '}
              {completedCount} of {checklist.length} done
              {completedMinutes > 0 && ` \u00B7 ${formatMinutes(completedMinutes)} logged`}
              {estimatedFinishLabel}
            </Typography>
            <Chip
              label={`${xp} XP`}
              size="small"
              color={xp > 0 ? 'success' : 'default'}
              variant={xp > 0 ? 'filled' : 'outlined'}
              sx={isLincoln ? {
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '0.45rem',
                bgcolor: xp > 0 ? '#1A1A1A' : undefined,
                color: xp > 0 ? '#7EFC20' : undefined,
                border: xp > 0 ? '2px solid #3A3A3A' : undefined,
                borderRadius: 0,
              } : {}}
            />
          </Stack>

          {/* Checklist items */}
          {checklist.map((item, index) => {
            const isDimmed = isMvd && item.mvdEssential !== true
            const dotColor = getItemColor(item)

            if (editingPlan) {
              return (
                <Stack key={index} direction="row" spacing={0.5} alignItems="center">
                  {/* Reorder buttons */}
                  <Stack>
                    <IconButton
                      size="small"
                      disabled={index === 0}
                      onClick={() => handleReorder(index, 'up')}
                      sx={{ p: 0.25 }}
                    >
                      <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      disabled={index === checklist.length - 1}
                      onClick={() => handleReorder(index, 'down')}
                      sx={{ p: 0.25 }}
                    >
                      <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                  {/* Editable title */}
                  <TextField
                    size="small"
                    variant="standard"
                    value={item.label}
                    onChange={(e) => handleEditLabel(index, e.target.value)}
                    sx={{ flex: 1 }}
                    inputProps={{ style: { fontSize: '0.875rem' } }}
                  />
                  {/* Editable minutes */}
                  <TextField
                    size="small"
                    variant="standard"
                    type="number"
                    value={item.plannedMinutes ?? 0}
                    onChange={(e) => handleEditMinutes(index, Math.max(0, parseInt(e.target.value) || 0))}
                    sx={{ width: 48 }}
                    inputProps={{ min: 0, style: { fontSize: '0.875rem', textAlign: 'right' } }}
                  />
                  <Typography variant="caption" color="text.secondary">m</Typography>
                  {/* Delete button */}
                  <IconButton size="small" onClick={() => handleDeleteItem(index)} color="error">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              )
            }

            return (
              <Box key={index} sx={{
                ...(item.itemType === 'evaluation' ? {
                  borderLeft: '3px solid',
                  borderLeftColor: 'info.main',
                  pl: 0.5,
                  borderRadius: 1,
                } : {}),
              }}>
                <Stack
                  direction="row"
                  spacing={0.5}
                  alignItems="center"
                  sx={{
                    ...(item.completed ? { textDecoration: 'line-through', opacity: 0.6 } : {}),
                    ...(isDimmed && !item.completed ? { opacity: 0.5 } : {}),
                  }}
                >
                  {dotColor && (
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: dotColor,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <Checkbox
                    checked={item.completed}
                    onChange={() => handleToggleItem(index)}
                  />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {item.label}
                  </Typography>
                  {item.plannedMinutes != null && item.plannedMinutes > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      {item.plannedMinutes}m
                    </Typography>
                  )}
                  {isDimmed && !item.completed && (
                    <Chip label="(stretch)" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                  )}
                  {!item.completed && (() => {
                    const mode = getSparkleMode(item)
                    if (mode === 'none') return null
                    if (mode === 'scan') return (
                      <Tooltip title="Scan workbook page">
                        <span>
                          <ScanButton
                            variant="icon"
                            loading={scanLoading && scanItemIndex === index}
                            onCapture={(file) => onScanCapture(file, index)}
                          />
                        </span>
                      </Tooltip>
                    )
                    return (
                      <Tooltip title={item.lessonCardId ? 'View lesson plan' : 'Generate themed activity'}>
                        <IconButton
                          size="small"
                          onClick={() => onTeachHelperOpen(item)}
                        >
                          <AutoAwesomeIcon
                            fontSize="small"
                            color={item.lessonCardId ? 'primary' : 'action'}
                            sx={item.lessonCardId ? undefined : { opacity: 0.5 }}
                          />
                        </IconButton>
                      </Tooltip>
                    )
                  })()}
                </Stack>
                {/* Content guide (what to cover today) */}
                {item.contentGuide && !item.completed && (
                  <Box sx={{ mt: 0.5, ml: 5, pl: 1, borderLeft: '2px solid', borderLeftColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                      {item.contentGuide}
                    </Typography>
                  </Box>
                )}
                {/* Skip guidance (parent-only, not shown in kid view) */}
                {item.skipGuidance && !item.completed && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: /mastered|skip/i.test(item.skipGuidance)
                        ? 'success.main'
                        : /frontier|focus/i.test(item.skipGuidance)
                        ? 'warning.main'
                        : 'text.secondary',
                      display: 'block',
                      ml: 5,
                      mt: 0.5,
                      fontStyle: 'italic',
                      fontSize: '0.75rem',
                    }}
                  >
                    {/skip/i.test(item.skipGuidance) ? '\u23ED\uFE0F ' :
                     /frontier|focus/i.test(item.skipGuidance) ? '\uD83C\uDFAF ' : '\u2139\uFE0F '}
                    {item.skipGuidance}
                  </Typography>
                )}
                {/* Start Mining button for evaluation items */}
                {item.itemType === 'evaluation' && item.link && !item.completed && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => navigate(item.link!)}
                    sx={{
                      mt: 0.5,
                      ml: 5,
                      borderColor: 'info.main',
                      color: 'info.main',
                      fontSize: '0.75rem',
                    }}
                  >
                    ⛏️ Start Mining
                  </Button>
                )}
                {/* Scan results panel */}
                {scanItemIndex === index && scanResult?.results && (
                  <ScanResultsPanel
                    results={scanResult.results}
                    imageUrl={scanResult.imageUrl}
                    onAddToPlan={onScanAddToPlan}
                    onSkip={onScanSkip}
                    onUpdatePosition={onUpdatePosition}
                    onScanAnother={() => { onClearScan() }}
                  />
                )}
                {scanItemIndex === index && scanError && (
                  <Alert severity="error" sx={{ mt: 1 }} onClose={() => { onClearScan() }}>
                    Scan failed: {scanError}
                  </Alert>
                )}
                {/* Engagement feedback: emoji row after completion */}
                {item.completed && !item.engagement && (
                  <Stack direction="row" spacing={0.5} sx={{ ml: 5, mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, lineHeight: '24px' }}>
                      How&apos;d it go?
                    </Typography>
                    {([
                      { value: 'engaged' as const, emoji: '\u{1F60A}', label: 'Engaged' },
                      { value: 'okay' as const, emoji: '\u{1F610}', label: 'Okay' },
                      { value: 'struggled' as const, emoji: '\u{1F62B}', label: 'Struggled' },
                      { value: 'refused' as const, emoji: '\u{274C}', label: 'Refused' },
                    ]).map(opt => (
                      <IconButton
                        key={opt.value}
                        size="small"
                        onClick={() => handleEngagement(index, opt.value)}
                        title={opt.label}
                        sx={{ fontSize: '1.2rem', p: 0.5 }}
                      >
                        {opt.emoji}
                      </IconButton>
                    ))}
                  </Stack>
                )}
                {/* Show saved engagement as a small chip */}
                {item.engagement && (
                  <Chip
                    size="small"
                    label={{
                      engaged: '\u{1F60A} Engaged',
                      okay: '\u{1F610} Okay',
                      struggled: '\u{1F62B} Struggled',
                      refused: '\u{274C} Refused',
                    }[item.engagement]}
                    sx={{ ml: 5, mt: 0.5, height: 22 }}
                    onDelete={() => handleEngagement(index, undefined)}
                    variant="outlined"
                  />
                )}

                {/* Mastery feedback row */}
                {item.completed && (
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 5, mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                      Mastery:
                    </Typography>
                    {([
                      { value: 'got-it', label: '⛏️ Got it', color: 'success' },
                      { value: 'working', label: '🔨 Working', color: 'warning' },
                      { value: 'stuck', label: '🧱 Stuck', color: 'error' },
                    ] as const).map((opt) => (
                      <Chip
                        key={opt.value}
                        label={opt.label}
                        size="small"
                        color={item.mastery === opt.value ? opt.color : 'default'}
                        variant={item.mastery === opt.value ? 'filled' : 'outlined'}
                        onClick={() => {
                          const updated = [...(dayLog.checklist ?? [])]
                          updated[index] = { ...item, mastery: opt.value }
                          persistDayLogImmediate({ ...dayLog, checklist: updated })
                        }}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Stack>
                )}

                {/* Per-item capture — appears after checking off */}
                {item.completed && (
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 5, mt: 0.5 }}>
                    {/* Capture button */}
                    {!item.evidenceArtifactId && (
                      <IconButton
                        size="small"
                        onClick={() => onCaptureOpen(index)}
                        title="Capture work"
                      >
                        <CameraAltIcon fontSize="small" />
                      </IconButton>
                    )}
                    {/* Show if evidence already captured */}
                    {item.evidenceArtifactId && (
                      <Chip size="small" label="Captured" variant="outlined" color="success" sx={{ height: 22 }} />
                    )}
                  </Stack>
                )}

                {/* Scan nudge for workbook items after completion */}
                {item.completed && item.itemType === 'workbook' && !item.evidenceArtifactId && (
                  <Box sx={{ ml: 5, mt: 0.5 }}>
                    <Button
                      size="small"
                      variant="text"
                      startIcon={scanLoading && scanItemIndex === index
                        ? <CircularProgress size={14} />
                        : <CameraAltIcon sx={{ fontSize: 16 }} />}
                      disabled={scanLoading && scanItemIndex === index}
                      onClick={() => {
                        // Trigger the camera input for scan
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/*'
                        input.capture = 'environment'
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0]
                          if (file) onScanCapture(file, index)
                        }
                        input.click()
                      }}
                      sx={{ fontSize: '0.7rem', color: 'text.secondary', textTransform: 'none' }}
                    >
                      Scan the page to track progress
                    </Button>
                  </Box>
                )}

                {/* Scan & Review: manual quick-check after capture */}
                {item.evidenceArtifactId && !item.gradeResult && gradeNote?.index !== index && (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setGradeNote({ index, text: '' })}
                    sx={{ ml: 5, mt: 0.5, textTransform: 'none' }}
                  >
                    Quick Review
                  </Button>
                )}

                {/* Grade note input (Approach A — manual) */}
                {gradeNote?.index === index && (
                  <Stack spacing={1} sx={{ ml: 5, mt: 0.5 }}>
                    <Typography variant="body2">Quick check: how did it go?</Typography>
                    <TextField
                      size="small"
                      placeholder="e.g., 5/6 correct, missed regrouping on #4"
                      value={gradeNote.text}
                      onChange={(e) => setGradeNote({ index, text: e.target.value })}
                      multiline
                      rows={2}
                      autoFocus
                    />
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleSaveGradeNote(index, gradeNote.text)}
                        disabled={!gradeNote.text.trim()}
                      >
                        Save
                      </Button>
                      <Button size="small" onClick={() => setGradeNote(null)}>
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                )}

                {/* Display saved grade result */}
                {item.gradeResult && (
                  <Box sx={{ ml: 5, mt: 0.5, p: 1, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">Review:</Typography>
                    <Typography variant="body2">{item.gradeResult}</Typography>
                  </Box>
                )}
              </Box>
            )
          })}

          {/* Engagement pattern insights */}
          {itemsWithEngagement.length >= 2 && (
            <Box sx={{ px: 1, py: 1.5, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                Today&apos;s Engagement
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {engagementCounts.engaged != null && engagementCounts.engaged > 0 && (
                  <Chip size="small" label={`\u{1F60A} ${engagementCounts.engaged} engaged`} color="success" variant="outlined" sx={{ height: 24 }} />
                )}
                {engagementCounts.okay != null && engagementCounts.okay > 0 && (
                  <Chip size="small" label={`\u{1F610} ${engagementCounts.okay} okay`} variant="outlined" sx={{ height: 24 }} />
                )}
                {engagementCounts.struggled != null && engagementCounts.struggled > 0 && (
                  <Chip size="small" label={`\u{1F62B} ${engagementCounts.struggled} struggled`} color="warning" variant="outlined" sx={{ height: 24 }} />
                )}
                {engagementCounts.refused != null && engagementCounts.refused > 0 && (
                  <Chip size="small" label={`\u{274C} ${engagementCounts.refused} refused`} color="error" variant="outlined" sx={{ height: 24 }} />
                )}
              </Stack>
            </Box>
          )}

          {/* Add Item (edit mode only) */}
          {editingPlan && !addingItem && (
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setAddingItem(true)}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add Item
            </Button>
          )}
          {editingPlan && addingItem && (
            <Stack spacing={1} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <TextField
                size="small"
                label="Title"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                autoFocus
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="Minutes"
                  type="number"
                  value={newItemMinutes}
                  onChange={(e) => setNewItemMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                  sx={{ width: 100 }}
                  inputProps={{ min: 0 }}
                />
                <TextField
                  size="small"
                  label="Subject"
                  select
                  value={newItemSubject}
                  onChange={(e) => setNewItemSubject(e.target.value as SubjectBucket)}
                  sx={{ flex: 1 }}
                >
                  {Object.values(SubjectBucket).map((sb) => (
                    <MenuItem key={sb} value={sb}>{sb}</MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={handleAddItem} disabled={!newItemTitle.trim()}>
                  Add
                </Button>
                <Button size="small" onClick={() => setAddingItem(false)}>
                  Cancel
                </Button>
              </Stack>
            </Stack>
          )}
        </Stack>
      ) : (
        <Stack spacing={1} sx={{ py: 1 }}>
          <Typography color="text.secondary">
            No plan for today yet.{' '}
            <RouterLink to="/planner/chat" style={{ color: 'inherit', fontWeight: 600 }}>
              Plan My Week
            </RouterLink>{' '}
            takes about 2 minutes — it&apos;ll build your daily checklists automatically.
          </Typography>
        </Stack>
      )}
    </SectionCard>
  )
}
