import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

interface DiceRollerProps {
  onRoll: (value: number) => void
  disabled?: boolean
  /** Called when the roll animation starts (for sound sync) */
  onRollStart?: () => void
  /** Called when the roll animation lands on a result (for sound sync) */
  onRollLand?: () => void
}

export default function DiceRoller({ onRoll, disabled, onRollStart, onRollLand }: DiceRollerProps) {
  const [rolling, setRolling] = useState(false)
  const [value, setValue] = useState<number | null>(null)
  const [landed, setLanded] = useState(false)

  const handleRoll = useCallback(() => {
    setRolling(true)
    setLanded(false)
    setValue(null)
    onRollStart?.()

    // Animate: show random numbers briefly, then settle
    let count = 0
    const interval = setInterval(() => {
      setValue(Math.floor(Math.random() * 6) + 1)
      count++
      if (count >= 10) {
        clearInterval(interval)
        const finalValue = Math.floor(Math.random() * 6) + 1
        setValue(finalValue)
        setRolling(false)
        setLanded(true)
        onRollLand?.()
        onRoll(finalValue)
        // Clear landed state after bounce animation
        setTimeout(() => setLanded(false), 500)
      }
    }, 70)
  }, [onRoll, onRollStart, onRollLand])

  const DICE_FACES = ['\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685']

  return (
    <Box sx={{ textAlign: 'center' }}>
      {value !== null && (
        <Typography
          sx={{
            fontSize: '4.5rem',
            lineHeight: 1,
            mb: 1,
            display: 'inline-block',
            ...(rolling
              ? {
                  animation: 'diceTumble 0.15s ease-in-out infinite',
                  '@keyframes diceTumble': {
                    '0%': { transform: 'rotate(0deg) scale(1)' },
                    '25%': { transform: 'rotate(-12deg) scale(0.95)' },
                    '50%': { transform: 'rotate(8deg) scale(1.05)' },
                    '75%': { transform: 'rotate(-5deg) scale(0.98)' },
                    '100%': { transform: 'rotate(0deg) scale(1)' },
                  },
                }
              : landed
                ? {
                    animation: 'diceLand 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                    '@keyframes diceLand': {
                      '0%': { transform: 'scale(0.8) rotate(10deg)' },
                      '40%': { transform: 'scale(1.3) rotate(-3deg)' },
                      '60%': { transform: 'scale(0.95) rotate(1deg)' },
                      '80%': { transform: 'scale(1.05) rotate(0deg)' },
                      '100%': { transform: 'scale(1) rotate(0deg)' },
                    },
                  }
                : {}),
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none !important',
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
