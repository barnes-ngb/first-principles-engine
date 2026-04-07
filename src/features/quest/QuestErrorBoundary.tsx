import { useEffect } from 'react'
import { useNavigate, useRouteError } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

const MC = {
  bg: 'rgba(0,0,0,0.92)',
  gold: '#FCDB5B',
  stone: '#8B8B8B',
  white: '#FFFFFF',
  font: '"Press Start 2P", monospace',
} as const

export default function QuestErrorBoundary() {
  const error = useRouteError()
  const navigate = useNavigate()

  useEffect(() => {
    console.error('[QuestErrorBoundary] Route error in /quest:', error)
  }, [error])

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: MC.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        p: 3,
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontSize: '3rem' }}>⛏️</Typography>
      <Typography
        sx={{
          fontFamily: MC.font,
          color: MC.gold,
          fontSize: '1.1rem',
        }}
      >
        The mine collapsed!
      </Typography>
      <Typography
        sx={{
          fontFamily: MC.font,
          color: MC.stone,
          fontSize: '0.7rem',
          maxWidth: 300,
          lineHeight: 1.8,
        }}
      >
        Something broke down here. Let&apos;s try again.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          onClick={() => navigate('/quest', { replace: true })}
          sx={{
            fontFamily: MC.font,
            fontSize: '0.6rem',
            bgcolor: '#4A7A3A',
            '&:hover': { bgcolor: '#5A8A4A' },
          }}
        >
          Back to mine
        </Button>
        <Button
          variant="outlined"
          onClick={() => navigate('/today', { replace: true })}
          sx={{
            fontFamily: MC.font,
            fontSize: '0.6rem',
            color: MC.white,
            borderColor: MC.stone,
            '&:hover': { borderColor: MC.white },
          }}
        >
          Back to Today
        </Button>
      </Box>
    </Box>
  )
}
