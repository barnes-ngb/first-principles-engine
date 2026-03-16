import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { getDocs, query, where } from 'firebase/firestore'

import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { aiUsageCollection } from '../../core/firebase/firestore'
import type { AIUsageEntry } from '../../core/types/domain'

// ── Display helpers ──────────────────────────────────────────────

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-4-20250514': 'Claude Sonnet',
  'claude-haiku-4-5-20251001': 'Claude Haiku',
  'dall-e-3': 'DALL-E 3',
  'gpt-image-1': 'GPT Image',
}

const TASK_TYPE_LABELS: Record<string, string> = {
  plan: 'Planning',
  evaluate: 'Evaluation',
  generate: 'Generation',
  chat: 'Chat',
  'image-generation': 'Image Generation',
}

/** Models priced per-call (no token counts). */
const IMAGE_MODELS = new Set(['dall-e-3', 'gpt-image-1'])

/** Approximate cost per image call (USD). */
const IMAGE_COST_PER_CALL: Record<string, number> = {
  'dall-e-3': 0.04,
  'gpt-image-1': 0.02,
}

/** Approximate cost per 1M tokens (USD). */
const COST_PER_M_INPUT: Record<string, number> = {
  'claude-sonnet-4-20250514': 3,
  'claude-haiku-4-5-20251001': 0.8,
}
const COST_PER_M_OUTPUT: Record<string, number> = {
  'claude-sonnet-4-20250514': 15,
  'claude-haiku-4-5-20251001': 4,
}

/** Safely coerce a possibly-undefined/NaN token count to a number. */
function safeTokens(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function estimateCost(entries: AIUsageEntry[]): number {
  let cost = 0
  for (const e of entries) {
    if (IMAGE_MODELS.has(e.model)) {
      cost += IMAGE_COST_PER_CALL[e.model] ?? 0.04
    } else {
      const inputRate = COST_PER_M_INPUT[e.model] ?? 1
      const outputRate = COST_PER_M_OUTPUT[e.model] ?? 5
      cost += (safeTokens(e.inputTokens) / 1_000_000) * inputRate
      cost += (safeTokens(e.outputTokens) / 1_000_000) * outputRate
    }
  }
  return cost
}

/** Get the ISO date string for the start of the current month. */
function monthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00`
}

// ── Component ────────────────────────────────────────────────────

export default function AIUsagePanel() {
  const familyId = useFamilyId()
  const [entries, setEntries] = useState<AIUsageEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchUsage = useCallback(async () => {
    const q = query(
      aiUsageCollection(familyId),
      where('createdAt', '>=', monthStart()),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
  }, [familyId])

  useEffect(() => {
    let cancelled = false
    fetchUsage()
      .then((data) => {
        if (!cancelled) setEntries(data)
      })
      .catch((err) => console.error('Failed to load AI usage', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchUsage])

  // ── Derived stats ──────────────────────────────────────────────

  const totalCalls = entries.length
  const totalTokens = useMemo(
    () =>
      entries.reduce((sum, e) => {
        if (IMAGE_MODELS.has(e.model)) return sum
        return sum + safeTokens(e.inputTokens) + safeTokens(e.outputTokens)
      }, 0),
    [entries],
  )
  const cost = useMemo(() => estimateCost(entries), [entries])

  /** Group by model for the breakdown table. */
  const modelBreakdown = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number }>()
    for (const e of entries) {
      const prev = map.get(e.model) ?? { calls: 0, tokens: 0 }
      const isImage = IMAGE_MODELS.has(e.model)
      map.set(e.model, {
        calls: prev.calls + 1,
        tokens: isImage
          ? prev.tokens
          : prev.tokens + safeTokens(e.inputTokens) + safeTokens(e.outputTokens),
      })
    }
    return [...map.entries()]
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.calls - a.calls)
  }, [entries])

  /** Group by task type. */
  const taskBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      map.set(e.taskType, (map.get(e.taskType) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([taskType, calls]) => ({ taskType, calls }))
      .sort((a, b) => b.calls - a.calls)
  }, [entries])

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <SectionCard title="AI Usage — This Month">
        <Stack alignItems="center" py={3}>
          <CircularProgress size={28} />
        </Stack>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="AI Usage — This Month">
      <Stack spacing={2}>
        {/* Summary row */}
        <Stack direction="row" spacing={4} flexWrap="wrap">
          <Stack>
            <Typography variant="caption" color="text.secondary">
              API Calls
            </Typography>
            <Typography variant="h5">{totalCalls}</Typography>
          </Stack>
          <Stack>
            <Typography variant="caption" color="text.secondary">
              Tokens Used
            </Typography>
            <Typography variant="h5">{formatTokens(totalTokens)}</Typography>
          </Stack>
          <Stack>
            <Typography variant="caption" color="text.secondary">
              Est. Cost
            </Typography>
            <Typography variant="h5">${cost.toFixed(2)}</Typography>
          </Stack>
        </Stack>

        {/* Model breakdown */}
        {modelBreakdown.length > 0 && (
          <Stack spacing={1}>
            <Typography variant="subtitle2">By Model</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Model</TableCell>
                  <TableCell align="right">Calls</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {modelBreakdown.map((row) => (
                  <TableRow key={row.model}>
                    <TableCell>
                      {MODEL_LABELS[row.model] ?? row.model}
                    </TableCell>
                    <TableCell align="right">{row.calls}</TableCell>
                    <TableCell align="right">
                      {IMAGE_MODELS.has(row.model)
                        ? '—'
                        : formatTokens(row.tokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Stack>
        )}

        {/* Task type breakdown */}
        {taskBreakdown.length > 0 && (
          <Stack spacing={1}>
            <Typography variant="subtitle2">By Task Type</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Calls</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {taskBreakdown.map((row) => (
                  <TableRow key={row.taskType}>
                    <TableCell>
                      {TASK_TYPE_LABELS[row.taskType] ?? row.taskType}
                    </TableCell>
                    <TableCell align="right">{row.calls}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Stack>
        )}

        {totalCalls === 0 && (
          <Typography color="text.secondary">
            No AI usage recorded this month.
          </Typography>
        )}
      </Stack>
    </SectionCard>
  )
}
