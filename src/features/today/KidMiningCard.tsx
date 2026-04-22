import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

interface KidMiningCardProps {
  todayMinedMinutes: number
  isLincoln: boolean
  onStart: () => void
}

/** Prominent, always-available Knowledge Mine entry point on Kid Today. */
export default function KidMiningCard({
  todayMinedMinutes,
  isLincoln,
  onStart,
}: KidMiningCardProps) {
  const mcFont = isLincoln ? '"Press Start 2P", monospace' : 'monospace'
  const hasMined = todayMinedMinutes > 0

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: isLincoln ? 'rgba(0,0,0,0.75)' : 'grey.50',
        border: '1px solid',
        borderColor: isLincoln ? '#5BFCEE' : 'info.light',
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: '1.5rem' }}>⛏️</Typography>
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 700,
              ...(isLincoln
                ? { fontFamily: mcFont, fontSize: '0.6rem', color: '#FFFFFF' }
                : {}),
            }}
          >
            Knowledge Mine
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: isLincoln ? 'rgba(255,255,255,0.7)' : 'text.secondary',
              ...(isLincoln ? { fontFamily: mcFont, fontSize: '0.4rem' } : {}),
              mt: 0.25,
            }}
          >
            Reading
          </Typography>
        </Box>
      </Stack>

      <Typography
        variant="body2"
        sx={{
          color: isLincoln
            ? hasMined
              ? '#5BFCEE'
              : 'rgba(255,255,255,0.6)'
            : hasMined
              ? 'info.main'
              : 'text.secondary',
          fontWeight: hasMined ? 700 : 500,
          ...(isLincoln ? { fontFamily: mcFont, fontSize: '0.45rem' } : {}),
          mb: 1.5,
        }}
      >
        {hasMined
          ? `⛏️ Mined ${todayMinedMinutes} min today`
          : 'No mining yet today'}
      </Typography>

      <Button
        fullWidth
        size="large"
        variant="contained"
        onClick={onStart}
        sx={
          isLincoln
            ? {
                fontFamily: mcFont,
                fontSize: '0.5rem',
                bgcolor: '#3C3C3C',
                color: '#5BFCEE',
                minHeight: 48,
                '&:hover': { bgcolor: '#4C4C4C' },
              }
            : { minHeight: 48 }
        }
      >
        ⛏️ Start Mining
      </Button>
    </Box>
  )
}
