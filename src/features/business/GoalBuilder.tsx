import { useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { formatMoney } from './businessTotal'
import { withCumulativeThresholds } from './goalMath'
import type { EditableMilestone } from './useBusinessGoal'

/**
 * Quick-add suggestions for the goal stack. Prices MOVE (console + Game Pass
 * especially), so the price is a starting point Lincoln edits — editing it is
 * the budgeting lesson. Spec: docs/BUSINESS_TAB_DESIGN.md (Goal stack).
 */
interface GoalSuggestion {
  label: string
  price: number
}

const GOAL_SUGGESTIONS: GoalSuggestion[] = [
  { label: 'Xbox Series S', price: 350 },
  { label: 'A game', price: 60 },
  { label: 'Second controller (play with London)', price: 65 },
  { label: 'Game Pass', price: 20 },
]

let idCounter = 0
function newId(): string {
  idCounter += 1
  return `m_${Date.now().toString(36)}_${idCounter}`
}

interface GoalBuilderProps {
  /** Operator whose goal this is (Lincoln for now). */
  childId: string
  /** Saved stack to seed the editor (recomputed thresholds ignored here). */
  milestones: EditableMilestone[]
  saving: boolean
  onSave: (childId: string, milestones: EditableMilestone[]) => Promise<void>
}

/**
 * Goal builder (FEAT-30 chunk 3). Lincoln (with Nathan) assembles his target
 * stack — Xbox + games — with real, editable prices. This is the ownership
 * moment + the budgeting lesson: the cumulative thresholds show the climbing
 * math, so the meter is genuinely his.
 *
 * Kid-accessible (it's his goal, not money/customer data — no parent gate).
 */
export default function GoalBuilder({ childId, milestones, saving, onSave }: GoalBuilderProps) {
  const [draft, setDraft] = useState<EditableMilestone[]>(milestones)
  const [dirty, setDirty] = useState(false)
  const [seed, setSeed] = useState(milestones)
  const [error, setError] = useState<string | null>(null)

  // Re-seed from saved state until the user starts editing (avoid clobbering
  // an in-progress edit when the snapshot re-fires). Adjusting state during
  // render is the React-recommended pattern for syncing to a changed prop.
  if (!dirty && seed !== milestones) {
    setSeed(milestones)
    setDraft(milestones)
  }

  const stamped = useMemo(() => withCumulativeThresholds(draft), [draft])
  const stackTotal = stamped.length ? stamped[stamped.length - 1].threshold : 0

  const markDirty = () => setDirty(true)

  const addSuggestion = (s: GoalSuggestion) => {
    setDraft((prev) => [...prev, { id: newId(), label: s.label, price: s.price }])
    markDirty()
  }

  const addBlank = () => {
    setDraft((prev) => [...prev, { id: newId(), label: '', price: 0 }])
    markDirty()
  }

  const updateRow = (id: string, patch: Partial<EditableMilestone>) => {
    setDraft((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
    markDirty()
  }

  const removeRow = (id: string) => {
    setDraft((prev) => prev.filter((m) => m.id !== id))
    markDirty()
  }

  const move = (index: number, delta: number) => {
    setDraft((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    markDirty()
  }

  const handleSave = async () => {
    setError(null)
    try {
      await onSave(childId, draft)
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your goal.')
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Build your goal stack. Add what you're saving for, set the real prices, and put them in the
        order you want to unlock them.
      </Typography>

      <Box>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          Quick add
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {GOAL_SUGGESTIONS.map((s) => (
            <Chip
              key={s.label}
              label={`${s.label} · ${formatMoney(s.price)}`}
              variant="outlined"
              onClick={() => addSuggestion(s)}
              icon={<AddIcon />}
            />
          ))}
        </Box>
      </Box>

      {stamped.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No milestones yet — add one above to start building your goal.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {stamped.map((m, i) => (
            <Box
              key={m.id}
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                p: 1.5,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Stack spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
                  <TextField
                    label={`Milestone ${i + 1}`}
                    value={m.label}
                    onChange={(e) => updateRow(m.id, { label: e.target.value })}
                    placeholder="e.g. Xbox Series S"
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Price"
                    value={Number.isFinite(m.price) ? String(m.price) : ''}
                    onChange={(e) => updateRow(m.id, { price: Number(e.target.value) })}
                    type="number"
                    inputMode="decimal"
                    size="small"
                    slotProps={{
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                      htmlInput: { min: 0, step: '1' },
                    }}
                    sx={{ maxWidth: 160 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Unlocks at {formatMoney(m.threshold)} earned
                  </Typography>
                </Stack>
                <Stack>
                  <IconButton
                    aria-label="Move up"
                    size="small"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label="Move down"
                    size="small"
                    disabled={i === stamped.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label="Remove milestone"
                    size="small"
                    color="error"
                    onClick={() => removeRow(m.id)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      <Button startIcon={<AddIcon />} onClick={addBlank} sx={{ alignSelf: 'flex-start' }}>
        Add a milestone
      </Button>

      {stamped.length > 0 && (
        <Box
          sx={{
            borderRadius: 2,
            bgcolor: 'action.hover',
            p: 1.5,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Whole goal stack
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            {formatMoney(stackTotal)}
          </Typography>
        </Box>
      )}

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      <Button
        variant="contained"
        size="large"
        onClick={handleSave}
        disabled={saving || !dirty}
        sx={{ alignSelf: 'flex-start' }}
      >
        {saving ? 'Saving…' : 'Save goal'}
      </Button>
    </Stack>
  )
}
