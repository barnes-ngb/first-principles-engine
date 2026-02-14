import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useActiveChild } from '../core/hooks/useActiveChild'

const buildId = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

/**
 * Lightweight debug panel toggled via `?debug=1` query parameter.
 * Shows buildId, activeChildId, current route, dayLog doc key,
 * service worker status, and last save timestamp.
 *
 * Can also be toggled by tapping the page title 5 times quickly.
 */
export default function DebugPanel() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const { activeChildId, activeChild } = useActiveChild()
  const swSupported = 'serviceWorker' in navigator
  const [swStatus, setSwStatus] = useState(swSupported ? 'n/a' : 'unsupported')

  const isVisible = searchParams.get('debug') === '1'

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const dayLogKey = activeChildId ? `${today}_${activeChildId}` : '(none)'

  useEffect(() => {
    if (!isVisible || !swSupported) return
    let cancelled = false
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (cancelled) return
      if (!reg) {
        setSwStatus('none')
      } else if (reg.active) {
        setSwStatus('active')
      } else if (reg.installing) {
        setSwStatus('installing')
      } else if (reg.waiting) {
        setSwStatus('waiting')
      } else {
        setSwStatus('registered')
      }
    }).catch(() => {
      if (!cancelled) setSwStatus('error')
    })
    return () => { cancelled = true }
  }, [isVisible, swSupported])

  if (!isVisible) return null

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        bgcolor: 'rgba(0, 0, 0, 0.9)',
        color: '#0f0',
        px: 2,
        py: 1,
        fontFamily: 'monospace',
        fontSize: '0.7rem',
        lineHeight: 1.8,
        maxHeight: '30vh',
        overflowY: 'auto',
      }}
    >
      <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit', color: 'inherit' }}>
        <strong>DEBUG</strong>
      </Typography>
      <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit', color: 'inherit' }}>
        build: {buildId}
      </Typography>
      <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit', color: 'inherit' }}>
        child: {activeChild?.name ?? '?'} ({activeChildId || 'none'})
      </Typography>
      <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit', color: 'inherit' }}>
        route: {location.pathname}
      </Typography>
      <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit', color: 'inherit' }}>
        dayLog: {dayLogKey}
      </Typography>
      <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit', color: 'inherit' }}>
        sw: {swStatus}
      </Typography>
      <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit', color: '#888' }}>
        ts: {new Date().toISOString()}
      </Typography>
    </Box>
  )
}
