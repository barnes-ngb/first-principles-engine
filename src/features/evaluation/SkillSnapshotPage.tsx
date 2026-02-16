import { useCallback, useEffect, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
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
import { doc, onSnapshot, setDoc } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import SaveIndicator from '../../components/SaveIndicator'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { skillSnapshotsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useSaveState } from '../../core/hooks/useSaveState'
import { useProfile } from '../../core/profile/useProfile'
import type {
  EvidenceDefinition,
  PrioritySkill,
  SkillSnapshot,
  StopRule,
  SupportDefault,
} from '../../core/types/domain'
import { SkillLevel, UserProfile } from '../../core/types/enums'
import {
  defaultEvidenceDefinitions,
  defaultPrioritySkills,
  defaultStopRules,
  defaultSupports,
} from './lincolnDefaults'
import QuickCheckPanel from './QuickCheckPanel'

const emptySnapshot = (childId: string): SkillSnapshot => ({
  childId,
  prioritySkills: [],
  supports: [],
  stopRules: [],
  evidenceDefinitions: [],
})

export default function SkillSnapshotPage() {
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
      const result = await withSave(() =>
        setDoc(snapshotRef, { ...updated, updatedAt: new Date().toISOString() }),
      )
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
      <Typography variant="h4" component="h1">Lincoln Evaluation</Typography>
      <Typography color="text.secondary" sx={{ mb: 1 }}>
        Maintain a living Skill Snapshot used by the planner and teach helper.
      </Typography>

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
