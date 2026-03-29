import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { POSES } from './voxel/poseSystem'

interface PoseButtonsProps {
  onPose: (poseId: string) => void
  currentPose: string | null
  isLincoln?: boolean
}

export default function PoseButtons({ onPose, currentPose, isLincoln = true }: PoseButtonsProps) {
  const visiblePoses = POSES.filter((p) => p.id !== 'idle')
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        gap: '8px',
        py: 1.5,
        px: 2,
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
              width: 56,
              height: 56,
              borderRadius: isLincoln ? '8px' : '50%',
              border: isActive
                ? `2px solid ${accentColor}`
                : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              background: isActive
                ? (isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.15)')
                : (isLincoln ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
              color: isActive
                ? accentColor
                : (isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)'),
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none',
              p: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              position: 'relative',
              boxShadow: isActive
                ? `0 0 12px ${accentColor}33`
                : 'none',
              '&:hover': {
                background: isActive
                  ? (isLincoln ? 'rgba(126,252,32,0.22)' : 'rgba(232,160,191,0.22)')
                  : (isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'),
                borderColor: isActive ? accentColor : (isLincoln ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)'),
                transform: 'translateY(-1px)',
              },
              '&:active': {
                transform: 'scale(0.92)',
              },
            }}
            title={pose.name}
          >
            <Box sx={{ fontSize: '22px', lineHeight: 1 }}>{pose.icon}</Box>
            <Typography
              sx={{
                fontSize: isLincoln ? '12px' : '12px',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                letterSpacing: isLincoln ? '-0.3px' : '0',
                opacity: isActive ? 1 : 0.7,
                lineHeight: 1,
                mt: '2px',
                fontWeight: isActive ? 700 : 400,
                color: 'inherit',
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
