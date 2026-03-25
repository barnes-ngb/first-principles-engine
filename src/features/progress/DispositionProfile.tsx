import { useCallback, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import ChildSelector from '../../components/ChildSelector'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { useAI, TaskType } from '../../core/ai/useAI'

// ── Types ──────────────────────────────────────────────────────

interface DispositionEntry {
  level: 'growing' | 'steady' | 'emerging' | 'not-yet-visible'
  narrative: string
  trend: 'up' | 'stable' | 'down' | 'insufficient-data'
}

interface DispositionResult {
  profileDate: string
  periodWeeks: number
  dispositions: {
    curiosity: DispositionEntry
    persistence: DispositionEntry
    articulation: DispositionEntry
    selfAwareness: DispositionEntry
    ownership: DispositionEntry
  }
  celebration: string
  nudge: string
  parentNote: string
}

const DISPOSITION_META: Array<{
  key: keyof DispositionResult['dispositions']
  label: string
  icon: string
}> = [
  { key: 'curiosity', label: 'Curiosity', icon: '\uD83D\uDD0D' },
  { key: 'persistence', label: 'Persistence', icon: '\uD83D\uDCAA' },
  { key: 'articulation', label: 'Articulation', icon: '\uD83D\uDDE3\uFE0F' },
  { key: 'selfAwareness', label: 'Self-Awareness', icon: '\uD83E\uDE9E' },
  { key: 'ownership', label: 'Ownership', icon: '\u2728' },
]

const levelColor: Record<string, 'success' | 'primary' | 'warning' | 'default'> = {
  growing: 'success',
  steady: 'primary',
  emerging: 'warning',
  'not-yet-visible': 'default',
}

const trendDisplay: Record<string, { symbol: string; color: string }> = {
  up: { symbol: '\u2191', color: '#16a34a' },
  stable: { symbol: '\u2192', color: '#2563eb' },
  down: { symbol: '\u2193', color: '#d97706' },
  'insufficient-data': { symbol: '?', color: '#9ca3af' },
}

// ── Component ──────────────────────────────────────────────────

export default function DispositionProfile() {
  const familyId = useFamilyId()
  const {
    children,
    activeChildId,
    setActiveChildId,
    activeChild,
    isLoading: isLoadingChildren,
    addChild,
  } = useActiveChild()
  const { chat, error: aiError } = useAI()

  const [result, setResult] = useState<DispositionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    if (!familyId || !activeChildId) return
    setLoading(true)
    setError(null)

    try {
      const response = await chat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Disposition,
        messages: [{ role: 'user', content: 'Generate the profile.' }],
      })

      if (!response?.message) {
        setError(aiError?.message ?? 'No response from AI. Please try again.')
        return
      }

      // Parse JSON from response
      const jsonMatch = response.message.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        setError('Could not parse AI response.')
        return
      }
      const parsed = JSON.parse(jsonMatch[0]) as DispositionResult
      setResult(parsed)
    } catch (err) {
      console.error('Disposition generation failed:', err)
      setError('Failed to generate profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [familyId, activeChildId, chat])

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
      <ChildSelector
        children={children}
        selectedChildId={activeChildId}
        onSelect={setActiveChildId}
        onChildAdded={addChild}
        isLoading={isLoadingChildren}
        emptyMessage="Add a child to view their learning profile."
      />

      {!result && !loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Generate a learning disposition profile from the last 4 weeks of day log data.
          </Typography>
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={!activeChildId}
            size="large"
          >
            Generate Learning Profile
          </Button>
        </Box>
      )}

      {loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography color="text.secondary">
            Analyzing 4 weeks of learning data...
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ my: 2 }} action={
          <Button color="inherit" size="small" onClick={handleGenerate}>Retry</Button>
        }>
          {error}
        </Alert>
      )}

      {result && (
        <Stack spacing={2}>
          {/* Celebration */}
          <Card sx={{ bgcolor: 'success.50', border: '1px solid', borderColor: 'success.200' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {activeChild?.name}&apos;s Learning Profile
              </Typography>
              <Typography variant="body1">{result.celebration}</Typography>
            </CardContent>
          </Card>

          {/* Disposition cards */}
          {DISPOSITION_META.map(({ key, label, icon }) => {
            const d = result.dispositions[key]
            if (!d) return null
            const trend = trendDisplay[d.trend] ?? trendDisplay['insufficient-data']
            return (
              <Card key={key} variant="outlined">
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Typography variant="h6" component="span">{icon}</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
                      {label}
                    </Typography>
                    <Chip
                      label={d.level}
                      size="small"
                      color={levelColor[d.level] ?? 'default'}
                    />
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 700, color: trend.color, minWidth: 24, textAlign: 'center' }}
                    >
                      {trend.symbol}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {d.narrative}
                  </Typography>
                </CardContent>
              </Card>
            )
          })}

          {/* Nudge */}
          <Card sx={{ bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.200' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Gentle Nudge</Typography>
              <Typography variant="body2">{result.nudge}</Typography>
            </CardContent>
          </Card>

          {/* Parent note */}
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', px: 1 }}>
            {result.parentNote}
          </Typography>

          {/* Refresh */}
          <Box sx={{ textAlign: 'center', pt: 1 }}>
            <Button variant="outlined" onClick={handleGenerate} disabled={loading}>
              Refresh Profile
            </Button>
          </Box>
        </Stack>
      )}
    </Box>
  )
}
