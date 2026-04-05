import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import AssessmentIcon from '@mui/icons-material/Assessment'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import SaveIndicator from '../../components/SaveIndicator'
import SectionCard from '../../components/SectionCard'
import { markProgramCompleteOnSkillMap } from '../../core/curriculum/updateSkillMapFromFindings'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  activityConfigsCollection,
  db,
  skillSnapshotsCollection,
  workbookConfigDocId,
  workbookConfigsCollection,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useSaveState } from '../../core/hooks/useSaveState'
import { useProfile } from '../../core/profile/useProfile'
import type {
  CurriculumMeta,
  EvidenceDefinition,
  PrioritySkill,
  SkillSnapshot,
  StopRule,
  SupportDefault,
  WorkbookConfig,
} from '../../core/types'
import { MasteryGate, SkillLevel, SubjectBucket, UserProfile } from '../../core/types/enums'
import {
  defaultEvidenceDefinitions,
  defaultPrioritySkills,
  defaultStopRules,
  defaultSupports,
} from './lincolnDefaults'
import FoundationsSection from '../evaluate/FoundationsSection'
import QuickCheckPanel from './QuickCheckPanel'

/** Predefined reading skills for curriculum milestone tracking */
const READING_SKILL_OPTIONS = [
  'letter-sounds',
  'short-vowels',
  'cvc-words',
  'consonant-blends',
  'digraphs',
  'long-vowels',
  'cvce-pattern',
  'vowel-teams-ea-ai-oa-ee-oo',
  'r-controlled-ar-ur-er',
  'double-consonants-ll-ff-mm',
  'le-endings',
  'diphthongs-ear-ue',
  'multi-syllable-words',
  'prefixes-suffixes',
  'reading-comprehension',
  'vocabulary-in-context',
] as const

/** Known curriculum providers */
const CURRICULUM_PROVIDERS = [
  'reading-eggs',
  'gatb',
  'other',
] as const

function computeCoverageText(wb: WorkbookConfig): { text: string; color: string } | null {
  if (!wb.totalUnits || !wb.currentPosition) return null
  if (wb.currentPosition >= wb.totalUnits) return { text: 'Complete!', color: 'success.main' }

  const covered = wb.currentPosition
  const unit = wb.unitLabel || 'lesson'
  return {
    text: `${unit.charAt(0).toUpperCase() + unit.slice(1)} ${covered} of ${wb.totalUnits} covered`,
    color: 'text.secondary',
  }
}

const emptySnapshot = (childId: string): SkillSnapshot => ({
  childId,
  prioritySkills: [],
  supports: [],
  stopRules: [],
  evidenceDefinitions: [],
})

export default function SkillSnapshotPage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { profile } = useProfile()
  const isParent = profile === UserProfile.Parents
  const {
    children,
    activeChildId,
    activeChild,
    setActiveChildId,
    isLoading: isLoadingChildren,
    addChild,
  } = useActiveChild()

  const [snapshot, setSnapshot] = useState<SkillSnapshot | null>(null)
  const [snapshotChildId, setSnapshotChildId] = useState(activeChildId)
  if (snapshotChildId !== activeChildId) {
    setSnapshotChildId(activeChildId)
    setSnapshot(null)
  }
  const { saveState, withSave } = useSaveState()
  const [snack, setSnack] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  const snapshotRef = useMemo(
    () => (activeChildId ? doc(skillSnapshotsCollection(familyId), activeChildId) : null),
    [familyId, activeChildId],
  )

  // Load snapshot in real-time
  useEffect(() => {
    if (!snapshotRef || !activeChildId) return
    let seeded = false
    const unsubscribe = onSnapshot(
      snapshotRef,
      async (snap) => {
        if (snap.exists()) {
          setSnapshot({ ...snap.data(), id: snap.id })
          return
        }
        if (seeded) return
        seeded = true
        // Create default snapshot for this child
        const defaults = emptySnapshot(activeChildId)
        try {
          await setDoc(snapshotRef, { ...defaults, createdAt: new Date().toISOString() })
        } catch (err) {
          console.error('Failed to create default snapshot', err)
          seeded = false
        }
      },
      (err) => {
        console.error('Failed to load skill snapshot', err)
        setSnack({ text: 'Could not load skill snapshot.', severity: 'error' })
      },
    )
    return unsubscribe
  }, [snapshotRef, activeChildId])

  const persist = useCallback(
    async (updated: SkillSnapshot) => {
      if (!snapshotRef) return
      setSnapshot(updated)
      const result = await withSave(async () => {
        await setDoc(snapshotRef, { ...updated, updatedAt: new Date().toISOString() })
        return true
      })
      if (result === undefined) {
        setSnack({ text: 'Failed to save.', severity: 'error' })
      }
    },
    [snapshotRef, withSave],
  )

  const handleLoadDefaults = useCallback(() => {
    if (!snapshot) return
    void persist({
      ...snapshot,
      prioritySkills: defaultPrioritySkills,
      supports: defaultSupports,
      stopRules: defaultStopRules,
      evidenceDefinitions: defaultEvidenceDefinitions,
    })
  }, [snapshot, persist])

  // --- Priority Skills CRUD ---
  const handleAddSkill = useCallback(() => {
    if (!snapshot) return
    const newSkill: PrioritySkill = {
      tag: '',
      label: '',
      level: SkillLevel.Emerging,
      notes: '',
      masteryGate: MasteryGate.NotYet,
    }
    void persist({ ...snapshot, prioritySkills: [...snapshot.prioritySkills, newSkill] })
  }, [snapshot, persist])

  const handleUpdateSkill = useCallback(
    (index: number, field: keyof PrioritySkill, value: string) => {
      if (!snapshot) return
      const updated = snapshot.prioritySkills.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      )
      void persist({ ...snapshot, prioritySkills: updated })
    },
    [snapshot, persist],
  )

  const handleRemoveSkill = useCallback(
    (index: number) => {
      if (!snapshot) return
      void persist({
        ...snapshot,
        prioritySkills: snapshot.prioritySkills.filter((_, i) => i !== index),
      })
    },
    [snapshot, persist],
  )

  // --- Supports CRUD ---
  const handleAddSupport = useCallback(() => {
    if (!snapshot) return
    const item: SupportDefault = { label: '', description: '' }
    void persist({ ...snapshot, supports: [...snapshot.supports, item] })
  }, [snapshot, persist])

  const handleUpdateSupport = useCallback(
    (index: number, field: keyof SupportDefault, value: string) => {
      if (!snapshot) return
      const updated = snapshot.supports.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      )
      void persist({ ...snapshot, supports: updated })
    },
    [snapshot, persist],
  )

  const handleRemoveSupport = useCallback(
    (index: number) => {
      if (!snapshot) return
      void persist({ ...snapshot, supports: snapshot.supports.filter((_, i) => i !== index) })
    },
    [snapshot, persist],
  )

  // --- Stop Rules CRUD ---
  const handleAddStopRule = useCallback(() => {
    if (!snapshot) return
    const item: StopRule = { label: '', trigger: '', action: '' }
    void persist({ ...snapshot, stopRules: [...snapshot.stopRules, item] })
  }, [snapshot, persist])

  const handleUpdateStopRule = useCallback(
    (index: number, field: keyof StopRule, value: string) => {
      if (!snapshot) return
      const updated = snapshot.stopRules.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      )
      void persist({ ...snapshot, stopRules: updated })
    },
    [snapshot, persist],
  )

  const handleRemoveStopRule = useCallback(
    (index: number) => {
      if (!snapshot) return
      void persist({ ...snapshot, stopRules: snapshot.stopRules.filter((_, i) => i !== index) })
    },
    [snapshot, persist],
  )

  // --- Quick Check handlers (1-tap level update) ---
  const handleQuickLevelUpdate = useCallback(
    (skillIndex: number, newLevel: SkillLevel) => {
      if (!snapshot) return
      const updated = snapshot.prioritySkills.map((s, i) =>
        i === skillIndex ? { ...s, level: newLevel } : s,
      )
      void persist({ ...snapshot, prioritySkills: updated })
    },
    [snapshot, persist],
  )

  const handleQuickObservation = useCallback(
    (skillIndex: number, observation: string) => {
      if (!snapshot) return
      const skill = snapshot.prioritySkills[skillIndex]
      const currentNotes = skill.notes ?? ''
      const timestamp = new Date().toLocaleDateString()
      const updatedNotes = currentNotes
        ? `${currentNotes}\n[${timestamp}] ${observation}`
        : `[${timestamp}] ${observation}`
      const updated = snapshot.prioritySkills.map((s, i) =>
        i === skillIndex ? { ...s, notes: updatedNotes } : s,
      )
      void persist({ ...snapshot, prioritySkills: updated })
    },
    [snapshot, persist],
  )

  // --- Workbook Configs (separate Firestore docs) ---
  const [workbooks, setWorkbooks] = useState<WorkbookConfig[]>([])

  useEffect(() => {
    if (!activeChildId) return
    const q = query(workbookConfigsCollection(familyId), where('childId', '==', activeChildId))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ ...(d.data() as WorkbookConfig), id: d.id }))
        setWorkbooks(items)
      },
      (err) => {
        console.error('Failed to load workbook configs', err)
        setSnack({ text: 'Could not load workbooks.', severity: 'error' })
      },
    )
    return unsubscribe
  }, [familyId, activeChildId])

  const handleAddWorkbook = useCallback(() => {
    if (!activeChildId) return
    const name = ''
    const newConfig: WorkbookConfig = {
      childId: activeChildId,
      name,
      subjectBucket: SubjectBucket.Other,
      totalUnits: 0,
      currentPosition: 0,
      unitLabel: 'lesson',
      targetFinishDate: '',
      schoolDaysPerWeek: 5,
    }
    setWorkbooks((prev) => [...prev, newConfig])
  }, [activeChildId])

  const handleSaveWorkbook = useCallback(
    async (index: number, updated: WorkbookConfig) => {
      if (!updated.name.trim()) return
      const docId = workbookConfigDocId(updated.childId, updated.name)
      const ref = doc(workbookConfigsCollection(familyId), docId)
      setWorkbooks((prev) => prev.map((w, i) => (i === index ? { ...updated, id: docId } : w)))
      const result = await withSave(async () => {
        await setDoc(ref, { ...updated, id: docId, updatedAt: new Date().toISOString() })
        return true
      })
      if (result === undefined) {
        setSnack({ text: 'Failed to save workbook.', severity: 'error' })
      }
    },
    [familyId, withSave],
  )

  const handleDeleteWorkbook = useCallback(
    async (index: number) => {
      const wb = workbooks[index]
      if (!wb) return
      if (wb.id) {
        const ref = doc(workbookConfigsCollection(familyId), wb.id)
        setWorkbooks((prev) => prev.filter((_, i) => i !== index))
        const result = await withSave(async () => {
          await deleteDoc(ref)
          return true
        })
        if (result === undefined) {
          setSnack({ text: 'Failed to delete workbook.', severity: 'error' })
        }
      } else {
        setWorkbooks((prev) => prev.filter((_, i) => i !== index))
      }
    },
    [familyId, workbooks, withSave],
  )

  // --- Mark workbook as complete ---
  const [confirmComplete, setConfirmComplete] = useState<{ index: number; wb: WorkbookConfig } | null>(null)

  const handleMarkComplete = useCallback(
    async (index: number) => {
      const wb = workbooks[index]
      if (!wb) return
      const now = new Date().toISOString()
      const updated = { ...wb, completed: true, completedDate: now, curriculum: { ...wb.curriculum, provider: wb.curriculum?.provider ?? '', completed: true } }
      setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
      await handleSaveWorkbook(index, updated)

      // Add to completedPrograms on Skill Snapshot
      if (snapshot && snapshotRef) {
        const programs = snapshot.completedPrograms || []
        if (!programs.includes(wb.name)) {
          const newSnapshot = { ...snapshot, completedPrograms: [...programs, wb.name], updatedAt: now }
          setSnapshot(newSnapshot)
          void withSave(async () => {
            await setDoc(snapshotRef, JSON.parse(JSON.stringify(newSnapshot)))
          })
        }
      }
      // Also update Learning Map
      if (activeChildId) {
        markProgramCompleteOnSkillMap(familyId, activeChildId, wb.name)
          .catch((err: unknown) => console.warn('[LearningMap] Failed to mark program complete', err))
      }
      setSnack({ text: `"${wb.name}" marked as complete.`, severity: 'success' })
      setConfirmComplete(null)
    },
    [workbooks, handleSaveWorkbook, snapshot, snapshotRef, withSave, activeChildId, familyId],
  )

  const handleReactivate = useCallback(
    async (index: number) => {
      const wb = workbooks[index]
      if (!wb) return
      const updated = { ...wb, completed: false, completedDate: undefined, curriculum: wb.curriculum ? { ...wb.curriculum, completed: false } : undefined }
      setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
      await handleSaveWorkbook(index, updated)

      // Remove from completedPrograms on Skill Snapshot
      if (snapshot && snapshotRef) {
        const programs = snapshot.completedPrograms || []
        const filtered = programs.filter((p) => p !== wb.name)
        if (filtered.length !== programs.length) {
          const newSnapshot = { ...snapshot, completedPrograms: filtered, updatedAt: new Date().toISOString() }
          setSnapshot(newSnapshot)
          void withSave(async () => {
            await setDoc(snapshotRef, JSON.parse(JSON.stringify(newSnapshot)))
          })
        }
      }
      setSnack({ text: `"${wb.name}" reactivated.`, severity: 'success' })
    },
    [workbooks, handleSaveWorkbook, snapshot, snapshotRef, withSave],
  )

  // --- Reset all workbook configs (clean start from scans) ---
  const [resetting, setResetting] = useState(false)

  const handleResetWorkbooks = useCallback(async () => {
    if (!activeChildId) return
    setResetting(true)
    try {
      // 1. Delete all workbook configs for this child
      const wbSnap = await getDocs(
        query(workbookConfigsCollection(familyId), where('childId', '==', activeChildId)),
      )
      if (wbSnap.size > 0) {
        const batch = writeBatch(db)
        wbSnap.docs.forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }

      // 2. Delete workbook/app type activity configs for this child (keep routine/formation)
      const acSnap = await getDocs(
        query(
          activityConfigsCollection(familyId),
          where('childId', 'in', [activeChildId, 'both']),
        ),
      )
      const workbookAcs = acSnap.docs.filter((d) => {
        const data = d.data()
        return data.type === 'workbook' || data.type === 'app'
      })
      if (workbookAcs.length > 0) {
        const batch2 = writeBatch(db)
        workbookAcs.forEach((d) => batch2.delete(d.ref))
        await batch2.commit()
      }

      const total = wbSnap.size + workbookAcs.length
      setSnack({ text: `Cleared ${total} workbook configs. Scan a page to start tracking.`, severity: 'success' })
    } catch (err) {
      console.error('[ResetWorkbooks] Failed:', err)
      setSnack({ text: 'Failed to reset workbooks.', severity: 'error' })
    } finally {
      setResetting(false)
    }
  }, [familyId, activeChildId])

  // --- Evidence Definitions CRUD ---
  const handleAddEvidence = useCallback(() => {
    if (!snapshot) return
    const item: EvidenceDefinition = { label: '', description: '' }
    void persist({ ...snapshot, evidenceDefinitions: [...snapshot.evidenceDefinitions, item] })
  }, [snapshot, persist])

  const handleUpdateEvidence = useCallback(
    (index: number, field: keyof EvidenceDefinition, value: string) => {
      if (!snapshot) return
      const updated = snapshot.evidenceDefinitions.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      )
      void persist({ ...snapshot, evidenceDefinitions: updated })
    },
    [snapshot, persist],
  )

  const handleRemoveEvidence = useCallback(
    (index: number) => {
      if (!snapshot) return
      void persist({
        ...snapshot,
        evidenceDefinitions: snapshot.evidenceDefinitions.filter((_, i) => i !== index),
      })
    },
    [snapshot, persist],
  )

  return (
    <Page>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <div>
          <Typography variant="h4" component="h1">Lincoln Evaluation</Typography>
          <Typography color="text.secondary">
            Maintain a living Skill Snapshot used by the planner and teach helper.
          </Typography>
        </div>
        <Button
          variant="contained"
          startIcon={<AssessmentIcon />}
          onClick={() => navigate('/evaluate')}
        >
          Evaluate {activeChild?.name || 'Child'}'s Skills
        </Button>
      </Stack>

      {isParent ? (
        <ChildSelector
          children={children}
          selectedChildId={activeChildId}
          onSelect={setActiveChildId}
          onChildAdded={addChild}
          isLoading={isLoadingChildren}
          emptyMessage="Add a child to create a skill snapshot."
        />
      ) : (
        <Typography variant="subtitle1" color="text.secondary">
          {activeChild?.name ?? 'Loading...'}
        </Typography>
      )}

      {!snapshot ? (
        <SectionCard title="Loading">
          <Typography color="text.secondary">Loading skill snapshot...</Typography>
        </SectionCard>
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <SaveIndicator state={saveState} />
            {snapshot.prioritySkills.length === 0 && (
              <Button size="small" variant="outlined" onClick={handleLoadDefaults}>
                Load Lincoln Defaults
              </Button>
            )}
          </Stack>

          {/* Quick Check Prompts (Evaluation Agent) */}
          {snapshot.prioritySkills.length > 0 && (
            <SectionCard title="Quick Checks">
              <QuickCheckPanel
                snapshot={snapshot}
                onUpdateSkillLevel={handleQuickLevelUpdate}
                onAddObservation={handleQuickObservation}
              />
            </SectionCard>
          )}

          {/* Priority Skills */}
          <SectionCard title="Priority Skills (1\u20133 targets)">
            <Stack spacing={2}>
              {snapshot.prioritySkills.length === 0 ? (
                <Typography color="text.secondary">No priority skills set.</Typography>
              ) : (
                snapshot.prioritySkills.map((skill, index) => (
                  <Stack key={index} spacing={1} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        label="Label"
                        size="small"
                        fullWidth
                        value={skill.label}
                        onChange={(e) => handleUpdateSkill(index, 'label', e.target.value)}
                      />
                      <TextField
                        label="Level"
                        select
                        size="small"
                        sx={{ minWidth: 140 }}
                        value={skill.level}
                        onChange={(e) => handleUpdateSkill(index, 'level', e.target.value)}
                      >
                        {Object.values(SkillLevel).map((lvl) => (
                          <MenuItem key={lvl} value={lvl}>{lvl}</MenuItem>
                        ))}
                      </TextField>
                      <IconButton size="small" onClick={() => handleRemoveSkill(index)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <TextField
                      label="Skill tag"
                      size="small"
                      fullWidth
                      value={skill.tag}
                      onChange={(e) => handleUpdateSkill(index, 'tag', e.target.value)}
                      helperText="Format: domain.area.skill.level"
                    />
                    <TextField
                      label="Notes"
                      size="small"
                      fullWidth
                      multiline
                      minRows={1}
                      value={skill.notes ?? ''}
                      onChange={(e) => handleUpdateSkill(index, 'notes', e.target.value)}
                    />
                    <Chip label={skill.tag || 'no tag'} size="small" variant="outlined" />
                  </Stack>
                ))
              )}
              <Button startIcon={<AddIcon />} size="small" onClick={handleAddSkill}>
                Add Priority Skill
              </Button>
            </Stack>
          </SectionCard>

          {/* Conceptual Foundations (from most recent evaluation pattern analysis) */}
          {snapshot.conceptualBlocks && snapshot.conceptualBlocks.length > 0 && (
            <SectionCard title="Conceptual Foundations">
              <FoundationsSection
                blocks={snapshot.conceptualBlocks}
                summary={undefined}
              />
            </SectionCard>
          )}

          {/* Supports */}
          <SectionCard title="Default Supports / Adaptations">
            <Stack spacing={2}>
              {snapshot.supports.length === 0 ? (
                <Typography color="text.secondary">No supports defined.</Typography>
              ) : (
                snapshot.supports.map((support, index) => (
                  <Stack key={index} direction="row" spacing={1} alignItems="flex-start">
                    <Stack spacing={1} sx={{ flex: 1 }}>
                      <TextField
                        label="Label"
                        size="small"
                        fullWidth
                        value={support.label}
                        onChange={(e) => handleUpdateSupport(index, 'label', e.target.value)}
                      />
                      <TextField
                        label="Description"
                        size="small"
                        fullWidth
                        multiline
                        minRows={1}
                        value={support.description}
                        onChange={(e) => handleUpdateSupport(index, 'description', e.target.value)}
                      />
                    </Stack>
                    <IconButton size="small" onClick={() => handleRemoveSupport(index)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))
              )}
              <Button startIcon={<AddIcon />} size="small" onClick={handleAddSupport}>
                Add Support
              </Button>
            </Stack>
          </SectionCard>

          {/* Stop Rules */}
          <SectionCard title="Stop Rules">
            <Stack spacing={2}>
              {snapshot.stopRules.length === 0 ? (
                <Typography color="text.secondary">No stop rules defined.</Typography>
              ) : (
                snapshot.stopRules.map((rule, index) => (
                  <Stack key={index} direction="row" spacing={1} alignItems="flex-start">
                    <Stack spacing={1} sx={{ flex: 1 }}>
                      <TextField
                        label="Label"
                        size="small"
                        fullWidth
                        value={rule.label}
                        onChange={(e) => handleUpdateStopRule(index, 'label', e.target.value)}
                      />
                      <TextField
                        label="Trigger"
                        size="small"
                        fullWidth
                        value={rule.trigger}
                        onChange={(e) => handleUpdateStopRule(index, 'trigger', e.target.value)}
                      />
                      <TextField
                        label="Action"
                        size="small"
                        fullWidth
                        value={rule.action}
                        onChange={(e) => handleUpdateStopRule(index, 'action', e.target.value)}
                      />
                    </Stack>
                    <IconButton size="small" onClick={() => handleRemoveStopRule(index)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))
              )}
              <Button startIcon={<AddIcon />} size="small" onClick={handleAddStopRule}>
                Add Stop Rule
              </Button>
            </Stack>
          </SectionCard>

          {/* Evidence Definitions */}
          <SectionCard title="Evidence Definitions">
            <Stack spacing={2}>
              {snapshot.evidenceDefinitions.length === 0 ? (
                <Typography color="text.secondary">No evidence definitions.</Typography>
              ) : (
                snapshot.evidenceDefinitions.map((ev, index) => (
                  <Stack key={index} direction="row" spacing={1} alignItems="flex-start">
                    <Stack spacing={1} sx={{ flex: 1 }}>
                      <TextField
                        label="Label"
                        size="small"
                        fullWidth
                        value={ev.label}
                        onChange={(e) => handleUpdateEvidence(index, 'label', e.target.value)}
                      />
                      <TextField
                        label="Description"
                        size="small"
                        fullWidth
                        multiline
                        minRows={1}
                        value={ev.description}
                        onChange={(e) => handleUpdateEvidence(index, 'description', e.target.value)}
                      />
                    </Stack>
                    <IconButton size="small" onClick={() => handleRemoveEvidence(index)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))
              )}
              <Button startIcon={<AddIcon />} size="small" onClick={handleAddEvidence}>
                Add Evidence Definition
              </Button>
            </Stack>
          </SectionCard>

          {/* Workbooks (Pace Tracking) */}
          <SectionCard title="Workbooks">
            <Stack spacing={2}>
              {workbooks.length === 0 ? (
                <Typography color="text.secondary">No workbooks configured.</Typography>
              ) : (
                workbooks.map((wb, index) => {
                  const pace = computeCoverageText(wb)

                  // Completed workbook — read-only greyed-out card
                  if (wb.completed) {
                    return (
                      <Stack
                        key={wb.id ?? index}
                        spacing={0.5}
                        sx={{ p: 1.5, border: '1px solid', borderColor: 'success.light', borderRadius: 1, opacity: 0.55, bgcolor: 'grey.50' }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <CheckCircleOutlineIcon color="success" fontSize="small" />
                          <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                            {wb.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Completed {wb.completedDate ? new Date(wb.completedDate).toLocaleDateString() : ''}
                          </Typography>
                        </Stack>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => void handleReactivate(index)}
                          sx={{ alignSelf: 'flex-start', textTransform: 'none', fontSize: '0.75rem' }}
                        >
                          Reactivate
                        </Button>
                      </Stack>
                    )
                  }

                  return (
                    <Stack
                      key={wb.id ?? index}
                      spacing={1}
                      sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          label="Workbook Name"
                          size="small"
                          fullWidth
                          value={wb.name}
                          onChange={(e) => {
                            const updated = { ...wb, name: e.target.value }
                            setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                          }}
                          onBlur={() => void handleSaveWorkbook(index, wb)}
                        />
                        <TextField
                          label="Subject"
                          select
                          size="small"
                          sx={{ minWidth: 140 }}
                          value={wb.subjectBucket}
                          onChange={(e) => {
                            const updated = { ...wb, subjectBucket: e.target.value as SubjectBucket }
                            setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                            void handleSaveWorkbook(index, updated)
                          }}
                        >
                          {Object.values(SubjectBucket).map((val) => (
                            <MenuItem key={val} value={val}>{val}</MenuItem>
                          ))}
                        </TextField>
                        <IconButton
                          size="small"
                          onClick={() => setConfirmComplete({ index, wb })}
                          title="Mark as complete"
                          color="success"
                        >
                          <CheckCircleOutlineIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => void handleDeleteWorkbook(index)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          label="Total Units"
                          size="small"
                          type="number"
                          sx={{ flex: 1 }}
                          value={wb.totalUnits || ''}
                          onChange={(e) => {
                            const updated = { ...wb, totalUnits: Number(e.target.value) || 0 }
                            setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                            void handleSaveWorkbook(index, updated)
                          }}
                        />
                        <TextField
                          label="Current Position"
                          size="small"
                          type="number"
                          sx={{ flex: 1 }}
                          value={wb.currentPosition || ''}
                          onChange={(e) => {
                            const updated = { ...wb, currentPosition: Number(e.target.value) || 0 }
                            setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                            void handleSaveWorkbook(index, updated)
                          }}
                        />
                        <TextField
                          label="Unit Label"
                          size="small"
                          sx={{ flex: 1 }}
                          value={wb.unitLabel}
                          onChange={(e) => {
                            const updated = { ...wb, unitLabel: e.target.value }
                            setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                          }}
                          onBlur={() => void handleSaveWorkbook(index, wb)}
                        />
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          label="Target Finish Date"
                          size="small"
                          type="date"
                          sx={{ flex: 1 }}
                          slotProps={{ inputLabel: { shrink: true } }}
                          value={wb.targetFinishDate}
                          onChange={(e) => {
                            const updated = { ...wb, targetFinishDate: e.target.value }
                            setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                            void handleSaveWorkbook(index, updated)
                          }}
                        />
                        <TextField
                          label="School Days/Week"
                          size="small"
                          type="number"
                          sx={{ flex: 1 }}
                          value={wb.schoolDaysPerWeek}
                          onChange={(e) => {
                            const updated = { ...wb, schoolDaysPerWeek: Number(e.target.value) || 5 }
                            setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                            void handleSaveWorkbook(index, updated)
                          }}
                        />
                      </Stack>
                      {pace && (
                        <Typography variant="body2" sx={{ color: pace.color, fontWeight: 500 }}>
                          {pace.text}
                        </Typography>
                      )}

                      {/* Curriculum Details */}
                      <Accordion
                        disableGutters
                        elevation={0}
                        sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}
                      >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="body2" fontWeight={500}>
                            Curriculum Details
                            {wb.curriculum?.completed && ' \u2705'}
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Stack spacing={1.5}>
                            <TextField
                              label="Provider"
                              select
                              size="small"
                              fullWidth
                              value={wb.curriculum?.provider ?? ''}
                              onChange={(e) => {
                                const curriculum: CurriculumMeta = {
                                  ...wb.curriculum,
                                  provider: e.target.value,
                                }
                                const updated = { ...wb, curriculum }
                                setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                                void handleSaveWorkbook(index, updated)
                              }}
                            >
                              <MenuItem value="">None</MenuItem>
                              {CURRICULUM_PROVIDERS.map((p) => (
                                <MenuItem key={p} value={p}>{p}</MenuItem>
                              ))}
                            </TextField>
                            <Stack direction="row" spacing={1}>
                              <TextField
                                label="Level"
                                size="small"
                                sx={{ flex: 1 }}
                                value={wb.curriculum?.level ?? ''}
                                onChange={(e) => {
                                  const curriculum: CurriculumMeta = {
                                    ...wb.curriculum,
                                    provider: wb.curriculum?.provider ?? '',
                                    level: e.target.value,
                                  }
                                  const updated = { ...wb, curriculum }
                                  setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                                }}
                                onBlur={() => void handleSaveWorkbook(index, wb)}
                              />
                              <TextField
                                label="Last Milestone"
                                size="small"
                                sx={{ flex: 2 }}
                                value={wb.curriculum?.lastMilestone ?? ''}
                                onChange={(e) => {
                                  const curriculum: CurriculumMeta = {
                                    ...wb.curriculum,
                                    provider: wb.curriculum?.provider ?? '',
                                    lastMilestone: e.target.value,
                                  }
                                  const updated = { ...wb, curriculum }
                                  setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                                }}
                                onBlur={() => void handleSaveWorkbook(index, wb)}
                              />
                            </Stack>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <TextField
                                label="Milestone Date"
                                size="small"
                                type="date"
                                sx={{ flex: 1 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={wb.curriculum?.milestoneDate ?? ''}
                                onChange={(e) => {
                                  const curriculum: CurriculumMeta = {
                                    ...wb.curriculum,
                                    provider: wb.curriculum?.provider ?? '',
                                    milestoneDate: e.target.value,
                                  }
                                  const updated = { ...wb, curriculum }
                                  setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                                  void handleSaveWorkbook(index, updated)
                                }}
                              />
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={wb.curriculum?.completed ?? false}
                                    onChange={(e) => {
                                      const curriculum: CurriculumMeta = {
                                        ...wb.curriculum,
                                        provider: wb.curriculum?.provider ?? '',
                                        completed: e.target.checked,
                                      }
                                      const updated = { ...wb, curriculum }
                                      setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                                      void handleSaveWorkbook(index, updated)
                                    }}
                                  />
                                }
                                label="Completed"
                              />
                            </Stack>

                            {/* Mastered Skills chips */}
                            {wb.subjectBucket === 'Reading' && (
                              <>
                                <Typography variant="caption" color="text.secondary">
                                  Mastered Skills
                                </Typography>
                                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                                  {READING_SKILL_OPTIONS.map((skill) => {
                                    const selected = wb.curriculum?.masteredSkills?.includes(skill) ?? false
                                    return (
                                      <Chip
                                        key={skill}
                                        label={skill}
                                        size="small"
                                        color={selected ? 'success' : 'default'}
                                        variant={selected ? 'filled' : 'outlined'}
                                        onClick={() => {
                                          const current = wb.curriculum?.masteredSkills ?? []
                                          const masteredSkills = selected
                                            ? current.filter((s) => s !== skill)
                                            : [...current, skill]
                                          const curriculum: CurriculumMeta = {
                                            ...wb.curriculum,
                                            provider: wb.curriculum?.provider ?? '',
                                            masteredSkills,
                                          }
                                          const updated = { ...wb, curriculum }
                                          setWorkbooks((prev) => prev.map((w, i) => (i === index ? updated : w)))
                                          void handleSaveWorkbook(index, updated)
                                        }}
                                      />
                                    )
                                  })}
                                </Stack>
                              </>
                            )}
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    </Stack>
                  )
                })
              )}
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button startIcon={<AddIcon />} size="small" onClick={handleAddWorkbook}>
                  Add Workbook
                </Button>
                {workbooks.length > 0 && (
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    disabled={resetting}
                    onClick={async () => {
                      const confirmed = window.confirm(
                        'Delete all workbook configs and start fresh from scans? Routine activities (Prayer, Handwriting, etc.) will be kept.',
                      )
                      if (confirmed) {
                        await handleResetWorkbooks()
                      }
                    }}
                  >
                    {resetting ? 'Resetting...' : 'Reset Workbooks'}
                  </Button>
                )}
              </Stack>
            </Stack>
          </SectionCard>
        </>
      )}

      {/* ── Completed Programs ──────────────────────────────── */}
      {isParent && snapshot && (
        <SectionCard title="Completed Programs">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Mark curriculum programs as complete to help the system recommend appropriate quest modes.
          </Typography>
          <Stack spacing={1}>
            {(snapshot.completedPrograms || []).map((prog, i) => (
              <Chip
                key={i}
                label={COMPLETED_PROGRAM_LABELS[prog] || prog}
                onDelete={() => {
                  const updated = (snapshot.completedPrograms || []).filter((_, j) => j !== i)
                  const newSnapshot = { ...snapshot, completedPrograms: updated, updatedAt: new Date().toISOString() }
                  setSnapshot(newSnapshot)
                  if (snapshotRef) {
                    void withSave(async () => {
                      await setDoc(snapshotRef, JSON.parse(JSON.stringify(newSnapshot)))
                    })
                  }
                }}
              />
            ))}
            <CompletedProgramAdder
              existingPrograms={snapshot.completedPrograms || []}
              onAdd={(prog) => {
                const updated = [...(snapshot.completedPrograms || []), prog]
                const newSnapshot = { ...snapshot, completedPrograms: updated, updatedAt: new Date().toISOString() }
                setSnapshot(newSnapshot)
                if (snapshotRef) {
                  void withSave(async () => {
                    await setDoc(snapshotRef, JSON.parse(JSON.stringify(newSnapshot)))
                  })
                }
                // Also update Learning Map — mark linked curriculum nodes as mastered
                if (activeChildId) {
                  markProgramCompleteOnSkillMap(familyId, activeChildId, prog)
                    .catch((err) => console.warn('[LearningMap] Failed to mark program complete', err))
                }
              }}
            />
          </Stack>
        </SectionCard>
      )}

      {/* Mark Complete confirmation dialog */}
      <Dialog open={confirmComplete !== null} onClose={() => setConfirmComplete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark as complete?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Mark &ldquo;{confirmComplete?.wb.name}&rdquo; as complete? It won&apos;t appear in future weekly plans but will stay in your records.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmComplete(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={() => {
              if (confirmComplete) void handleMarkComplete(confirmComplete.index)
            }}
          >
            Mark Complete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(null)}
          severity={snack?.severity ?? 'error'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack?.text}
        </Alert>
      </Snackbar>
    </Page>
  )
}

// ── Completed programs helpers ───────────────────────────────

const COMPLETED_PROGRAM_OPTIONS = [
  { value: 'reading-eggs', label: 'Reading Eggs (Full Program)' },
  { value: 'explode-the-code', label: 'Explode the Code' },
  { value: '100-easy-lessons', label: 'Teach Your Child to Read in 100 Easy Lessons' },
] as const

const COMPLETED_PROGRAM_LABELS: Record<string, string> = {
  'reading-eggs': 'Reading Eggs (Full Program)',
  'explode-the-code': 'Explode the Code',
  '100-easy-lessons': '100 Easy Lessons',
}

function CompletedProgramAdder({
  existingPrograms,
  onAdd,
}: {
  existingPrograms: string[]
  onAdd: (prog: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const availableOptions = COMPLETED_PROGRAM_OPTIONS.filter(
    (o) => !existingPrograms.includes(o.value),
  )

  return (
    <>
      <Button startIcon={<AddIcon />} size="small" onClick={() => setOpen(true)}>
        Add completed program
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Which program was completed?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            This tells the system foundational phonics is mastered. Quests will focus on comprehension and fluency instead.
          </DialogContentText>
          <Stack spacing={1}>
            {availableOptions.map((opt) => (
              <Button
                key={opt.value}
                variant="outlined"
                fullWidth
                onClick={() => {
                  onAdd(opt.value)
                  setOpen(false)
                }}
              >
                {opt.label}
              </Button>
            ))}
            <TextField
              label="Other program"
              size="small"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customValue.trim()) {
                  onAdd(customValue.trim())
                  setCustomValue('')
                  setOpen(false)
                }
              }}
            />
            {customValue.trim() && (
              <Button
                variant="contained"
                size="small"
                onClick={() => {
                  onAdd(customValue.trim())
                  setCustomValue('')
                  setOpen(false)
                }}
              >
                Add "{customValue.trim()}"
              </Button>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
