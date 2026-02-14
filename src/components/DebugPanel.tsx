import { useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useActiveChild } from '../core/hooks/useActiveChild'

/**
 * Lightweight debug panel toggled via `?debug=1` query parameter.
 * Shows activeChildId, current route, dayLog doc key, and last save timestamp.
 */
export default function DebugPanel() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const { activeChildId, activeChild } = useActiveChild()

  const isVisible = searchParams.get('debug') === '1'

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const dayLogKey = activeChildId ? `${today}_${activeChildId}` : '(none)'

  if (!isVisible) return null

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        bgcolor: 'rgba(0, 0, 0, 0.85)',
        color: '#0f0',
        px: 2,
        py: 1,
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        lineHeight: 1.6,
      }}
    >
      <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit', color: 'inherit' }}>
        <strong>DEBUG</strong>{' | '}
        child: {activeChild?.name ?? '?'} ({activeChildId || 'none'}){' | '}
        route: {location.pathname}{' | '}
        dayLog: {dayLogKey}{' | '}
        ts: {new Date().toISOString()}
      </Typography>
    </Box>
  )
}
