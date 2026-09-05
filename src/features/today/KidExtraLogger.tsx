import { useCallback, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import type { ChecklistItem, DayLog } from '../../core/types'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { addDiamondEvent } from '../../core/xp/addDiamondEvent'
import { DIAMOND_EVENTS } from '../../core/types'
// FEAT-199: a plain read of the family's activity configs. Deliberately NOT
// `useActivityConfigs` — that hook runs `migrateToActivityConfigs` /
// `ensureDefaultActivityConfigs` and exposes the writer surface, and a kid
// opening Today must not seed or migrate anything. This is the same read-only
// subscribe the Shelly portal made for the same reason (FEAT-135); it is
// imported rather than copied so there is one definition of it.
import { useChatActivityConfigs } from '../shelly-chat/useChatActivityConfigs'
import { resolveQuickLogChips, type QuickLogChip } from './quickLogChips'

interface KidExtraLoggerProps {
  dayLog: DayLog
  persistDayLogImmediate: (updated: DayLog) => void
  familyId: string
  childId: string
  today: string
}

export default function KidExtraLogger({
  dayLog,
  persistDayLogImmediate,
  familyId,
  childId,
  today,
}: KidExtraLoggerProps) {
  const [showExtraLog, setShowExtraLog] = useState(false)
  const [extraActivity, setExtraActivity] = useState<QuickLogChip | null>(null)
  const [extraMinutes, setExtraMinutes] = useState<number | null>(null)
  const [savingExtra, setSavingExtra] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // FEAT-199: the chips are the family's, not the code's. Read-only; the
  // resolver owns the order, the dedupe, the cap and the trailing "Other".
  const activityConfigs = useChatActivityConfigs(familyId, childId)
  const quickLogChips = useMemo(() => resolveQuickLogChips(activityConfigs), [activityConfigs])

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
        subjectBucket: extraActivity.subject,
        source: 'manual' as const,
        category: 'choose' as const,
        mvdEssential: false,
        engagement: 'engaged' as const,
      }

      const updatedChecklist = [...(dayLog.checklist ?? []), newItem]
      persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })

      // Award 5 XP for extra activity
      const dedupBase = `extra_${extraActivity.label}_${today}`
      if (familyId && childId) {
        void addXpEvent(
          familyId, childId, 'MANUAL_AWARD', 5, `${dedupBase}-xp`,
          { reason: extraActivity.label },
        ).catch((err) => console.error('[XP] Extra activity award failed:', err))

        // Award 2 diamonds for extra activity
        void addDiamondEvent({
          familyId,
          childId,
          amount: 2,
          type: DIAMOND_EVENTS.EXTRA_ACTIVITY,
          reason: extraActivity.label,
          dedupKey: `${dedupBase}-diamond`,
        }).catch((err) => console.error('[Diamond] Extra activity award failed:', err))
      }

      setShowExtraLog(false)
      setExtraActivity(null)
      setExtraMinutes(null)
    } catch (err) {
      console.error('Extra activity save failed:', err)
      setSaveError('Hmm, that did not save. Try again.')
    }
    setSavingExtra(false)
  }, [extraActivity, extraMinutes, dayLog, persistDayLogImmediate, familyId, childId, today])

  // FEAT-186: the logger renders for BOTH kids unconditionally, so its
  // Minecraft framing ("I Did More Mining!") was Lincoln's personality showing
  // up on a six-year-old's screen with no way to opt out — and the old body
  // line named three tablet apps London does not use, in fourteen words.
  // Neutral, short, true. The preset chips were deliberately left alone: their
  // labels are written into `days.checklist[].label`, so they are a stored
  // data shape, not copy (filed, FEAT-186). FEAT-199 did not reword them
  // either — it made the row EXTENSIBLE, moving the same six verbatim into
  // `quickLogChips.ts` as the defaults behind the family's own flagged
  // activity configs.
  return (
    <SectionCard title="⭐ I Did More!">
      <Stack spacing={2} sx={{ py: 1 }}>
        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          Did more work today? Add it here.
        </Typography>
        {saveError && (
          <Alert
            severity="error"
            onClose={() => setSaveError(null)}
            sx={{ width: '100%' }}
          >
            {saveError}
          </Alert>
        )}

        {!showExtraLog ? (
          <Button
            variant="outlined"
            color="primary"
            size="large"
            onClick={() => { setShowExtraLog(true); setSaveError(null) }}
            sx={{ alignSelf: 'center' }}
          >
            ⭐ Add More Work
          </Button>
        ) : (
          <Stack spacing={2}>
            {/* What did you do? — single tap */}
            <Typography variant="subtitle2">What did you work on?</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {quickLogChips.map((opt) => (
                <Chip
                  key={opt.key}
                  label={opt.label}
                  onClick={() => setExtraActivity(opt)}
                  color={extraActivity?.key === opt.key ? 'primary' : 'default'}
                  variant={extraActivity?.key === opt.key ? 'filled' : 'outlined'}
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
              {savingExtra ? 'Saving...' : '💎 Save It!'}
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
