import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { Child } from '../../core/types'

interface KidCelebrationProps {
  allDone: boolean
  mustDoDone: boolean
  isMvd: boolean
  celebrationMessage: string
  isLincoln: boolean
  child: Child
}

export default function KidCelebration({
  allDone,
  mustDoDone,
  isMvd,
  celebrationMessage,
  isLincoln,
  child,
}: KidCelebrationProps) {
  return (
    <>
      {/* ── CELEBRATION ── */}
      {allDone && (
        <Box
          sx={{
            textAlign: 'center',
            py: isLincoln ? 3 : 4,
            px: 2,
            bgcolor: isLincoln ? 'rgba(0,0,0,0.85)' : 'success.50',
            borderRadius: isLincoln ? 0 : 3,
            border: isLincoln ? '3px solid #FCDB5B' : '2px solid',
            borderColor: isLincoln ? '#FCDB5B' : 'success.200',
            my: 2,
          }}
        >
          {isLincoln && (
            <Typography
              sx={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '0.6rem',
                color: '#FCDB5B',
                mb: 1,
                letterSpacing: 1,
              }}
            >
              Achievement Get!
            </Typography>
          )}
          <Typography
            variant="h4"
            sx={{
              mb: 1,
              ...(isLincoln
                ? {
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '0.7rem',
                    color: '#FFFFFF',
                    lineHeight: 1.6,
                  }
                : {}),
            }}
          >
            {celebrationMessage}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: isLincoln ? 'rgba(255,255,255,0.6)' : 'text.secondary',
              ...(isLincoln
                ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.45rem' }
                : {}),
            }}
          >
            {isLincoln
              ? 'Respawn tomorrow for more XP!'
              : `${child.name}'s journey continues tomorrow!`}
          </Typography>
        </Box>
      )}

      {/* MVD completion */}
      {isMvd && mustDoDone && (
        <Box
          sx={{
            textAlign: 'center',
            py: 3,
            px: 2,
            bgcolor: isLincoln ? 'rgba(0,0,0,0.85)' : 'success.50',
            borderRadius: isLincoln ? 0 : 3,
            border: isLincoln ? '3px solid #5A8C32' : '2px solid',
            borderColor: isLincoln ? '#5A8C32' : 'success.200',
            my: 2,
          }}
        >
          <Typography
            variant="h5"
            sx={{
              mb: 1,
              ...(isLincoln
                ? {
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '0.65rem',
                    color: '#7EFC20',
                  }
                : {}),
            }}
          >
            {isLincoln ? 'Base camp secured! Rest well.' : 'Done! Rest well today. 🌟'}
          </Typography>
        </Box>
      )}
    </>
  )
}
