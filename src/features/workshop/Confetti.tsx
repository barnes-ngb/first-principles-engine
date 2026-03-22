import { useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'

const COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6bff', '#ff9f43', '#54a0ff']
const PIECE_COUNT = 50

interface ConfettiPiece {
  id: number
  color: string
  left: number   // percentage
  delay: number  // seconds
  size: number   // px
  rotation: number
  drift: number  // horizontal drift
  duration: number
}

function generatePieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: COLORS[i % COLORS.length],
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    size: 6 + Math.random() * 6,
    rotation: Math.random() * 360,
    drift: (Math.random() - 0.5) * 80,
    duration: 1.5 + Math.random() * 1.5,
  }))
}

interface ConfettiProps {
  /** Whether confetti is currently active */
  active: boolean
  /** Smaller, warmer burst for secondary celebrations */
  small?: boolean
}

export default function Confetti({ active, small }: ConfettiProps) {
  // Track the last activation to regenerate pieces on each new burst
  const activationCountRef = useRef(0)
  const [visible, setVisible] = useState(false)
  const prevActiveRef = useRef(false)

  // Detect rising edge of active prop
  if (active && !prevActiveRef.current) {
    activationCountRef.current++
    setVisible(true)
    setTimeout(() => setVisible(false), 3500)
  }
  prevActiveRef.current = active

  // Generate pieces based on activation count (changes each burst)
  const pieces = useMemo(
    () => generatePieces(small ? 25 : PIECE_COUNT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [small, activationCountRef.current],
  )

  if (!visible) return null

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        overflow: 'hidden',
        '@media (prefers-reduced-motion: reduce)': {
          display: 'none',
        },
      }}
    >
      {pieces.map((piece) => (
        <Box
          key={piece.id}
          sx={{
            position: 'absolute',
            top: -20,
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size * 0.6,
            bgcolor: piece.color,
            borderRadius: '2px',
            transform: `rotate(${piece.rotation}deg)`,
            animation: `confettiFall ${piece.duration}s ease-in ${piece.delay}s forwards`,
            '@keyframes confettiFall': {
              '0%': {
                transform: `translateY(0) translateX(0) rotate(${piece.rotation}deg)`,
                opacity: 1,
              },
              '100%': {
                transform: `translateY(100vh) translateX(${piece.drift}px) rotate(${piece.rotation + 720}deg)`,
                opacity: 0,
              },
            },
          }}
        />
      ))}
    </Box>
  )
}
