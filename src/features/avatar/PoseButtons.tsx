import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { POSES } from './voxel/poseSystem'

interface PoseButtonsProps {
  onPose: (poseId: string) => void
  currentPose: string | null
  isLincoln?: boolean
  /** When true, a pose is actively animating (dims inactive buttons) */
  poseAnimating?: boolean
}

export default function PoseButtons({ onPose, currentPose, isLincoln = true, poseAnimating = false }: PoseButtonsProps) {
  const visiblePoses = POSES.filter((p) => p.id !== 'idle')

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        gap: '6px',
        py: 1.5,
        px: 1,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollSnapType: 'x mandatory',
        '&::-webkit-scrollbar': { display: 'none' },
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
      }}
    >
      {visiblePoses.map((pose) => {
        const isActive = currentPose === pose.id
        // Dim non-active buttons while a pose is animating
        const isDimmed = poseAnimating && !isActive
        return (
          <Box
            key={pose.id}
            component="button"
            onClick={() => !isDimmed && onPose(pose.id)}
            sx={{
              minWidth: 52,
              width: 52,
              height: 52,
              flexShrink: 0,
              scrollSnapAlign: 'start',
              borderRadius: isLincoln ? '8px' : '50%',
              border: isActive
                ? '2px solid #FFD700'
                : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              background: isActive
                ? (isLincoln ? 'rgba(255,215,0,0.12)' : 'rgba(255,215,0,0.1)')
                : (isLincoln ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
              color: isActive
                ? '#FFD700'
                : (isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)'),
              cursor: isDimmed ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none',
              p: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              position: 'relative',
              opacity: isDimmed ? 0.4 : 1,
              boxShadow: isActive
                ? '0 0 12px rgba(255,215,0,0.35)'
                : 'none',
              '&:hover': isDimmed ? {} : {
                background: isActive
                  ? (isLincoln ? 'rgba(255,215,0,0.2)' : 'rgba(255,215,0,0.18)')
                  : (isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'),
                borderColor: isActive ? '#FFD700' : (isLincoln ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)'),
                transform: 'translateY(-1px)',
              },
              '&:active': isDimmed ? {} : {
                transform: 'scale(0.95)',
              },
            }}
            title={pose.name}
          >
            <Box sx={{ fontSize: '22px', lineHeight: 1 }}>{pose.icon}</Box>
            <Typography
              sx={{
                fontSize: isLincoln ? '7px' : '10px',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                letterSpacing: isLincoln ? '-0.3px' : '0',
                opacity: isActive ? 1 : 0.7,
                lineHeight: 1.1,
                mt: '2px',
                fontWeight: isActive ? 700 : 400,
                color: 'inherit',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '48px',
                textAlign: 'center',
              }}
            >
              {pose.name}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}
