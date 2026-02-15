import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import CloseIcon from '@mui/icons-material/Close'

const DISMISSED_KEY = 'fpe_help_dismissed'

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

interface HelpStripProps {
  /** Unique key for this page's help strip (used for persistent dismiss) */
  pageKey: string
  /** The help text to display */
  text: string
}

export default function HelpStrip({ pageKey, text }: HelpStripProps) {
  const [visible, setVisible] = useState(() => !getDismissed().has(pageKey))
  const [expanded, setExpanded] = useState(visible)

  const handleDismiss = useCallback(() => {
    setExpanded(false)
    const dismissed = getDismissed()
    dismissed.add(pageKey)
    setDismissed(dismissed)
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
