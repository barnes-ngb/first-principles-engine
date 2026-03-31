import { useCallback, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import type { ChecklistItem, DayLog } from '../../core/types'
import type { SubjectBucket } from '../../core/types/enums'

interface KidExtraLoggerProps {
  dayLog: DayLog
  persistDayLogImmediate: (updated: DayLog) => void
}

export default function KidExtraLogger({
  dayLog,
  persistDayLogImmediate,
}: KidExtraLoggerProps) {
  const [showExtraLog, setShowExtraLog] = useState(false)
  const [extraActivity, setExtraActivity] = useState<{ label: string; subject: string } | null>(null)
  const [extraMinutes, setExtraMinutes] = useState<number | null>(null)
  const [savingExtra, setSavingExtra] = useState(false)

  const extraItems = useMemo(() => {
    const items = dayLog.checklist
    if (!items) return []
    return items
      .filter((item) => item.source === 'manual' && item.completed)
      .map((item) => ({
        label: item.label.replace(/\s*\(\d+m\)\s*$/, ''),
        minutes: item.estimatedMinutes ?? 0,
      }))
  }, [dayLog.checklist])

  const handleSaveExtra = useCallback(async () => {
    if (!extraActivity || !extraMinutes || !dayLog) return
    setSavingExtra(true)
    try {
      const newItem: ChecklistItem = {
        label: `${extraActivity.label} (${extraMinutes}m)`,
        completed: true,
        estimatedMinutes: extraMinutes,
        subjectBucket: extraActivity.subject as SubjectBucket,
        source: 'manual' as const,
        category: 'choose' as const,
        mvdEssential: false,
        engagement: 'engaged' as const,
      }

      const updatedChecklist = [...(dayLog.checklist ?? []), newItem]
      persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })

      setShowExtraLog(false)
      setExtraActivity(null)
      setExtraMinutes(null)
    } catch (err) {
      console.error('Extra activity save failed:', err)
    }
    setSavingExtra(false)
  }, [extraActivity, extraMinutes, dayLog, persistDayLogImmediate])

  return (
    <SectionCard title="⛏️ I Did More Mining!">
      <Stack spacing={2} sx={{ py: 1 }}>
        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          Did extra work on your tablet or on your own? Log it here!
        </Typography>

        {!showExtraLog ? (
          <Button
            variant="outlined"
            color="primary"
            size="large"
            onClick={() => setShowExtraLog(true)}
            sx={{ alignSelf: 'center' }}
          >
            ⛏️ I Did More!
          </Button>
        ) : (
          <Stack spacing={2}>
            {/* What did you do? — single tap */}
            <Typography variant="subtitle2">What did you work on?</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {[
                { label: '📖 Reading Eggs', subject: 'Reading' },
                { label: '🔢 Math App', subject: 'Math' },
                { label: '📚 Reading', subject: 'Reading' },
                { label: '✏️ Writing', subject: 'LanguageArts' },
                { label: '🔬 Science', subject: 'Science' },
                { label: '🎮 Other', subject: 'Other' },
              ].map((opt) => (
                <Chip
                  key={opt.label}
                  label={opt.label}
                  onClick={() => setExtraActivity(opt)}
                  color={extraActivity?.label === opt.label ? 'primary' : 'default'}
                  variant={extraActivity?.label === opt.label ? 'filled' : 'outlined'}
                  sx={{ fontSize: '0.95rem', py: 2.5 }}
                />
              ))}
            </Stack>

            {/* How long? — single tap */}
            <Typography variant="subtitle2">How long?</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {[
                { label: '15 min', minutes: 15 },
                { label: '30 min', minutes: 30 },
                { label: '45 min', minutes: 45 },
                { label: '1 hour', minutes: 60 },
              ].map((opt) => (
                <Chip
                  key={opt.label}
                  label={opt.label}
                  onClick={() => setExtraMinutes(opt.minutes)}
                  color={extraMinutes === opt.minutes ? 'primary' : 'default'}
                  variant={extraMinutes === opt.minutes ? 'filled' : 'outlined'}
                  sx={{ fontSize: '0.95rem', py: 2.5 }}
                />
              ))}
            </Stack>

            {/* Save */}
            <Button
              variant="contained"
              color="success"
              disabled={!extraActivity || !extraMinutes || savingExtra}
              onClick={handleSaveExtra}
              size="large"
            >
              {savingExtra ? 'Saving...' : '💎 Log It!'}
            </Button>

            <Button
              variant="text"
              size="small"
              onClick={() => { setShowExtraLog(false); setExtraActivity(null); setExtraMinutes(null) }}
            >
              Cancel
            </Button>
          </Stack>
        )}

        {/* Show already-logged extras for today */}
        {extraItems.length > 0 && (
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">Logged today:</Typography>
            {extraItems.map((item, i) => (
              <Chip
                key={i}
                label={`${item.label} — ${item.minutes}m`}
                size="small"
                color="success"
                variant="outlined"
              />
            ))}
          </Stack>
        )}
      </Stack>
    </SectionCard>
  )
}
