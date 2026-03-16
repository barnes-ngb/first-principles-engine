import { useCallback, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import type { SightWordProgress } from '../../core/types/domain'

const MASTERY_COLORS: Record<SightWordProgress['masteryLevel'], { bg: string; fontWeight: number }> = {
  new: { bg: 'rgba(33, 150, 243, 0.25)', fontWeight: 700 },
  practicing: { bg: 'rgba(255, 193, 7, 0.3)', fontWeight: 700 },
  familiar: { bg: 'rgba(76, 175, 80, 0.2)', fontWeight: 700 },
  mastered: { bg: 'rgba(76, 175, 80, 0.08)', fontWeight: 400 },
}

interface SightWordChipProps {
  word: string
  masteryLevel: SightWordProgress['masteryLevel']
  onTapHelp: () => void
  onTapKnown: () => void
}

export default function SightWordChip({ word, masteryLevel, onTapHelp, onTapKnown }: SightWordChipProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const style = MASTERY_COLORS[masteryLevel]

  const handleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    setAnchorEl(e.currentTarget)
    // Auto-dismiss after 3 seconds
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setAnchorEl(null), 3000)
  }, [])

  const handleClose = useCallback(() => {
    clearTimeout(timerRef.current)
    setAnchorEl(null)
  }, [])

  const handleHelp = useCallback(() => {
    // Use Web Speech API
    const utterance = new SpeechSynthesisUtterance(word)
    utterance.rate = 0.8
    speechSynthesis.speak(utterance)
    onTapHelp()
    handleClose()
  }, [word, onTapHelp, handleClose])

  const handleKnown = useCallback(() => {
    onTapKnown()
    handleClose()
  }, [onTapKnown, handleClose])

  return (
    <>
      <Box
        component="span"
        onClick={handleClick}
        sx={{
          px: 0.3,
          py: 0.1,
          borderRadius: 0.5,
          bgcolor: style.bg,
          fontWeight: style.fontWeight,
          cursor: 'pointer',
          transition: 'background-color 0.2s',
          '&:hover': { filter: 'brightness(0.9)' },
        }}
      >
        {word}
      </Box>
      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { borderRadius: 2, p: 1 } } }}
      >
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            onClick={handleHelp}
            sx={{ minHeight: 40, fontSize: '0.85rem' }}
          >
            Hear it
          </Button>
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={handleKnown}
            sx={{ minHeight: 40, fontSize: '0.85rem' }}
          >
            I know this!
          </Button>
        </Stack>
      </Popover>
    </>
  )
}
