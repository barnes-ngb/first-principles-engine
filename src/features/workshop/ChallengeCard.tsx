import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import type { ChallengeCard as ChallengeCardType } from '../../core/types'
import { useTTS } from '../../core/hooks/useTTS'

const TYPE_EMOJI: Record<string, string> = {
  reading: '\uD83D\uDCDA',
  math: '\uD83E\uDDEE',
  story: '\uD83D\uDCAC',
  action: '\uD83C\uDFC3',
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '',
  medium: '',
  stretch: "Boss Challenge! ",
}

interface ChallengeCardProps {
  card: ChallengeCardType | null
  open: boolean
  onClose: () => void
  /** DALL-E generated card art keyed by card type */
  cardArt?: { reading?: string; math?: string; story?: string; action?: string }
}

export default function ChallengeCard({ card, open, onClose, cardArt }: ChallengeCardProps) {
  const tts = useTTS()

  // Read the card aloud when it opens
  useEffect(() => {
    if (open && card) {
      const prefix = DIFFICULTY_LABEL[card.difficulty] || ''
      tts.speak(prefix + card.readAloudText)
    }
    return () => {
      tts.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card?.id])

  if (!card) return null

  const emoji = TYPE_EMOJI[card.type] || '?'
  const isStretch = card.difficulty === 'stretch'
  const artUrl = cardArt?.[card.type as keyof typeof cardArt]

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogContent
        sx={{
          p: 3,
          textAlign: 'center',
          bgcolor: isStretch ? '#fff8e1' : 'background.paper',
          border: isStretch ? '3px solid #ff9800' : undefined,
        }}
      >
        {/* Generated card art header */}
        {artUrl ? (
          <Box
            component="img"
            src={artUrl}
            alt={`${card.type} challenge`}
            sx={{
              width: '100%',
              maxHeight: 200,
              objectFit: 'contain',
              borderRadius: 2,
              mb: 1.5,
            }}
          />
        ) : (
          <Typography sx={{ fontSize: '3rem', mb: 1 }}>{emoji}</Typography>
        )}

        {isStretch && (
          <Typography
            variant="caption"
            sx={{ color: '#e65100', fontWeight: 700, display: 'block', mb: 1 }}
          >
            BOSS CHALLENGE!
          </Typography>
        )}

        <Typography variant="h6" gutterBottom>
          {card.content}
        </Typography>

        {card.options && card.options.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, my: 2 }}>
            {card.options.map((option, i) => (
              <Button key={i} variant="outlined" fullWidth>
                {option}
              </Button>
            ))}
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1, mt: 3, justifyContent: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              const prefix = DIFFICULTY_LABEL[card.difficulty] || ''
              tts.speak(prefix + card.readAloudText)
            }}
          >
            Read Again
          </Button>
          <Button variant="contained" onClick={onClose}>
            Done!
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
