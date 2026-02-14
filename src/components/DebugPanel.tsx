import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useActiveChild } from '../core/hooks/useActiveChild'

declare const __BUILD_TIMESTAMP__: string

function getInitialSwStatus() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return 'unsupported'
  }
  return 'checking...'
}

function useServiceWorkerStatus() {
  const [status, setStatus] = useState(getInitialSwStatus)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) {
        setStatus('none')
        return
      }
      const controlling = !!navigator.serviceWorker.controller
      setStatus(controlling ? 'controlling' : 'registered')
    }).catch(() => {
      setStatus('error')
    })
  }, [])

  return status
}

/**
 * Lightweight debug panel toggled via `?debug=1` query parameter.
 * Shows buildId, activeChildId, current route, dayLog doc key,
 * service worker status, and timestamp.
 */
export default function DebugPanel() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const { activeChildId, activeChild } = useActiveChild()
  const swStatus = useServiceWorkerStatus()

  const isVisible = searchParams.get('debug') === '1'

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const dayLogKey = activeChildId ? `${today}_${activeChildId}` : '(none)'
  const buildId = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev'

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
        build: {buildId}{' | '}
        child: {activeChild?.name ?? '?'} ({activeChildId || 'none'}){' | '}
        route: {location.pathname}{' | '}
        dayLog: {dayLogKey}{' | '}
        sw: {swStatus}{' | '}
        ts: {new Date().toISOString()}
      </Typography>
    </Box>
  )
}
