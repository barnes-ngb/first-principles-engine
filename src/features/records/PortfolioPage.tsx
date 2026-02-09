import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getDocs, query, where } from 'firebase/firestore'

import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { Artifact } from '../../core/types/domain'
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
  const [snackMessage, setSnackMessage] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  // Filter artifacts by active child
  const artifacts = useMemo(
    () => activeChildId ? allArtifacts.filter((a) => a.childId === activeChildId) : allArtifacts,
    [allArtifacts, activeChildId],
  )

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
            <Typography variant="subtitle2" color="text.secondary">
              {artifacts.length} artifacts for {activeChild?.name ?? 'child'} in {monthLabel} — {selectedIds.size}{' '}
              selected for portfolio
            </Typography>
          )}

          {activeChildId && <>
          <Stack direction="row" spacing={1}>
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

                return (
                  <Stack
                    key={artifact.id}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: isSelected
                        ? 'action.selected'
                        : 'transparent',
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleArtifact(artifact.id ?? '')}
                      size="small"
                    />
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
