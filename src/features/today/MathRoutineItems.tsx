import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { MathRoutine, RoutineItem } from '../../core/types/domain'
import { RoutineItemKey } from '../../core/types/enums'
import SectionCard from '../../components/SectionCard'
import type { XP_VALUES as XpValuesType } from './xp'

interface MathRoutineItemsProps {
  math: MathRoutine
  items: Set<string>
  xpValues: typeof XpValuesType
  onUpdateMath: (value: Partial<MathRoutine>) => void
  onUpdateMathItem: (field: 'numberSense' | 'wordProblems', value: Partial<RoutineItem>) => void
}

export default function MathRoutineItems({
  math,
  items,
  xpValues,
  onUpdateMath,
  onUpdateMathItem,
}: MathRoutineItemsProps) {
  return (
    <SectionCard title="Math">
      <Stack spacing={1.5}>
        {/* Legacy single math toggle */}
        {items.has(RoutineItemKey.Math) && (
        <>
          <FormControlLabel
            control={
              <Checkbox
                checked={math.done}
                onChange={(e) => onUpdateMath({ done: e.target.checked })}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Math completed
                </Typography>
                <Chip size="small" label={`+${xpValues.math} XP`} variant="outlined" />
              </Stack>
            }
          />
          {math.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Problems"
                type="number"
                size="small"
                fullWidth
                value={math.problems ?? ''}
                onChange={(e) =>
                  onUpdateMath({
                    problems: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 110 } }}
              />
              <TextField
                label="Pages"
                type="number"
                size="small"
                fullWidth
                value={math.pages ?? ''}
                onChange={(e) =>
                  onUpdateMath({
                    pages: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={math.note ?? ''}
                onChange={(e) => onUpdateMath({ note: e.target.value })}
              />
            </Stack>
          )}
        </>
        )}

        {/* Number Sense / Facts */}
        {items.has(RoutineItemKey.NumberSenseOrFacts) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={math.numberSense?.done ?? false}
                onChange={(e) =>
                  onUpdateMathItem('numberSense', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Number Sense / Facts (10 min)
                </Typography>
                <Chip size="small" label={`+${xpValues.numberSenseOrFacts} XP`} variant="outlined" />
              </Stack>
            }
          />
          {math.numberSense?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Minutes"
                type="number"
                size="small"
                fullWidth
                value={math.numberSense?.minutes ?? ''}
                onChange={(e) =>
                  onUpdateMathItem('numberSense', {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  } as Partial<RoutineItem>)
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={math.numberSense?.note ?? ''}
                onChange={(e) =>
                  onUpdateMathItem('numberSense', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}

        {/* Word Problems (Modeled) */}
        {items.has(RoutineItemKey.WordProblemsModeled) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={math.wordProblems?.done ?? false}
                onChange={(e) =>
                  onUpdateMathItem('wordProblems', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Word Problems &ndash; Modeled (10-15 min)
                </Typography>
                <Chip size="small" label={`+${xpValues.wordProblemsModeled} XP`} variant="outlined" />
              </Stack>
            }
          />
          {math.wordProblems?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Minutes"
                type="number"
                size="small"
                fullWidth
                value={math.wordProblems?.minutes ?? ''}
                onChange={(e) =>
                  onUpdateMathItem('wordProblems', {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  } as Partial<RoutineItem>)
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Count"
                type="number"
                size="small"
                fullWidth
                value={math.wordProblems?.count ?? ''}
                onChange={(e) =>
                  onUpdateMathItem('wordProblems', {
                    count: e.target.value ? Number(e.target.value) : undefined,
                  } as Partial<RoutineItem>)
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={math.wordProblems?.note ?? ''}
                onChange={(e) =>
                  onUpdateMathItem('wordProblems', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}
      </Stack>
    </SectionCard>
  )
}
