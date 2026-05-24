import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type {
  MonthlyReview,
  MonthlyReviewPage as MonthlyReviewPageType,
  MonthStats,
  PageContent,
} from '../../core/types'
import { SectionType, SubjectBucketLabel } from '../../core/types/enums'
import { MonthlyPhoto } from './MonthlyPhoto'
import { usePhotoUrl } from './usePhotoUrl'

type ReaderMode = 'kid' | 'parent'

interface MonthlyReviewPageProps {
  page: MonthlyReviewPageType
  review: MonthlyReview
  mode: ReaderMode
}

function getContent(page: MonthlyReviewPageType, mode: ReaderMode): PageContent {
  return mode === 'kid' ? page.kidMode : page.parentMode
}

function formatMonthLabel(month: string): string {
  // month is YYYY-MM
  const [yearStr, monthStr] = month.split('-')
  const year = Number(yearStr)
  const monthIdx = Number(monthStr) - 1
  if (Number.isNaN(year) || Number.isNaN(monthIdx)) return month
  const d = new Date(year, monthIdx, 1)
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

export function MonthlyReviewPage({
  page,
  review,
  mode,
}: MonthlyReviewPageProps) {
  switch (page.sectionType) {
    case SectionType.Cover:
      return <CoverLayout page={page} review={review} mode={mode} />
    case SectionType.ByTheNumbers:
      return <StatsLayout page={page} review={review} mode={mode} />
    default:
      return <StandardLayout page={page} review={review} mode={mode} />
  }
}

// ── Cover ──────────────────────────────────────────────────────

function CoverLayout({ page, review, mode }: MonthlyReviewPageProps) {
  const content = getContent(page, mode)
  const hero = review.heroPhotoRef ?? page.photoRefs[0]
  const { url: heroUrl, failed } = usePhotoUrl(hero?.storagePath)
  const monthLabel = formatMonthLabel(review.month)

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        minHeight: '70vh',
        borderRadius: 3,
        overflow: 'hidden',
        bgcolor: 'grey.300',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {heroUrl && !failed && (
        <Box
          component="img"
          src={heroUrl}
          alt={review.theme}
          loading="lazy"
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
      <Box
        sx={{
          position: 'relative',
          background:
            'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0) 100%)',
          color: '#fff',
          textAlign: 'center',
          px: 3,
          pt: 6,
          pb: 4,
        }}
      >
        <Typography
          sx={{
            fontFamily: '"Georgia", "Times New Roman", serif',
            fontStyle: 'italic',
            fontSize: { xs: 36, sm: 48 },
            lineHeight: 1.1,
            fontWeight: 500,
            mb: 1,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          }}
        >
          {review.theme || content.headline || monthLabel}
        </Typography>
        {content.headline && content.headline !== review.theme && (
          <Typography
            variant="h6"
            sx={{ mb: 1, opacity: 0.95, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
          >
            {content.headline}
          </Typography>
        )}
        <Typography
          variant="subtitle1"
          sx={{ opacity: 0.9, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
        >
          {monthLabel}
        </Typography>
      </Box>
    </Box>
  )
}

// ── Stats ──────────────────────────────────────────────────────

const STAT_EMOJI: Record<string, string> = {
  totalHours: '⏱️',
  booksCompleted: '\u{1F4D6}',
  booksRead: '\u{1F4DA}',
  quests: '⛏️',
  blockersResolved: '\u{1F389}',
  dadLabCount: '\u{1F9EA}',
  totalDiamonds: '\u{1F48E}',
}

const STAT_LABELS: Record<string, string> = {
  totalHours: 'Hours',
  booksCompleted: 'Books made',
  booksRead: 'Books read',
  quests: 'Quests',
  blockersResolved: 'Blockers beat',
  dadLabCount: 'Dad Lab',
  totalDiamonds: 'Diamonds',
}

const STAT_KEYS: Array<keyof MonthStats> = [
  'totalDiamonds',
  'totalHours',
  'booksRead',
  'booksCompleted',
  'quests',
  'dadLabCount',
  'blockersResolved',
]

function StatsLayout({ page, review, mode }: MonthlyReviewPageProps) {
  const content = getContent(page, mode)
  const stats = review.stats

  return (
    <Stack spacing={3} sx={{ px: 1, py: 2 }}>
      <Typography
        variant="h4"
        sx={{
          fontFamily: '"Georgia", serif',
          fontWeight: 600,
        }}
      >
        {content.headline ?? 'By the Numbers'}
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
          gap: 2,
        }}
      >
        {STAT_KEYS.map((key) => {
          const raw = stats[key]
          if (typeof raw !== 'number') return null
          const value =
            key === 'totalHours' ? raw.toFixed(1) : raw.toString()
          return (
            <Box
              key={key}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2 }}
              >
                {mode === 'kid' && (
                  <Box component="span" sx={{ mr: 0.5 }}>
                    {STAT_EMOJI[key] ?? ''}
                  </Box>
                )}
                {value}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {STAT_LABELS[key] ?? key}
              </Typography>
            </Box>
          )
        })}
      </Box>

      {content.body && (
        <Typography
          sx={{ fontSize: 17, lineHeight: 1.6, color: 'text.primary' }}
        >
          {content.body}
        </Typography>
      )}

      {mode === 'parent' && Object.keys(stats.hoursBySubject ?? {}).length > 0 && (
        <Box>
          <Typography
            variant="subtitle2"
            sx={{ mb: 1, color: 'text.secondary' }}
          >
            Hours by subject
          </Typography>
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            {Object.entries(stats.hoursBySubject)
              .sort((a, b) => b[1] - a[1])
              .map(([subject, hours], idx, arr) => (
                <Stack
                  key={subject}
                  direction="row"
                  justifyContent="space-between"
                  sx={{
                    px: 2,
                    py: 1,
                    borderBottom:
                      idx === arr.length - 1 ? 'none' : '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2">
                    {SubjectBucketLabel[subject as keyof typeof SubjectBucketLabel] ?? subject}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {hours.toFixed(1)}h
                  </Typography>
                </Stack>
              ))}
          </Box>
        </Box>
      )}
    </Stack>
  )
}

// ── Standard ────────────────────────────────────────────────────

function StandardLayout({ page, mode }: MonthlyReviewPageProps) {
  const content = getContent(page, mode)
  const photos = page.photoRefs ?? []

  return (
    <Stack spacing={2.5} sx={{ px: 1, py: 2 }}>
      {content.headline && (
        <Typography
          variant="h4"
          sx={{
            fontFamily: '"Georgia", serif',
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {content.headline}
        </Typography>
      )}

      {photos.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            gap: 1.5,
            overflowX: 'auto',
            pb: 1,
            mx: -1,
            px: 1,
            '&::-webkit-scrollbar': { height: 6 },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'divider',
              borderRadius: 3,
            },
          }}
        >
          {photos.map((photo) => (
            <Box key={photo.id} sx={{ flexShrink: 0, width: 140 }}>
              <MonthlyPhoto
                photo={photo}
                caption={content.captions?.[photo.id]}
                size={140}
              />
            </Box>
          ))}
        </Box>
      )}

      {content.body && (
        <Typography
          sx={{
            fontSize: 17,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {content.body}
        </Typography>
      )}

      {content.highlights && content.highlights.length > 0 && (
        <Box
          component="ul"
          sx={{
            pl: 3,
            mt: 1,
            '& li': { fontWeight: 600, fontSize: 15, lineHeight: 1.5, mb: 0.5 },
          }}
        >
          {content.highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </Box>
      )}
    </Stack>
  )
}
