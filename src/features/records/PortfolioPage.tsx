import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc, getDocs, query, where } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'

import DrawIcon from '@mui/icons-material/Draw'
import MenuBookIcon from '@mui/icons-material/MenuBook'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
} from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { Artifact } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import {
  generatePortfolioMarkdown,
  getMonthLabel,
  getMonthRange,
  scoreArtifactsForPortfolio,
} from './records.logic'

const currentDate = new Date()
const currentYear = currentDate.getFullYear()
const currentMonth = currentDate.getMonth() + 1

export default function PortfolioPage() {
  const familyId = useFamilyId()
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const { activeChildId, activeChild, children } = useActiveChild()
  const [allArtifacts, setAllArtifacts] = useState<Artifact[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAutoSuggest, setShowAutoSuggest] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [snackMessage, setSnackMessage] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  // Sketch capture
  const sketchInputRef = useRef<HTMLInputElement>(null)

  const handleSketchFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const child = activeChild
    if (!file || !child) return

    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const ext = file.name.split('.').pop() ?? 'jpg'
      const storagePath = `families/${familyId}/sketches/${ts}_sketch.${ext}`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)

      const artifact: Omit<Artifact, 'id'> = {
        childId: child.id,
        title: `${child.name}'s drawing`,
        type: EvidenceType.Photo,
        uri: url,
        storagePath,
        createdAt: new Date().toISOString(),
        content: 'Hand-drawn sketch captured for portfolio',
        tags: {
          engineStage: EngineStage.Build,
          domain: 'art',
          subjectBucket: SubjectBucket.Art,
          location: 'Home',
        },
      }
      await addDoc(artifactsCollection(familyId), artifact)

      // Add the new artifact to local state so it appears immediately
      const newArt: Artifact = { ...artifact, id: 'pending' }
      setAllArtifacts((prev) => [newArt, ...prev])
      setSnackMessage({ text: 'Drawing saved to portfolio!', severity: 'success' })
    } catch (err) {
      setSnackMessage({ text: `Failed to save drawing: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
    }
    // Reset input
    e.target.value = ''
  }, [familyId, activeChild])

  // Portfolio filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSubject, setFilterSubject] = useState<SubjectBucket | ''>('')
  const [filterType, setFilterType] = useState<EvidenceType | ''>('')

  // Filter artifacts by active child
  const childArtifacts = useMemo(
    () => activeChildId ? allArtifacts.filter((a) => a.childId === activeChildId) : allArtifacts,
    [allArtifacts, activeChildId],
  )

  // Apply search + subject + type filters
  const artifacts = useMemo(() => {
    let filtered = childArtifacts
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (a) =>
          a.title?.toLowerCase().includes(q) ||
          a.content?.toLowerCase().includes(q) ||
          a.notes?.toLowerCase().includes(q),
      )
    }
    if (filterSubject) {
      filtered = filtered.filter((a) => a.tags?.subjectBucket === filterSubject)
    }
    if (filterType) {
      filtered = filtered.filter((a) => (a.type as string) === filterType)
    }
    return filtered
  }, [childArtifacts, searchQuery, filterSubject, filterType])

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
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        setAllArtifacts(list)
        setSelectedIds(new Set())
        setShowAutoSuggest(false)
      } catch (err) {
        setSnackMessage({ text: `Failed to load artifacts: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
      }
    }
    void load()
  }, [familyId, monthStart, monthEnd])

  const scored = useMemo(
    () => scoreArtifactsForPortfolio(artifacts),
    [artifacts],
  )

  const handleAutoSuggest = () => {
    // Select top 5 artifacts by score (or all if fewer)
    const topIds = scored
      .slice(0, 5)
      .map((s) => s.artifact.id)
      .filter((id): id is string => id != null)
    setSelectedIds(new Set(topIds))
    setShowAutoSuggest(true)
  }

  const toggleArtifact = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(
      new Set(artifacts.map((a) => a.id).filter((id): id is string => id != null)),
    )
  }

  const selectNone = () => setSelectedIds(new Set())

  const handleExportMarkdown = useCallback(() => {
    const selected = artifacts.filter(
      (a) => a.id != null && selectedIds.has(a.id),
    )
    const md = generatePortfolioMarkdown(
      selected,
      children.map((c) => ({ id: c.id, name: c.name })),
      monthStart,
      monthEnd,
    )

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const prefix = activeChild ? `${activeChild.name.toLowerCase()}-` : ''
    link.setAttribute('download', `${prefix}portfolio-${monthStart}-to-${monthEnd}.md`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }, [artifacts, selectedIds, children, activeChild, monthStart, monthEnd])

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <Page>
      <SectionCard title="Portfolio / Demo Night Highlights">
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
                Select a profile to view Portfolio
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Use the profile menu to choose a child, or visit Settings.
              </Typography>
            </Stack>
          ) : (
            <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Search by title"
                  size="small"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  sx={{ minWidth: 180 }}
                />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Subject</InputLabel>
                  <Select
                    value={filterSubject}
                    label="Subject"
                    onChange={(e) => setFilterSubject(e.target.value as SubjectBucket | '')}
                  >
                    <MenuItem value="">All Subjects</MenuItem>
                    {Object.values(SubjectBucket).map((s) => (
                      <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={filterType}
                    label="Type"
                    onChange={(e) => setFilterType(e.target.value as EvidenceType | '')}
                  >
                    <MenuItem value="">All Types</MenuItem>
                    {Object.values(EvidenceType).map((t) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
              <Typography variant="subtitle2" color="text.secondary">
                {artifacts.length}{artifacts.length !== childArtifacts.length ? ` of ${childArtifacts.length}` : ''} artifacts for {activeChild?.name ?? 'child'} in {monthLabel} — {selectedIds.size}{' '}
                selected for portfolio
              </Typography>
            </>
          )}

          {activeChildId && <>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              variant="contained"
              color="secondary"
              startIcon={<DrawIcon />}
              onClick={() => sketchInputRef.current?.click()}
              sx={{ fontWeight: 600 }}
            >
              Capture Drawing
            </Button>
            <input
              ref={sketchInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => { void handleSketchFile(e) }}
              style={{ display: 'none' }}
            />
            <Button size="small" variant="outlined" onClick={handleAutoSuggest}>
              Auto-Suggest Best
            </Button>
            <Button size="small" variant="text" onClick={selectAll}>
              Select All
            </Button>
            <Button size="small" variant="text" onClick={selectNone}>
              Clear
            </Button>
          </Stack>

          <Divider />

          {artifacts.length === 0 ? (
            <Typography color="text.secondary">
              No artifacts found for {monthLabel}.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {scored.map(({ artifact, score }) => {
                const isSelected = artifact.id != null && selectedIds.has(artifact.id)
                const child = children.find((c) => c.id === artifact.childId)
                const artType = artifact.type as string
                const isPhoto = artType === EvidenceType.Photo || artType === 'photo'
                const isAudio = artType === EvidenceType.Audio || artType === 'audio'
                const isBookArtifact = /page book/i.test(artifact.title ?? '')

                return (
                  <Stack
                    key={artifact.id}
                    direction="row"
                    spacing={1.5}
                    alignItems="flex-start"
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: isSelected ? 'action.selected' : 'transparent',
                      border: isSelected ? '2px solid' : '1px solid',
                      borderColor: isSelected ? 'primary.main' : 'divider',
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleArtifact(artifact.id ?? '')}
                      size="small"
                    />

                    {isBookArtifact && !isPhoto && (
                      <MenuBookIcon sx={{ fontSize: 40, color: 'info.main', flexShrink: 0 }} />
                    )}

                    {isPhoto && artifact.uri && (
                      <Box
                        component="img"
                        src={artifact.uri}
                        sx={{
                          width: 64,
                          height: 64,
                          borderRadius: 1,
                          objectFit: 'cover',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        onClick={() => setPreviewImage(artifact.uri!)}
                      />
                    )}

                    {isAudio && artifact.uri && (
                      <Box sx={{ flexShrink: 0 }}>
                        <audio controls src={artifact.uri} style={{ height: 32, width: 200 }} />
                      </Box>
                    )}

                    <Stack spacing={0.5} flex={1}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                      >
                        <Typography variant="body2" fontWeight={600}>
                          {artifact.title}
                        </Typography>
                        {child && (
                          <Chip size="small" label={child.name} />
                        )}
                        <Chip size="small" variant="outlined" label={artifact.type} />
                        {artifact.tags?.engineStage && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={artifact.tags.engineStage}
                          />
                        )}
                        {artifact.tags?.domain && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={artifact.tags.domain}
                          />
                        )}
                      </Stack>
                      {artifact.content && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 400,
                          }}
                        >
                          {artifact.content}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {artifact.createdAt ? new Date(artifact.createdAt).toLocaleDateString() : ''}
                      </Typography>
                    </Stack>
                    {showAutoSuggest && (
                      <Chip
                        size="small"
                        label={`Score: ${score}`}
                        color={score >= 3 ? 'success' : 'default'}
                      />
                    )}
                  </Stack>
                )
              })}
            </Stack>
          )}

          <Divider />

          <Button
            variant="contained"
            onClick={handleExportMarkdown}
            disabled={selectedIds.size === 0}
          >
            Export Portfolio Markdown ({selectedIds.size} artifacts)
          </Button>
          </>}
        </Stack>
      </SectionCard>

      <Dialog open={!!previewImage} onClose={() => setPreviewImage(null)} maxWidth="md">
        <DialogContent sx={{ p: 0 }}>
          {previewImage && (
            <Box component="img" src={previewImage} sx={{ width: '100%', display: 'block' }} />
          )}
        </DialogContent>
      </Dialog>

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
