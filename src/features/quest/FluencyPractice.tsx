import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useAudioRecorder } from '../../core/hooks/useAudioRecorder'
import { useTTS } from '../../core/hooks/useTTS'
import type { FluencySelfRating } from './questTypes'
import { QuestScreen } from './questTypes'
import type { useQuestSession } from './useQuestSession'

const MC = {
  bg: 'rgba(0,0,0,0.92)',
  gold: '#FCDB5B',
  green: '#7EFC20',
  diamond: '#5BFCEE',
  stone: '#8B8B8B',
  white: '#FFFFFF',
  darkStone: '#3C3C3C',
  red: '#FF6B6B',
  font: '"Press Start 2P", monospace',
} as const

interface FluencyPracticeProps {
  quest: ReturnType<typeof useQuestSession>
}

export default function FluencyPractice({ quest }: FluencyPracticeProps) {
  const {
    screen,
    currentPassageText,
    currentPassageTargetWords,
    currentPassageSpeechWords,
    fluencyPassages,
    fluencyDiamonds,
    recordFluencyAttempt,
    requestNewFluencyPassage,
    endFluencySession,
  } = quest

  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [recordingStartTime, setRecordingStartTime] = useState(0)
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null)

  const recorder = useAudioRecorder()
  const tts = useTTS({
    rate: 0.75,
    onWordBoundary: (charIndex) => {
      // Find which word index this character falls in
      const words = currentPassageText.split(/\s+/)
      let pos = 0
      for (let i = 0; i < words.length; i++) {
        if (charIndex <= pos + words[i].length) {
          setHighlightIndex(i)
          break
        }
        pos += words[i].length + 1
      }
    },
  })

  const handleListenFirst = useCallback(() => {
    setHighlightIndex(0)
    tts.speak(currentPassageText)
  }, [tts, currentPassageText])

  const handleStartRecording = useCallback(async () => {
    setRecordingStartTime(Date.now())
    await recorder.startRecording()
  }, [recorder])

  const handleStopRecording = useCallback(async () => {
    const blob = await recorder.stopRecording()
    if (blob) {
      const url = URL.createObjectURL(blob)
      setLastRecordingUrl(url)
    }
  }, [recorder])

  const [showPostRating, setShowPostRating] = useState(false)

  const handleSelfRate = useCallback(
    (rating: FluencySelfRating) => {
      const duration = recordingStartTime ? Math.round((Date.now() - recordingStartTime) / 1000) : 0
      recordFluencyAttempt(rating, lastRecordingUrl, duration)
      setShowPostRating(true)
    },
    [recordFluencyAttempt, recordingStartTime, lastRecordingUrl],
  )

  const words = currentPassageText.split(/\s+/)
  const targetSet = new Set((currentPassageTargetWords || []).map((w) => w.toLowerCase()))
  const speechSet = new Set((currentPassageSpeechWords || []).map((w) => w.toLowerCase()))

  // ── Passage display (Listen First + Your Turn) ──────────────

  if (screen === QuestScreen.FluencyPassage) {
    return (
      <Box sx={{ bgcolor: MC.bg, borderRadius: 2, p: 3 }}>
        <Typography sx={{ fontFamily: MC.font, fontSize: '0.6rem', color: MC.gold, mb: 2, textAlign: 'center' }}>
          📖 Fluency Practice
        </Typography>

        {/* Passage text */}
        <Box sx={{ bgcolor: MC.darkStone, borderRadius: 2, p: 2.5, mb: 3, lineHeight: 2.2 }}>
          {words.map((word, i) => {
            const cleanWord = word.replace(/[.,!?"']/g, '').toLowerCase()
            const isTarget = targetSet.has(cleanWord)
            const isSpeech = speechSet.has(cleanWord)
            const isHighlighted = i === highlightIndex

            return (
              <Typography
                key={i}
                component="span"
                onClick={() => {
                  tts.speak(word.replace(/[.,!?"']/g, ''))
                }}
                sx={{
                  fontFamily: 'Georgia, serif',
                  fontSize: '1.1rem',
                  lineHeight: 2.2,
                  color: isHighlighted ? MC.gold : isTarget ? MC.diamond : isSpeech ? MC.green : MC.white,
                  fontWeight: isTarget || isSpeech ? 700 : 400,
                  bgcolor: isHighlighted ? 'rgba(252,219,91,0.2)' : 'transparent',
                  borderRadius: 1,
                  px: 0.3,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                {word}{' '}
              </Typography>
            )
          })}
        </Box>

        {/* Actions */}
        <Stack spacing={1.5}>
          <Button
            variant="outlined"
            onClick={handleListenFirst}
            disabled={tts.isSpeaking}
            sx={{
              fontFamily: MC.font,
              fontSize: '0.4rem',
              color: MC.diamond,
              borderColor: MC.diamond,
              '&:hover': { borderColor: MC.white, color: MC.white },
            }}
          >
            {tts.isSpeaking ? 'Listening...' : 'Want to hear it first? 🔊'}
          </Button>

          {!recorder.isRecording ? (
            <Button
              variant="contained"
              onClick={handleStartRecording}
              sx={{
                fontFamily: MC.font,
                fontSize: '0.45rem',
                bgcolor: MC.green,
                color: MC.bg,
                py: 1.5,
                '&:hover': { bgcolor: '#6EEC10' },
              }}
            >
              Your Turn — Start Reading 🎤
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleStopRecording}
              sx={{
                fontFamily: MC.font,
                fontSize: '0.45rem',
                bgcolor: MC.red,
                color: MC.white,
                py: 1.5,
                animation: 'pulse 1.5s infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.7 },
                },
              }}
            >
              🔴 Recording... Tap when done
            </Button>
          )}

          {lastRecordingUrl && !recorder.isRecording && !showPostRating && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontFamily: MC.font, fontSize: '0.35rem', color: MC.stone, mb: 1 }}>
                How did that feel?
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center">
                <RatingButton label="Easy — I crushed it!" icon="⛏️" onClick={() => handleSelfRate('easy')} />
                <RatingButton label="Medium — I got through it" icon="⚒️" onClick={() => handleSelfRate('medium')} />
                <RatingButton label="Hard — that was tough" icon="🪨" onClick={() => handleSelfRate('hard')} />
              </Stack>
              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1.5 }}>
                <Button
                  size="small"
                  onClick={() => recorder.playRecording(lastRecordingUrl)}
                  sx={{ fontFamily: MC.font, fontSize: '0.3rem', color: MC.stone }}
                >
                  Listen to yourself 🔊
                </Button>
                <Button
                  size="small"
                  onClick={handleListenFirst}
                  sx={{ fontFamily: MC.font, fontSize: '0.3rem', color: MC.stone }}
                >
                  Hear the model again 🔊
                </Button>
              </Stack>
            </Box>
          )}

          {showPostRating && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontFamily: MC.font, fontSize: '0.4rem', color: MC.gold, mb: 1.5 }}>
                Nice work! 💎
              </Typography>
              <Stack spacing={1}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setLastRecordingUrl(null)
                    recorder.clearRecording()
                    setShowPostRating(false)
                    // Same passage, new recording attempt
                  }}
                  sx={{ fontFamily: MC.font, fontSize: '0.38rem', color: MC.white, borderColor: MC.stone }}
                >
                  Read it again ↻
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setLastRecordingUrl(null)
                    recorder.clearRecording()
                    setShowPostRating(false)
                    setHighlightIndex(-1)
                    void requestNewFluencyPassage()
                  }}
                  sx={{ fontFamily: MC.font, fontSize: '0.38rem', color: MC.diamond, borderColor: MC.diamond }}
                >
                  New passage →
                </Button>
                <Button
                  variant="contained"
                  onClick={() => void endFluencySession()}
                  sx={{
                    fontFamily: MC.font,
                    fontSize: '0.38rem',
                    bgcolor: MC.gold,
                    color: MC.bg,
                    '&:hover': { bgcolor: '#ECCC4B' },
                  }}
                >
                  Done for today ✓
                </Button>
              </Stack>
            </Box>
          )}
        </Stack>

        {/* Diamond counter */}
        <Typography sx={{ fontFamily: MC.font, fontSize: '0.35rem', color: MC.diamond, mt: 2, textAlign: 'center' }}>
          {'💎'.repeat(fluencyDiamonds)} {fluencyDiamonds}/5 diamonds
        </Typography>
      </Box>
    )
  }

  // ── Self-Check (after rating) → options ─────────────────────

  if (screen === QuestScreen.FluencySelfCheck) {
    return (
      <Box sx={{ bgcolor: MC.bg, borderRadius: 2, p: 3, textAlign: 'center' }}>
        <Typography sx={{ fontFamily: MC.font, fontSize: '0.5rem', color: MC.gold, mb: 2 }}>
          Nice work! 💎
        </Typography>
        <Stack spacing={1.5}>
          <Button
            variant="outlined"
            onClick={() => {
              setLastRecordingUrl(null)
              recorder.clearRecording()
              // Same passage, new recording
            }}
            sx={{ fontFamily: MC.font, fontSize: '0.4rem', color: MC.white, borderColor: MC.stone }}
          >
            Read it again ↻
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setLastRecordingUrl(null)
              recorder.clearRecording()
              setHighlightIndex(-1)
              void requestNewFluencyPassage()
            }}
            sx={{ fontFamily: MC.font, fontSize: '0.4rem', color: MC.diamond, borderColor: MC.diamond }}
          >
            New passage →
          </Button>
          <Button
            variant="contained"
            onClick={() => void endFluencySession()}
            sx={{
              fontFamily: MC.font,
              fontSize: '0.4rem',
              bgcolor: MC.gold,
              color: MC.bg,
              '&:hover': { bgcolor: '#ECCC4B' },
            }}
          >
            Done for today ✓
          </Button>
        </Stack>
      </Box>
    )
  }

  // ── Fluency Summary ─────────────────────────────────────────

  if (screen === QuestScreen.FluencySummary) {
    const ratings = fluencyPassages.flatMap((p) => p.attempts.map((a) => a.selfRating))
    const easy = ratings.filter((r) => r === 'easy').length
    const medium = ratings.filter((r) => r === 'medium').length
    const hard = ratings.filter((r) => r === 'hard').length

    return (
      <Box sx={{ bgcolor: MC.bg, borderRadius: 2, p: 3, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '2rem', mb: 1 }}>📖</Typography>
        <Typography sx={{ fontFamily: MC.font, fontSize: '0.6rem', color: MC.gold, mb: 2 }}>
          Great Reading!
        </Typography>

        <Typography sx={{ fontFamily: MC.font, fontSize: '0.4rem', color: MC.white, mb: 1 }}>
          You read {fluencyPassages.length} passage{fluencyPassages.length !== 1 ? 's' : ''} today!
        </Typography>

        <Typography sx={{ fontFamily: MC.font, fontSize: '0.5rem', color: MC.diamond, mb: 1.5 }}>
          {'💎'.repeat(fluencyDiamonds)} {fluencyDiamonds} diamonds earned
        </Typography>

        {(easy > 0 || medium > 0 || hard > 0) && (
          <Typography sx={{ fontFamily: MC.font, fontSize: '0.35rem', color: MC.stone, mb: 2 }}>
            {easy > 0 ? `${easy} easy` : ''}{easy > 0 && (medium > 0 || hard > 0) ? ', ' : ''}
            {medium > 0 ? `${medium} medium` : ''}{medium > 0 && hard > 0 ? ', ' : ''}
            {hard > 0 ? `${hard} hard` : ''}
          </Typography>
        )}

        <Button
          variant="contained"
          onClick={quest.resetToIntro}
          sx={{
            fontFamily: MC.font,
            fontSize: '0.45rem',
            bgcolor: MC.gold,
            color: MC.bg,
            mt: 2,
            '&:hover': { bgcolor: '#ECCC4B' },
          }}
        >
          Done
        </Button>
      </Box>
    )
  }

  return null
}

// ── Rating button sub-component ──────────────────────────────

function RatingButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <Button
      variant="outlined"
      onClick={onClick}
      sx={{
        fontFamily: MC.font,
        fontSize: '0.28rem',
        color: MC.white,
        borderColor: MC.stone,
        p: 1,
        minWidth: 80,
        flexDirection: 'column',
        lineHeight: 1.6,
        '&:hover': { borderColor: MC.gold },
      }}
    >
      <Typography sx={{ fontSize: '1.2rem', mb: 0.5 }}>{icon}</Typography>
      {label}
    </Button>
  )
}
