import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { UserProfile } from '../../core/types/enums'
import { useProfile } from '../../core/profile/useProfile'

const profiles = [
  {
    id: UserProfile.Lincoln,
    label: 'Lincoln',
    description: 'Your personal dashboard',
    color: '#43a047',
    bgLight: '#e8f5e9',
  },
  {
    id: UserProfile.London,
    label: 'London',
    description: 'Your personal dashboard',
    color: '#e91e63',
    bgLight: '#fce4ec',
  },
  {
    id: UserProfile.Parents,
    label: 'Parents',
    description: 'Full access + editing',
    color: '#5c6bc0',
    bgLight: '#e8eaf6',
  },
] as const

export default function ProfileSelectPage() {
  const { selectProfile } = useProfile()

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f5f7 0%, #e8eaf6 100%)',
        px: 2,
      }}
    >
      <Typography
        variant="h4"
        sx={{ mb: 1, fontWeight: 700, color: '#333' }}
      >
        Who&apos;s here?
      </Typography>
      <Typography
        variant="body1"
        sx={{ mb: 4, color: 'text.secondary' }}
      >
        Select your profile to get started
      </Typography>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={3}
        sx={{ width: '100%', maxWidth: 640, justifyContent: 'center' }}
      >
        {profiles.map((p) => (
          <Button
            key={p.id}
            onClick={() => selectProfile(p.id)}
            sx={{
              flex: 1,
              minHeight: 160,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              borderRadius: 3,
              border: `2px solid ${p.color}30`,
              backgroundColor: p.bgLight,
              color: p.color,
              textTransform: 'none',
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: `${p.color}18`,
                borderColor: p.color,
                transform: 'translateY(-4px)',
                boxShadow: `0 8px 24px ${p.color}25`,
              },
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                backgroundColor: `${p.color}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: p.color,
              }}
            >
              {p.label[0]}
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: p.color }}>
              {p.label}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {p.description}
            </Typography>
          </Button>
        ))}
      </Stack>
    </Box>
  )
}
