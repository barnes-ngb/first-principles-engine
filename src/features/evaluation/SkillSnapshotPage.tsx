import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import AssessmentIcon from '@mui/icons-material/Assessment'
import DeleteIcon from '@mui/icons-material/Delete'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import SaveIndicator from '../../components/SaveIndicator'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  skillSnapshotsCollection,
  workbookConfigDocId,
  workbookConfigsCollection,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useSaveState } from '../../core/hooks/useSaveState'
import { useProfile } from '../../core/profile/useProfile'
import type {
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

function computePaceText(wb: WorkbookConfig): { text: string; color: string } | null {
  if (!wb.totalUnits || !wb.targetFinishDate || !wb.currentPosition) return null
  const remaining = wb.totalUnits - wb.currentPosition
  if (remaining <= 0) return { text: 'Complete!', color: 'success.main' }

  const today = new Date()
  const target = new Date(wb.targetFinishDate + 'T00:00:00')
  const msPerDay = 86_400_000
  const totalDays = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / msPerDay))
  const totalWeeks = totalDays / 7
  const schoolDays = Math.max(1, Math.round(totalWeeks * (wb.schoolDaysPerWeek || 5)))
  const perDay = remaining / schoolDays

  const unit = wb.unitLabel || 'lesson'
  const targetMonth = target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const text = `${unit.charAt(0).toUpperCase() + unit.slice(1)} ${wb.currentPosition} of ${wb.totalUnits} — ${perDay.toFixed(1)} ${unit}s/school day to finish by ${targetMonth}`

  let color = 'success.main'
  if (perDay > 2.5) color = 'error.main'
  else if (perDay > 1.5) color = 'warning.main'

  return { text, color }
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
                  const pace = computePaceText(wb)
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
                    </Stack>
                  )
                })
              )}
              <Button startIcon={<AddIcon />} size="small" onClick={handleAddWorkbook}>
                Add Workbook
              </Button>
            </Stack>
          </SectionCard>
        </>
      )}

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
