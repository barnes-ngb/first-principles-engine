import Box from '@mui/material/Box'
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
        gap: '8px',
        py: 1,
        flexWrap: 'wrap',
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
              px: '14px',
              py: '6px',
              borderRadius: '20px',
              border: isActive
                ? '1.5px solid #4caf50'
                : '1px solid rgba(255,255,255,0.15)',
              background: isActive
                ? 'rgba(76,175,80,0.15)'
                : 'rgba(255,255,255,0.05)',
              color: isActive ? '#4caf50' : 'rgba(255,255,255,0.7)',
              fontFamily: 'monospace',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              outline: 'none',
              '&:hover': {
                background: isActive
                  ? 'rgba(76,175,80,0.25)'
                  : 'rgba(255,255,255,0.1)',
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
            }}
          >
            {pose.icon} {pose.name}
          </Box>
        )
      })}
    </Box>
  )
}
