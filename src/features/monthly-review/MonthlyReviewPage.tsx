import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined'

import type {
  MonthlyReview,
  MonthlyReviewPage as MonthlyReviewPageType,
  MonthStats,
  PageContent,
} from '../../core/types'
import { SectionType, SubjectBucketLabel } from '../../core/types/enums'
import { formatSubjectMinutes } from './formatSubjectMinutes'
import { MonthlyPhoto } from './MonthlyPhoto'
import { getModePhotos, type ReaderMode } from './photoRefs'
import { usePhotoUrl } from './usePhotoUrl'

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
    case SectionType.MoreFromMonth:
      return <MoreFromMonthLayout page={page} review={review} mode={mode} />
    default:
      return <StandardLayout page={page} review={review} mode={mode} />
  }
}

// ── Cover ──────────────────────────────────────────────────────

function CoverLayout({ page, review, mode }: MonthlyReviewPageProps) {
  const content = getContent(page, mode)
  const hero = review.heroPhotoRef ?? getModePhotos(page, mode)[0]
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
  totalHours: 'Time',
  booksCompleted: 'Books made',
  booksRead: 'Books read',
  quests: 'Quests',
  blockersResolved: 'Blockers beat',
  dadLabCount: 'Dad Lab',
  totalDiamonds: 'Diamonds',
}

// Kid mode leads with diamonds (his motivator). Parent mode leads with hours
// (the compliance signal Shelly scans for first).
const KID_MODE_TILE_ORDER: Array<keyof MonthStats> = [
  'totalDiamonds',
  'booksRead',
  'booksCompleted',
  'quests',
  'totalHours',
  'dadLabCount',
  'blockersResolved',
]

const PARENT_MODE_TILE_ORDER: Array<keyof MonthStats> = [
  'totalHours',
  'totalDiamonds',
  'booksCompleted',
  'booksRead',
  'quests',
  'dadLabCount',
  'blockersResolved',
]

// In kid mode, zero-value tiles are a soft anti-pattern on a celebration
// artifact — a 10-year-old reading "0 Dad Lab" or "0 Blockers beat" reads
// as scolding. Always show diamonds/hours/quests (zero there is meaningful
// or improbable); hide the rest when they're zero.
const KID_MODE_ALWAYS_SHOW: ReadonlyArray<keyof MonthStats> = [
  'totalDiamonds',
  'totalHours',
  'quests',
]

function StatsLayout({ page, review, mode }: MonthlyReviewPageProps) {
  const content = getContent(page, mode)
  const stats = review.stats

  const orderedKeys =
    mode === 'kid' ? KID_MODE_TILE_ORDER : PARENT_MODE_TILE_ORDER
  const visibleKeys = orderedKeys.filter((key) => {
    if (mode === 'parent') return true
    if (KID_MODE_ALWAYS_SHOW.includes(key)) return true
    const raw = stats[key]
    return typeof raw === 'number' && raw > 0
  })

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
        {visibleKeys.map((key) => {
          const raw = stats[key]
          if (typeof raw !== 'number') return null
          // Prefer the canonical integer-minute total when present so the
          // tile reads "Xh Ym" / "Xm" — matching the per-subject breakdown
          // below. Legacy reviews stored only `totalHours` (decimal), so
          // fall back to `totalHours * 60` for those.
          const value =
            key === 'totalHours'
              ? formatSubjectMinutes(stats.totalMinutes ?? raw * 60)
              : raw.toString()
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
              .map(([subject, minutes], idx, arr) => (
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
                    {formatSubjectMinutes(minutes)}
                  </Typography>
                </Stack>
              ))}
          </Box>
        </Box>
      )}
    </Stack>
  )
}

// ── More from this month ────────────────────────────────────────

function MoreFromMonthLayout({ page, mode }: MonthlyReviewPageProps) {
  const content = getContent(page, mode)
  const photos = getModePhotos(page, mode)

  // Match the StandardLayout photo-row swipe fix: keep horizontal gestures
  // inside the gallery from triggering page flips in MonthlyReviewReader.
  const stopTouchPropagation = (e: React.TouchEvent) => {
    e.stopPropagation()
  }

  if (photos.length === 0) return null

  return (
    <Stack spacing={2} sx={{ px: 1, py: 2 }}>
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
      {content.body && (
        <Typography
          sx={{ fontSize: 14, color: 'text.secondary' }}
        >
          {content.body}
        </Typography>
      )}
      <Box
        onTouchStart={stopTouchPropagation}
        onTouchMove={stopTouchPropagation}
        onTouchEnd={stopTouchPropagation}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 1.5,
          mt: 1,
        }}
      >
        {photos.map((photo) => (
          <MonthlyPhoto
            key={photo.id}
            photo={photo}
            caption={content.captions?.[photo.id]}
          />
        ))}
      </Box>
    </Stack>
  )
}

// ── Standard ────────────────────────────────────────────────────

function StandardLayout({ page, mode }: MonthlyReviewPageProps) {
  const content = getContent(page, mode)
  const photos = getModePhotos(page, mode)
  const hasPhotos = photos.length > 0
  const isParentMode = mode === 'parent'

  // Stop touch events from bubbling to MonthlyReviewReader's swipe handler.
  // Without this, a horizontal scroll inside the photo strip would flip the
  // page instead of scrolling photos.
  const stopTouchPropagation = (e: React.TouchEvent) => {
    e.stopPropagation()
  }

  return (
    <Stack
      spacing={2.5}
      sx={{
        px: 1,
        py: 2,
        minHeight: '100%',
        // Center vertically when there are no photos so the body doesn't
        // float in a sea of empty white space.
        justifyContent: hasPhotos ? 'flex-start' : 'center',
      }}
    >
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

      {hasPhotos ? (
        <Box
          onTouchStart={stopTouchPropagation}
          onTouchMove={stopTouchPropagation}
          onTouchEnd={stopTouchPropagation}
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
      ) : isParentMode ? (
        <Alert
          severity="info"
          icon={<PhotoLibraryOutlinedIcon />}
          sx={{ my: 1 }}
        >
          No photos for this section — consider adding one or regenerating.
        </Alert>
      ) : null}

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
