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
        gap: '6px',
        py: 1,
        px: 1.5,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        justifyContent: visiblePoses.length <= 5 ? 'center' : 'flex-start',
      }}
    >
      {visiblePoses.map((pose) => {
        const isActive = currentPose === pose.id
        const isDimmed = poseAnimating && !isActive
        return (
          <Box
            key={pose.id}
            component="button"
            onClick={() => !isDimmed && onPose(pose.id)}
            sx={{
              minWidth: 48,
              height: 48,
              borderRadius: isLincoln ? '8px' : '14px',
              border: isActive
                ? '2px solid #FFD700'
                : `1px solid ${isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
              background: isActive
                ? (isLincoln ? 'rgba(255,215,0,0.15)' : 'rgba(255,215,0,0.12)')
                : 'transparent',
              color: isActive
                ? '#FFD700'
                : (isLincoln ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.4)'),
              cursor: isDimmed ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none',
              px: 1,
              py: 0.5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1px',
              flexShrink: 0,
              opacity: isDimmed ? 0.35 : 1,
              boxShadow: isActive
                ? '0 0 10px rgba(255,215,0,0.3)'
                : 'none',
              '&:hover': isDimmed ? {} : {
                background: isActive
                  ? (isLincoln ? 'rgba(255,215,0,0.2)' : 'rgba(255,215,0,0.18)')
                  : (isLincoln ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'),
                borderColor: isActive ? '#FFD700' : (isLincoln ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'),
              },
              '&:active': isDimmed ? {} : {
                transform: 'scale(0.93)',
              },
            }}
            title={pose.name}
          >
            <Box sx={{ fontSize: '20px', lineHeight: 1 }}>{pose.icon}</Box>
            <Typography
              sx={{
                fontSize: isLincoln ? '8px' : '10px',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                letterSpacing: isLincoln ? '-0.3px' : '0',
                opacity: isActive ? 1 : 0.65,
                lineHeight: 1,
                mt: '2px',
                fontWeight: isActive ? 700 : 400,
                color: 'inherit',
                whiteSpace: 'nowrap',
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
