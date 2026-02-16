import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import CloseIcon from '@mui/icons-material/Close'

const DISMISSED_KEY = 'fpe_help_dismissed'
const DISMISS_COUNT_KEY = 'fpe_help_dismiss_count'

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}

function setDismissed(dismissed: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]))
}

function getDismissCount(pageKey: string): number {
  try {
    const raw = localStorage.getItem(DISMISS_COUNT_KEY)
    if (raw) {
      const counts = JSON.parse(raw) as Record<string, number>
      return counts[pageKey] ?? 0
    }
  } catch { /* ignore */ }
  return 0
}

function incrementDismissCount(pageKey: string) {
  try {
    const raw = localStorage.getItem(DISMISS_COUNT_KEY)
    const counts = raw ? JSON.parse(raw) as Record<string, number> : {}
    counts[pageKey] = (counts[pageKey] ?? 0) + 1
    localStorage.setItem(DISMISS_COUNT_KEY, JSON.stringify(counts))
  } catch { /* ignore */ }
}

interface HelpStripProps {
  /** Unique key for this page's help strip (used for persistent dismiss) */
  pageKey: string
  /** The help text to display */
  text: string
  /** Max number of times to auto-show before staying hidden. Omit for unlimited. */
  maxShowCount?: number
  /** When true, force-show the banner regardless of dismiss state. */
  forceShow?: boolean
}

export default function HelpStrip({ pageKey, text, maxShowCount, forceShow }: HelpStripProps) {
  const [visible, setVisible] = useState(() => {
    if (forceShow) return true
    if (getDismissed().has(pageKey)) {
      // Check if we should still auto-show based on maxShowCount
      if (maxShowCount != null && getDismissCount(pageKey) < maxShowCount) {
        return true
      }
      return false
    }
    return true
  })
  const [expanded, setExpanded] = useState(visible)

  const handleDismiss = useCallback(() => {
    setExpanded(false)
    const dismissed = getDismissed()
    dismissed.add(pageKey)
    setDismissed(dismissed)
    incrementDismissCount(pageKey)
    // After collapse animation, hide completely
    setTimeout(() => setVisible(false), 300)
  }, [pageKey])

  const handleToggle = useCallback(() => {
    if (!expanded && !visible) {
      setVisible(true)
      // Small delay so Collapse can animate
      requestAnimationFrame(() => setExpanded(true))
    } else {
      setExpanded((prev) => !prev)
    }
  }, [expanded, visible])

  return (
    <Box>
      {!visible && (
        <IconButton size="small" onClick={handleToggle} sx={{ opacity: 0.5 }}>
          <InfoOutlinedIcon fontSize="small" />
        </IconButton>
      )}
      <Collapse in={expanded}>
        {visible && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              px: 1.5,
              py: 1,
              borderRadius: 1,
              bgcolor: 'action.hover',
            }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 18, mt: 0.25, color: 'text.secondary', flexShrink: 0 }} />
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {text}
            </Typography>
            <IconButton size="small" onClick={handleDismiss} sx={{ mt: -0.5, mr: -0.5 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Collapse>
    </Box>
  )
}
