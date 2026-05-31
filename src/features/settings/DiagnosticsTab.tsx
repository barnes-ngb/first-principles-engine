import { useCallback, useEffect, useState } from 'react'
import { getDocs, limit, orderBy, query } from 'firebase/firestore'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { errorLogsCollection } from '../../core/firebase/firestore'
import type { ErrorLog } from '../../core/types/errorLog'

/**
 * Read-only diagnostics view (ARCH-11). Lists recent scrubbed `errorLog`
 * entries, newest first, so Nathan can see what's breaking on Shelly's phone.
 * Parent-only (gated by SettingsPage). It only ever reads — capturing errors
 * must never affect any domain/compliance data.
 */
function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs
  if (!Number.isFinite(diff)) return ''
  const sec = Math.round(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}

const sourceColor: Record<
  ErrorLog['source'],
  'default' | 'error' | 'warning' | 'info'
> = {
  'window.onerror': 'error',
  unhandledrejection: 'warning',
  'react-error-boundary': 'error',
  'react-section-boundary': 'warning',
}

export default function DiagnosticsTab() {
  const familyId = useFamilyId()
  const [entries, setEntries] = useState<ErrorLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const snap = await getDocs(
        query(errorLogsCollection(familyId), orderBy('clientTs', 'desc'), limit(50)),
      )
      setEntries(
        snap.docs.map((doc) => ({ ...(doc.data() as ErrorLog), id: doc.id })),
      )
    } catch {
      setError('Could not load diagnostics.')
    } finally {
      setLoading(false)
    }
  }, [familyId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Diagnostics
        </Typography>
        <Button size="small" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Recent client errors, newest first. Scrubbed of all personal
        information — type and location only, no names or content.
      </Typography>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      {!loading && !error && entries.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No errors recorded. 🎉
        </Typography>
      )}

      {!loading &&
        entries.map((entry) => (
          <Paper key={entry.id} variant="outlined" sx={{ p: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Chip
                size="small"
                label={entry.source}
                color={sourceColor[entry.source] ?? 'default'}
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {entry.name}
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Typography variant="caption" color="text.secondary">
                {relativeTime(entry.clientTs)}
              </Typography>
            </Box>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', wordBreak: 'break-word', mb: 0.5 }}
            >
              {entry.message}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              useFlexGap
              sx={{ color: 'text.secondary' }}
            >
              {entry.route && (
                <Typography variant="caption">route: {entry.route}</Typography>
              )}
              {entry.section && (
                <Typography variant="caption">section: {entry.section}</Typography>
              )}
              <Typography variant="caption">build: {entry.appBuild}</Typography>
              {entry.anonChildId && (
                <Typography variant="caption">child: {entry.anonChildId}</Typography>
              )}
            </Stack>
            {entry.stack && (
              <Box
                component="pre"
                sx={{
                  mt: 1,
                  p: 1,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  fontSize: 11,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {entry.stack}
              </Box>
            )}
          </Paper>
        ))}
    </Stack>
  )
}
