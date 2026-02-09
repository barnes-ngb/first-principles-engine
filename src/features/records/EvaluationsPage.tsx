import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  addDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'

import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
  evaluationsCollection,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { Artifact, Evaluation } from '../../core/types/domain'
import { getMonthLabel, getMonthRange } from './records.logic'

const currentDate = new Date()
const currentYear = currentDate.getFullYear()
const currentMonth = currentDate.getMonth() + 1

type EvaluationDraft = {
  wins: string[]
  struggles: string[]
  nextSteps: string[]
  sampleArtifactIds: string[]
}

const emptyDraft = (): EvaluationDraft => ({
  wins: [''],
  struggles: [''],
  nextSteps: [''],
  sampleArtifactIds: [],
})

export default function EvaluationsPage() {
  const familyId = useFamilyId()
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const { activeChildId, activeChild } = useActiveChild()
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [existingEval, setExistingEval] = useState<Evaluation | null>(null)
  const [draft, setDraft] = useState<EvaluationDraft>(emptyDraft())
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [snackMessage, setSnackMessage] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  const { start: monthStart, end: monthEnd } = useMemo(
    () => getMonthRange(year, month),
    [year, month],
  )

  const monthLabel = useMemo(() => getMonthLabel(year, month), [year, month])

  // Load artifacts for the month
  useEffect(() => {
    const load = async () => {
      try {
        const q = query(
          artifactsCollection(familyId),
          where('createdAt', '>=', monthStart),
          where('createdAt', '<=', monthEnd + 'T23:59:59'),
        )
        const snap = await getDocs(q)
        setArtifacts(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
      } catch (err) {
        setSnackMessage({ text: `Failed to load artifacts: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
      }
    }
    void load()
  }, [familyId, monthStart, monthEnd])

  // Load existing evaluation for child + month
  useEffect(() => {
    if (!activeChildId) return

    const load = async () => {
      try {
        const q = query(
          evaluationsCollection(familyId),
          where('childId', '==', activeChildId),
          where('monthStart', '==', monthStart),
        )
        const snap = await getDocs(q)
        if (snap.docs.length > 0) {
          const data = snap.docs[0].data() as Evaluation
          const ev = { ...data, id: snap.docs[0].id }
          setExistingEval(ev)
          setDraft({
            wins: ev.wins.length > 0 ? ev.wins : [''],
            struggles: ev.struggles.length > 0 ? ev.struggles : [''],
            nextSteps: ev.nextSteps.length > 0 ? ev.nextSteps : [''],
            sampleArtifactIds: ev.sampleArtifactIds ?? [],
          })
        } else {
          setExistingEval(null)
          setDraft(emptyDraft())
        }
      } catch (err) {
        setSnackMessage({ text: `Failed to load evaluation: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
      }
    }
    void load()
  }, [familyId, activeChildId, monthStart])

  const childArtifacts = useMemo(
    () => artifacts.filter((a) => a.childId === activeChildId),
    [artifacts, activeChildId],
  )

  const updateListItem = (
    field: 'wins' | 'struggles' | 'nextSteps',
    index: number,
    value: string,
  ) => {
    setDraft((prev) => {
      const updated = [...prev[field]]
      updated[index] = value
      return { ...prev, [field]: updated }
    })
  }

  const addListItem = (field: 'wins' | 'struggles' | 'nextSteps') => {
    setDraft((prev) => ({
      ...prev,
      [field]: [...prev[field], ''],
    }))
  }

  const removeListItem = (
    field: 'wins' | 'struggles' | 'nextSteps',
    index: number,
  ) => {
    setDraft((prev) => {
      const updated = prev[field].filter((_, i) => i !== index)
      return { ...prev, [field]: updated.length > 0 ? updated : [''] }
    })
  }

  const toggleArtifact = (artifactId: string) => {
    setDraft((prev) => {
      const ids = prev.sampleArtifactIds.includes(artifactId)
        ? prev.sampleArtifactIds.filter((id) => id !== artifactId)
        : [...prev.sampleArtifactIds, artifactId]
      return { ...prev, sampleArtifactIds: ids }
    })
  }

  const handleSave = useCallback(async () => {
    if (!activeChildId) return
    setIsSaving(true)
    setSaveMessage('')

    try {
      const clean = (items: string[]) => items.filter((s) => s.trim().length > 0)
      const now = new Date().toISOString()

      const evalData: Omit<Evaluation, 'id'> = {
        childId: activeChildId,
        monthStart,
        monthEnd,
        wins: clean(draft.wins),
        struggles: clean(draft.struggles),
        nextSteps: clean(draft.nextSteps),
        sampleArtifactIds: draft.sampleArtifactIds,
        updatedAt: now,
      }

      if (existingEval?.id) {
        await updateDoc(
          doc(evaluationsCollection(familyId), existingEval.id),
          evalData,
        )
      } else {
        await addDoc(evaluationsCollection(familyId), {
          ...evalData,
          createdAt: now,
        })
      }

      setSaveMessage('Evaluation saved.')
    } catch (err) {
      setSnackMessage({ text: `Failed to save evaluation: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
    } finally {
      setIsSaving(false)
    }
  }, [
    activeChildId,
    monthStart,
    monthEnd,
    draft,
    existingEval,
    familyId,
  ])

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <Page>
      <SectionCard title="Monthly Evaluation">
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Year</InputLabel>
              <Select
                value={year}
                label="Year"
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Month</InputLabel>
              <Select
                value={month}
                label="Month"
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {monthOptions.map((m) => (
                  <MenuItem key={m} value={m}>
                    {getMonthLabel(year, m)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {!activeChildId ? (
            <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
              <Typography variant="h6" color="text.secondary">
                Select a profile to create evaluations
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Use the profile menu to choose a child, or visit Settings.
              </Typography>
            </Stack>
          ) : (
            <Typography variant="subtitle2" color="text.secondary">
              Evaluation for {activeChild?.name ?? 'child'} — {monthLabel}
              {existingEval ? ' (editing existing)' : ' (new)'}
            </Typography>
          )}

          {activeChildId && <Divider />}

          {activeChildId && <>
          {/* Wins */}
          <Typography variant="subtitle1" fontWeight={600}>
            Wins
          </Typography>
          {draft.wins.map((win, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center">
              <TextField
                fullWidth
                size="small"
                placeholder="What went well this month?"
                value={win}
                onChange={(e) => updateListItem('wins', i, e.target.value)}
              />
              <IconButton
                size="small"
                onClick={() => removeListItem('wins', i)}
                disabled={draft.wins.length === 1}
              >
                <Typography variant="body2">✕</Typography>
              </IconButton>
            </Stack>
          ))}
          <Button
            size="small"
            variant="text"
            onClick={() => addListItem('wins')}
          >
            + Add win
          </Button>

          {/* Struggles */}
          <Typography variant="subtitle1" fontWeight={600}>
            Struggles
          </Typography>
          {draft.struggles.map((s, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center">
              <TextField
                fullWidth
                size="small"
                placeholder="What was challenging?"
                value={s}
                onChange={(e) =>
                  updateListItem('struggles', i, e.target.value)
                }
              />
              <IconButton
                size="small"
                onClick={() => removeListItem('struggles', i)}
                disabled={draft.struggles.length === 1}
              >
                <Typography variant="body2">✕</Typography>
              </IconButton>
            </Stack>
          ))}
          <Button
            size="small"
            variant="text"
            onClick={() => addListItem('struggles')}
          >
            + Add struggle
          </Button>

          {/* Next Steps */}
          <Typography variant="subtitle1" fontWeight={600}>
            Next Steps
          </Typography>
          {draft.nextSteps.map((step, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center">
              <TextField
                fullWidth
                size="small"
                placeholder="What comes next?"
                value={step}
                onChange={(e) =>
                  updateListItem('nextSteps', i, e.target.value)
                }
              />
              <IconButton
                size="small"
                onClick={() => removeListItem('nextSteps', i)}
                disabled={draft.nextSteps.length === 1}
              >
                <Typography variant="body2">✕</Typography>
              </IconButton>
            </Stack>
          ))}
          <Button
            size="small"
            variant="text"
            onClick={() => addListItem('nextSteps')}
          >
            + Add next step
          </Button>

          <Divider />

          {/* Sample Artifacts */}
          <Typography variant="subtitle1" fontWeight={600}>
            Sample Artifacts ({draft.sampleArtifactIds.length} selected)
          </Typography>
          {childArtifacts.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              No artifacts found for this child in {monthLabel}.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {childArtifacts.map((art) => (
                <Stack
                  key={art.id}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                >
                  <Checkbox
                    checked={draft.sampleArtifactIds.includes(art.id ?? '')}
                    onChange={() => toggleArtifact(art.id ?? '')}
                    size="small"
                  />
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="body2">{art.title}</Typography>
                    <Chip size="small" label={art.type} />
                    {art.tags?.engineStage && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={art.tags.engineStage}
                      />
                    )}
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}

          <Divider />

          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={isSaving}
            >
              {existingEval ? 'Update Evaluation' : 'Save Evaluation'}
            </Button>
            {saveMessage && (
              <Typography color="success.main" variant="body2">
                {saveMessage}
              </Typography>
            )}
          </Stack>
          </>}
        </Stack>
      </SectionCard>

      <Snackbar
        open={snackMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackMessage(null)}
          severity={snackMessage?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackMessage?.text}
        </Alert>
      </Snackbar>
    </Page>
  )
}
