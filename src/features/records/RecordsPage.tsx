import { useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import {
  escapeCsvValue,
  formatDateForCsv,
  formatDateForInput,
  formatDateForUi,
  parseDateInput,
} from '../../lib/format'
import { getCurrentSchoolYearRange } from '../../lib/time'

type RecordSummary = {
  date: string
  summary: string
}

const sampleRecords: RecordSummary[] = [
  {
    date: formatDateForInput(new Date()),
    summary: 'Sample learning highlight',
  },
]

export default function RecordsPage() {
  const defaultRange = useMemo(() => getCurrentSchoolYearRange(), [])
  const [startDate, setStartDate] = useState(
    formatDateForInput(defaultRange.start),
  )
  const [endDate, setEndDate] = useState(
    formatDateForInput(defaultRange.end),
  )
  const canCopy =
    typeof navigator !== 'undefined' && Boolean(navigator.clipboard)

  const rangeSummary = useMemo(() => {
    const start = parseDateInput(startDate)
    const end = parseDateInput(endDate)
    if (!start || !end) {
      return 'Select a valid date range.'
    }

    return `${formatDateForUi(start)} – ${formatDateForUi(end)}`
  }, [endDate, startDate])

  const filteredRecords = useMemo(() => {
    const start = parseDateInput(startDate)
    const end = parseDateInput(endDate)
    if (!start || !end) {
      return []
    }

    return sampleRecords.filter((record) => {
      const recordDate = parseDateInput(record.date)
      if (!recordDate) {
        return false
      }
      return recordDate >= start && recordDate <= end
    })
  }, [endDate, startDate])

  const csvContent = useMemo(() => {
    const header = ['Date', 'Summary']
    const rows = filteredRecords.map((record) => {
      const recordDate = parseDateInput(record.date)
      const formattedDate = recordDate
        ? formatDateForCsv(recordDate)
        : record.date
      return [formattedDate, record.summary].map(escapeCsvValue).join(',')
    })

    return [header.join(','), ...rows].join('\n')
  }, [filteredRecords])

  const handleCopyCsv = async () => {
    if (!canCopy) {
      return
    }

    await navigator.clipboard.writeText(csvContent)
  }

  return (
    <Page>
      <SectionCard title="Records">
        <Stack spacing={2}>
          <Typography color="text.secondary">
            Review learning records for the selected school year.
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Start date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ maxWidth: 220 }}
            />
            <TextField
              label="End date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ maxWidth: 220 }}
            />
          </Stack>
          <Typography variant="subtitle2">Range: {rangeSummary}</Typography>
          <Stack spacing={1}>
            <Typography variant="subtitle2">CSV Preview</Typography>
            <TextField
              value={csvContent}
              multiline
              minRows={4}
              InputProps={{ readOnly: true }}
            />
            <Button
              variant="outlined"
              onClick={handleCopyCsv}
              disabled={!canCopy}
            >
              Copy CSV
            </Button>
          </Stack>
        </Stack>
      </SectionCard>
    </Page>
  )
}
