import { useCallback, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'

import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import { useProfile } from '../../core/profile/useProfile'
import type { DadLabReport } from '../../core/types/domain'
import type { DadLabType } from '../../core/types/enums'
import { UserProfile } from '../../core/types/enums'
import { formatDateShort } from '../../core/utils/dateKey'
import KidLabView from './KidLabView'
import LabReportForm from './LabReportForm'
import LabSuggestions from './LabSuggestions'
import { useDadLabReports } from './useDadLabReports'

const LAB_TYPE_ICONS: Record<DadLabType, string> = {
  science: '\u{1F9EA}',
  engineering: '\u{1F528}',
  adventure: '\u{1F333}',
  heart: '\u{2764}\u{FE0F}',
}

const LAB_TYPE_LABELS: Record<DadLabType, string> = {
  science: 'Science',
  engineering: 'Engineering',
  adventure: 'Adventure',
  heart: 'Heart',
}

interface Prefill {
  title?: string
  question?: string
  labType?: DadLabType
  description?: string
}

export default function DadLabPage() {
  const { profile } = useProfile()
  const familyId = useFamilyId()
  const isKid = profile === UserProfile.Lincoln || profile === UserProfile.London

  const { reports, loading, saveReport } = useDadLabReports()
  const { children } = useChildren()
  const [view, setView] = useState<'history' | 'form'>('history')
  const [editingReport, setEditingReport] = useState<DadLabReport | undefined>()
  const [prefill, setPrefill] = useState<Prefill | undefined>()
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  const handleNew = useCallback(() => {
    setEditingReport(undefined)
    setPrefill(undefined)
    setView('form')
  }, [])

  const handleEdit = useCallback((report: DadLabReport) => {
    setEditingReport(report)
    setPrefill(undefined)
    setView('form')
  }, [])

  const handleCancel = useCallback(() => {
    setEditingReport(undefined)
    setPrefill(undefined)
    setView('form')
    setView('history')
  }, [])

  const handleSave = useCallback(
    async (report: DadLabReport) => {
      await saveReport(report)
      setView('history')
      setEditingReport(undefined)
      setPrefill(undefined)
    },
    [saveReport],
  )

  const handleSuggestionSelect = useCallback(
    (data: Prefill) => {
      setSuggestionsOpen(false)
      setPrefill(data)
      setEditingReport(undefined)
      setView('form')
    },
    [],
  )

  // Stats
  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const thisYear = reports.filter((r) => r.date.startsWith(String(currentYear)))
    const totalMinutes = thisYear.reduce((acc, r) => acc + (r.totalMinutes ?? 0), 0)
    const byType = thisYear.reduce(
      (acc, r) => {
        acc[r.labType] = (acc[r.labType] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
    return { count: thisYear.length, totalHours: Math.round(totalMinutes / 60), byType }
  }, [reports])

  if (isKid) {
    return (
      <KidLabView
        familyId={familyId}
        childName={profile === UserProfile.Lincoln ? 'Lincoln' : 'London'}
      />
    )
  }

  if (view === 'form') {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', p: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleCancel} sx={{ mb: 2 }}>
          Back to History
        </Button>
        <LabReportForm
          report={editingReport}
          prefill={prefill}
          children={children}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Dad Lab
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleNew}>
          New Lab Report
        </Button>
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeIcon />}
          onClick={() => setSuggestionsOpen(true)}
        >
          Suggest a Lab
        </Button>
      </Stack>

      {loading && <Typography color="text.secondary">Loading...</Typography>}

      {!loading && reports.length === 0 && (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          No lab reports yet. Start your first Saturday lab!
        </Typography>
      )}

      {reports.length > 0 && (
        <>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Past Labs
          </Typography>

          <Stack spacing={1.5} sx={{ mb: 3 }}>
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} onEdit={handleEdit} />
            ))}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Stats ({new Date().getFullYear()})
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`${stats.count} labs`} size="small" />
            <Chip label={`${stats.totalHours} hours`} size="small" />
            {Object.entries(stats.byType).map(([type, count]) => (
              <Chip
                key={type}
                label={`${LAB_TYPE_LABELS[type as DadLabType] ?? type}: ${count}`}
                size="small"
                variant="outlined"
              />
            ))}
          </Stack>
        </>
      )}

      <LabSuggestions
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        onSelect={handleSuggestionSelect}
      />
    </Box>
  )
}

function ReportCard({
  report,
  onEdit,
}: {
  report: DadLabReport
  onEdit: (report: DadLabReport) => void
}) {
  const artifactCount = Object.values(report.childReports).reduce(
    (acc, cr) => acc + (cr.artifacts?.length ?? 0),
    0,
  )

  return (
    <Card variant="outlined">
      <CardActionArea onClick={() => onEdit(report)}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontSize: '1.3rem' }}>
              {LAB_TYPE_ICONS[report.labType] ?? ''}
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                {report.title}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="caption" color="text.secondary">
                  {LAB_TYPE_LABELS[report.labType]}
                </Typography>
                {report.totalMinutes && (
                  <Typography variant="caption" color="text.secondary">
                    &middot; {report.totalMinutes} min
                  </Typography>
                )}
                {artifactCount > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    &middot; {artifactCount} photo{artifactCount !== 1 ? 's' : ''}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  &middot; {formatDateShort(report.date)}
                </Typography>
              </Stack>
              {report.question && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5, fontStyle: 'italic' }}
                  noWrap
                >
                  &ldquo;{report.question}&rdquo;
                </Typography>
              )}
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
