import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

interface DiceRollerProps {
  onRoll: (value: number) => void
  disabled?: boolean
}

export default function DiceRoller({ onRoll, disabled }: DiceRollerProps) {
  const [rolling, setRolling] = useState(false)
  const [value, setValue] = useState<number | null>(null)

  const handleRoll = useCallback(() => {
    setRolling(true)
    setValue(null)

    // Animate: show random numbers briefly, then settle
    let count = 0
    const interval = setInterval(() => {
      setValue(Math.floor(Math.random() * 6) + 1)
      count++
      if (count >= 8) {
        clearInterval(interval)
        const finalValue = Math.floor(Math.random() * 6) + 1
        setValue(finalValue)
        setRolling(false)
        onRoll(finalValue)
      }
    }, 80)
  }, [onRoll])

  const DICE_FACES = ['\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685']

  return (
    <Box sx={{ textAlign: 'center' }}>
      {value !== null && (
        <Typography
          sx={{
            fontSize: '4rem',
            lineHeight: 1,
            mb: 1,
            animation: rolling ? 'shake 0.1s ease-in-out infinite' : 'none',
            '@keyframes shake': {
              '0%, 100%': { transform: 'rotate(0deg)' },
              '25%': { transform: 'rotate(-5deg)' },
              '75%': { transform: 'rotate(5deg)' },
            },
          }}
        >
          {DICE_FACES[value - 1]}
        </Typography>
      )}
      <Button
        variant="contained"
        size="large"
        onClick={handleRoll}
        disabled={disabled || rolling}
        sx={{
          py: 1.5,
          px: 4,
          fontSize: '1.1rem',
          fontWeight: 700,
          borderRadius: 3,
        }}
      >
        {rolling ? 'Rolling...' : 'Roll!'}
      </Button>
    </Box>
  )
}
