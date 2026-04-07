import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface StonebridgeWeekData {
  weekNumber?: number
  chapterTitle?: string
  chapterIntro?: string
  conundrumTitle?: string
}

interface StonebridgePreviewCardProps {
  weekData: StonebridgeWeekData | null
  isLincoln: boolean
}

export default function StonebridgePreviewCard({ weekData, isLincoln }: StonebridgePreviewCardProps) {
  return (
    <Box
      sx={{
        mx: 1,
        mt: 1,
        p: 2,
        borderRadius: isLincoln ? '8px' : '16px',
        border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.22)' : 'rgba(232,160,191,0.28)'}`,
        background: isLincoln ? 'rgba(18,30,24,0.82)' : 'rgba(255,249,253,0.95)',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive', fontSize: isLincoln ? '12px' : '16px', fontWeight: 700 }}>
          🏰 Stonebridge
        </Typography>
        {typeof weekData?.weekNumber === 'number' && (
          <Typography sx={{ fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive', fontSize: isLincoln ? '10px' : '13px', opacity: 0.8 }}>
            Week {weekData.weekNumber}
          </Typography>
        )}
      </Box>

      {weekData?.chapterTitle && (
        <Box sx={{ mb: 1 }}>
          <Typography sx={{ fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive', fontSize: isLincoln ? '10px' : '15px', fontWeight: 700, mb: 0.5 }}>
            {weekData.chapterTitle}
          </Typography>
          {weekData.chapterIntro && (
            <Typography sx={{ fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive', fontSize: isLincoln ? '10px' : '14px', lineHeight: 1.45, opacity: 0.85 }}>
              {weekData.chapterIntro}
            </Typography>
          )}
        </Box>
      )}

      {weekData?.conundrumTitle && (
        <Typography sx={{ fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive', fontSize: isLincoln ? '10px' : '14px', mb: 1 }}>
          🤔 This week&apos;s conundrum: {weekData.conundrumTitle}
        </Typography>
      )}

      <Typography sx={{ fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive', fontSize: isLincoln ? '10px' : '13px', opacity: 0.75 }}>
        Banner Rally missions coming soon — your reading will help repair Stonebridge.
      </Typography>
    </Box>
  )
}
