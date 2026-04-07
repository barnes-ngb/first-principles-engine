import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

export interface HeroMission {
  icon: string
  title: string
  text: string
  cta: string
  action: () => void
}

interface HeroMissionCardProps {
  mission: HeroMission
  isLincoln: boolean
}

export default function HeroMissionCard({ mission, isLincoln }: HeroMissionCardProps) {
  return (
    <Box
      sx={{
        mx: 1,
        mt: 1,
        p: 2,
        borderRadius: isLincoln ? '8px' : '16px',
        border: isLincoln ? '1px solid rgba(123,240,255,0.45)' : '1px solid rgba(232,160,191,0.35)',
        background: isLincoln
          ? 'linear-gradient(160deg, rgba(8,14,22,0.96), rgba(18,26,40,0.96))'
          : 'linear-gradient(160deg, rgba(255,245,250,0.98), rgba(247,236,244,0.96))',
        boxShadow: isLincoln ? '0 0 22px rgba(123,240,255,0.18)' : '0 6px 18px rgba(232,160,191,0.2)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: '20px', lineHeight: 1 }}>{mission.icon}</Typography>
        <Typography
          sx={{
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
            fontSize: isLincoln ? '12px' : '16px',
            fontWeight: 700,
            color: isLincoln ? '#F7D774' : '#7a3f67',
            textTransform: 'uppercase',
          }}
        >
          {mission.title}
        </Typography>
      </Box>
      <Typography
        sx={{
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
          fontSize: isLincoln ? '11px' : '16px',
          lineHeight: 1.5,
          color: isLincoln ? 'rgba(255,255,255,0.9)' : 'rgba(32,16,24,0.82)',
          mb: 2,
        }}
      >
        {mission.text}
      </Typography>
      <Box
        component="button"
        onClick={mission.action}
        sx={{
          width: '100%',
          minHeight: 46,
          px: 1.5,
          py: 1.25,
          borderRadius: isLincoln ? '6px' : '14px',
          border: '2px solid transparent',
          background: isLincoln
            ? 'linear-gradient(135deg, #7BFCFF 0%, #52d7ff 100%)'
            : 'linear-gradient(135deg, #ff8fd3 0%, #ffc2e7 100%)',
          color: '#121417',
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
          fontSize: isLincoln ? '11px' : '16px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: isLincoln ? '0 6px 20px rgba(82,215,255,0.4)' : '0 6px 20px rgba(255,143,211,0.35)',
          '&:hover': { transform: 'translateY(-1px)' },
          '&:active': { transform: 'scale(0.98)' },
        }}
      >
        {mission.cta} →
      </Box>
    </Box>
  )
}
