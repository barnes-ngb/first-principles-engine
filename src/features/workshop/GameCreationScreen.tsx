import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

const LOADING_MESSAGES = [
  'Painting your world...',
  'Drawing the challenges...',
  'Building the board...',
  'Almost ready, Story Keeper!',
  'Mixing the colors...',
  'Adding the sparkles...',
  'Placing the game pieces...',
]

/** How often to rotate the loading message (ms) */
const ROTATE_INTERVAL = 2500

export default function GameCreationScreen() {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
    }, ROTATE_INTERVAL)
    return () => clearInterval(timer)
  }, [])

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        px: 3,
        minHeight: 400,
        textAlign: 'center',
      }}
    >
      <CircularProgress
        size={64}
        thickness={4}
        sx={{ mb: 4, color: 'primary.main' }}
      />

      <Typography
        variant="h5"
        sx={{ fontWeight: 700, mb: 2 }}
      >
        Creating your game...
      </Typography>

      <Typography
        variant="h6"
        color="text.secondary"
        sx={{
          fontStyle: 'italic',
          transition: 'opacity 0.3s ease-in-out',
          minHeight: '2em',
        }}
        key={messageIndex}
      >
        {LOADING_MESSAGES[messageIndex]}
      </Typography>
    </Box>
  )
}
