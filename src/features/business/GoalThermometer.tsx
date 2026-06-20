import { useMemo, useState } from 'react'
import CelebrationIcon from '@mui/icons-material/Celebration'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import LockIcon from '@mui/icons-material/Lock'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { BusinessGoalMilestone } from '../../core/types/business'
import { formatMoney } from './businessTotal'
import { computeGoalProgress } from './goalMath'

interface GoalThermometerProps {
  /** The saved milestone stack. */
  milestones: BusinessGoalMilestone[]
  /** Derived money-in total (chunk 2) — the meter's only input. Only climbs. */
  total: number
  /**
   * Representative net dollars per kit, for the optional "≈ N more kits" hint.
   * `$` stays primary; omit to hide the kit estimate.
   */
  netPerKit?: number
}

/**
 * Additive, collecting goal thermometer (FEAT-30 chunk 3).
 *
 * The meter reflects money-in, which only ever climbs. Milestones the total has
 * passed are COLLECTED and stay lit + checkmarked; the next one is highlighted
 * with "$X to the next unlock". Pedagogy guardrails (hard requirements):
 *   - Additive-only: nothing drops, depletes, or resets.
 *   - Collecting, not depleting/competing: no streaks, countdowns, deadlines,
 *     or comparison.
 *   - No deficit framing: we show what's unlocked + the next unlock, never a
 *     "% there / % to go" that can read as falling short.
 *
 * Mechanics carry the message — this is the most sensitive surface for a
 * perfectionist child, so it is structurally a collecting mechanic.
 */
export default function GoalThermometer({ milestones, total, netPerKit }: GoalThermometerProps) {
  const progress = useMemo(() => computeGoalProgress(milestones, total), [milestones, total])

  // First-cross celebration: announce when the collected count climbs. The
  // previous count is seeded to the initial value, so we never celebrate on
  // first load — only on a genuine new unlock during this session. Detecting
  // the change during render (not in an effect) is the React-recommended way.
  const [prevCollected, setPrevCollected] = useState(progress.collectedCount)
  const [celebrating, setCelebrating] = useState(false)
  const [celebrateLabel, setCelebrateLabel] = useState<string | null>(null)

  if (progress.collectedCount !== prevCollected) {
    if (progress.collectedCount > prevCollected) {
      // The newest collected rung is the top of the collected run.
      setCelebrateLabel(progress.milestones[progress.collectedCount - 1]?.label ?? 'a new milestone')
      setCelebrating(true)
    }
    setPrevCollected(progress.collectedCount)
  }

  if (milestones.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Build your goal stack above and your meter will appear here.
      </Typography>
    )
  }

  const nextMilestone =
    progress.nextIndex != null ? progress.milestones[progress.nextIndex] : null
  const kitsToNext =
    progress.amountToNext != null && netPerKit && netPerKit > 0
      ? Math.ceil(progress.amountToNext / netPerKit)
      : null

  return (
    <Stack spacing={2}>
      <Collapse in={celebrating}>
        <Alert
          icon={<CelebrationIcon fontSize="inherit" />}
          severity="success"
          onClose={() => setCelebrating(false)}
        >
          Unlocked: {celebrateLabel}! 🎉
        </Alert>
      </Collapse>

      <Box
        sx={{
          borderRadius: 2,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          p: 2,
          textAlign: 'center',
        }}
      >
        <Typography variant="h4" component="p" fontWeight={700}>
          {formatMoney(total)}
        </Typography>
        <Typography variant="body2">earned toward your goal</Typography>
      </Box>

      {progress.allUnlocked ? (
        <Alert icon={<CelebrationIcon fontSize="inherit" />} severity="success">
          You unlocked your whole goal stack! 🎉
        </Alert>
      ) : nextMilestone ? (
        <Box
          sx={{
            borderRadius: 2,
            border: 2,
            borderColor: 'primary.main',
            p: 1.5,
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Next unlock
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            {nextMilestone.label}
          </Typography>
          <Typography variant="body1" color="primary" fontWeight={700}>
            {formatMoney(progress.amountToNext ?? 0)} to go
          </Typography>
          {kitsToNext != null && (
            <Typography variant="caption" color="text.secondary">
              ≈ {kitsToNext} more {kitsToNext === 1 ? 'kit' : 'kits'}
            </Typography>
          )}
        </Box>
      ) : null}

      {/* The stack: collected rungs stay lit; the next is highlighted; future
          rungs are quietly locked. Rendered top-down so the highest goal sits
          at the top of the climb. */}
      <Stack spacing={1}>
        {[...progress.milestones].reverse().map((m) => {
          const state = m.collected ? 'collected' : m.isNext ? 'next' : 'locked'
          return (
            <Box
              key={m.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.25,
                borderRadius: 2,
                bgcolor:
                  state === 'collected'
                    ? 'success.light'
                    : state === 'next'
                      ? 'primary.light'
                      : 'action.hover',
                color: state === 'locked' ? 'text.disabled' : 'text.primary',
                opacity: state === 'locked' ? 0.7 : 1,
                border: state === 'next' ? 2 : 0,
                borderColor: 'primary.main',
              }}
            >
              {state === 'collected' ? (
                <CheckCircleIcon color="success" />
              ) : state === 'next' ? (
                <RadioButtonUncheckedIcon color="primary" />
              ) : (
                <LockIcon fontSize="small" />
              )}
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body1" fontWeight={state === 'locked' ? 500 : 700}>
                  {m.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Unlocks at {formatMoney(m.threshold)}
                </Typography>
              </Box>
              {state === 'collected' && (
                <Typography variant="caption" fontWeight={700} color="success.dark">
                  Collected ✓
                </Typography>
              )}
            </Box>
          )
        })}
      </Stack>
    </Stack>
  )
}
