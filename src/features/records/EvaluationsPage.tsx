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

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import {
  artifactsCollection,
  childrenCollection,
  evaluationsCollection,
} from '../../core/firebase/firestore'
import type { Artifact, Child, Evaluation } from '../../core/types/domain'
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
  const familyId = DEFAULT_FAMILY_ID
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [existingEval, setExistingEval] = useState<Evaluation | null>(null)
  const [draft, setDraft] = useState<EvaluationDraft>(emptyDraft())
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const { start: monthStart, end: monthEnd } = useMemo(
    () => getMonthRange(year, month),
    [year, month],
  )

  const monthLabel = useMemo(() => getMonthLabel(year, month), [year, month])

  // Load children
  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(childrenCollection(familyId))
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
      setChildren(list)
      if (list.length > 0 && !selectedChildId) {
        setSelectedChildId(list[0].id)
      }
    }
    void load()
  }, [familyId, selectedChildId])

  // Load artifacts for the month
  useEffect(() => {
    const load = async () => {
      const q = query(
        artifactsCollection(familyId),
        where('createdAt', '>=', monthStart),
        where('createdAt', '<=', monthEnd + 'T23:59:59'),
      )
      const snap = await getDocs(q)
      setArtifacts(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    }
    void load()
  }, [familyId, monthStart, monthEnd])

  // Load existing evaluation for child + month
  useEffect(() => {
    if (!selectedChildId) return

    const load = async () => {
      const q = query(
        evaluationsCollection(familyId),
        where('childId', '==', selectedChildId),
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
    }
    void load()
  }, [familyId, selectedChildId, monthStart])

  const childArtifacts = useMemo(
    () => artifacts.filter((a) => a.childId === selectedChildId),
    [artifacts, selectedChildId],
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
    if (!selectedChildId) return
    setIsSaving(true)
    setSaveMessage('')

    const clean = (items: string[]) => items.filter((s) => s.trim().length > 0)
    const now = new Date().toISOString()

    const evalData: Omit<Evaluation, 'id'> = {
      childId: selectedChildId,
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
    setIsSaving(false)
  }, [
    selectedChildId,
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
            {children.length > 1 && (
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Child</InputLabel>
                <Select
                  value={selectedChildId}
                  label="Child"
                  onChange={(e) => setSelectedChildId(e.target.value)}
                >
                  {children.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>

          <Typography variant="subtitle2" color="text.secondary">
            Evaluation for {monthLabel}
            {existingEval ? ' (editing existing)' : ' (new)'}
          </Typography>

          <Divider />

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
        </Stack>
      </SectionCard>
    </Page>
  )
}
