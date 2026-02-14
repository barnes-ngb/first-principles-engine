import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useActiveChild } from '../core/hooks/useActiveChild'
import { dayLogDocId } from '../features/today/daylog.model'
import { formatDateYmd } from '../lib/format'

declare const __BUILD_TIMESTAMP__: string

/** localStorage key used by useChildren to persist the selected child. */
const LS_CHILD_KEY = 'fpe_active_child_id'

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
  const [minimized, setMinimized] = useState(false)

  const isVisible = searchParams.get('debug') === '1'

  // Use local date (not UTC) to match TodayPage / daylog.model
  const dateKey = useMemo(() => formatDateYmd(new Date()), [])
  const dayLogKey = activeChildId ? dayLogDocId(dateKey, activeChildId) : '(none)'
  const lsChildId = useMemo(() => localStorage.getItem(LS_CHILD_KEY) ?? '(unset)', [])
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
        py: 0.5,
        fontFamily: 'monospace',
        fontSize: '0.7rem',
        lineHeight: 1.5,
        cursor: 'pointer',
        maxHeight: minimized ? '1.5em' : undefined,
        overflow: 'hidden',
      }}
      onClick={() => setMinimized((prev) => !prev)}
    >
      {minimized ? (
        <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit', color: 'inherit' }}>
          <strong>DEBUG</strong> (tap to expand)
        </Typography>
      ) : (
        <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit', color: 'inherit', whiteSpace: 'pre-wrap' }}>
          <strong>DEBUG</strong>{' | '}
          build: {buildId}{' | '}
          sw: {swStatus}
          {'\n'}
          child: {activeChild?.name ?? '?'} ({activeChildId || 'none'}){' | '}
          ls: {lsChildId}
          {'\n'}
          dateKey: {dateKey}{' | '}
          dayLog: {dayLogKey}
          {'\n'}
          route: {location.pathname}{' | '}
          ts: {new Date().toLocaleString()}
          {'\n'}
          <em style={{ color: '#888' }}>(tap to minimize)</em>
        </Typography>
      )}
    </Box>
  )
}
