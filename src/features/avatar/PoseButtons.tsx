import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { POSES } from './voxel/poseSystem'

interface PoseButtonsProps {
  onPose: (poseId: string) => void
  currentPose: string | null
}

export default function PoseButtons({ onPose, currentPose }: PoseButtonsProps) {
  const visiblePoses = POSES.filter((p) => p.id !== 'idle')

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        gap: '6px',
        py: 1,
        px: 1,
      }}
    >
      {visiblePoses.map((pose) => {
        const isActive = currentPose === pose.id
        return (
          <Box
            key={pose.id}
            component="button"
            onClick={() => onPose(pose.id)}
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: isActive
                ? '2px solid #4caf50'
                : '1.5px solid rgba(255,255,255,0.1)',
              background: isActive
                ? 'rgba(76,175,80,0.18)'
                : 'rgba(255,255,255,0.04)',
              color: isActive ? '#4caf50' : 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none',
              p: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1px',
              position: 'relative',
              '&:hover': {
                background: isActive
                  ? 'rgba(76,175,80,0.25)'
                  : 'rgba(255,255,255,0.08)',
                borderColor: isActive ? '#4caf50' : 'rgba(255,255,255,0.2)',
              },
              '&:active': {
                transform: 'scale(0.9)',
              },
            }}
            title={pose.name}
          >
            <Box sx={{ fontSize: '18px', lineHeight: 1 }}>{pose.icon}</Box>
            <Typography
              sx={{
                fontSize: '6px',
                fontFamily: 'monospace',
                letterSpacing: '-0.3px',
                opacity: 0.7,
                lineHeight: 1,
                mt: '2px',
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
