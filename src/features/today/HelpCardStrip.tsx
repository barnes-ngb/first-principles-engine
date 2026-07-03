import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { helpCardsCollection } from '../../core/firebase/firestore'
import { TaskType, useAI } from '../../core/ai/useAI'
import type { ChecklistItem, HelpCard, HelpCardVideo } from '../../core/types'
import { helpCardDocId, normalizeHelpCardLabel } from '../../core/utils/helpCard'

interface HelpCardStripProps {
  familyId: string
  childId: string
  item: ChecklistItem
  /** True when the day is a Minimum Viable Day — surfaces the ≤5-min version first. */
  isMvd: boolean
}

/** One labelled section of the expanded card. */
function CardSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: 'text.secondary' }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

/**
 * Inline Help Card strip on a Today checklist item (FEAT-43, slice 1 of
 * FEAT-40). Parent-view only. Collapsed by default (D7) to protect the
 * 60-second bar: a single "💡 Help with this" row that expands into the
 * batch-generated teaching help (Play it / Say this / Not landing? / 5-min /
 * When to stop) plus a lazily-fetched video slot.
 *
 * Self-hiding: if no card was generated for this item (generation failed, or the
 * item doesn't qualify), the strip renders nothing.
 */
export default function HelpCardStrip({ familyId, childId, item, isMvd }: HelpCardStripProps) {
  const { chat } = useAI()
  const [card, setCard] = useState<HelpCard | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoTried, setVideoTried] = useState(false)

  const docId = helpCardDocId(childId, item)

  // Load the card body on mount. No card → render nothing.
  useEffect(() => {
    let alive = true
    if (!familyId || !childId) return
    void (async () => {
      try {
        const snap = await getDoc(doc(helpCardsCollection(familyId), docId))
        if (!alive) return
        if (snap.exists()) {
          const data = { ...(snap.data() as HelpCard), id: snap.id }
          setCard(data)
          if (data.video) setVideoTried(true)
        }
      } catch (err) {
        console.warn('[HelpCardStrip] Failed to load help card:', err)
      }
    })()
    return () => {
      alive = false
    }
  }, [familyId, childId, docId])

  // Lazy-fetch the video on first expand (D3), then cache it onto the card doc.
  const fetchVideo = useCallback(async () => {
    if (!card || card.video || videoTried || videoLoading) return
    setVideoLoading(true)
    setVideoTried(true)
    try {
      const cleanLabel = normalizeHelpCardLabel(item.label)
      const res = await chat({
        familyId,
        childId,
        taskType: TaskType.LessonVideo,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              lessonTopic: cleanLabel,
              lessonObjective: item.contentGuide?.trim() || undefined,
              subjectBucket: item.subjectBucket || undefined,
            }),
          },
        ],
      })
      if (!res?.message) return
      const video = JSON.parse(res.message) as HelpCardVideo
      if (!video?.title || !video?.url) return
      setCard((prev) => (prev ? { ...prev, video } : prev))
      // Persist onto the card doc (merge — never clobbers the body).
      await setDoc(
        doc(helpCardsCollection(familyId), docId),
        { video, videoFetchedAt: new Date().toISOString() },
        { merge: true },
      )
    } catch (err) {
      // Silent per spec — the slot just renders nothing on failure.
      console.warn('[HelpCardStrip] Video fetch failed:', err)
    } finally {
      setVideoLoading(false)
    }
  }, [card, videoTried, videoLoading, chat, familyId, childId, docId, item.label, item.contentGuide, item.subjectBucket])

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next) void fetchVideo()
  }

  if (!card) return null
  const { body } = card

  const playItBlock = (
    <CardSection title={`Play it · ${body.playIt.minutes} min`}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {body.playIt.title}
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.25 } }}>
        {body.playIt.howTo.map((step, i) => (
          <li key={i}>
            <Typography variant="body2" component="span">
              {step}
            </Typography>
          </li>
        ))}
      </Box>
      {body.playIt.materials.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          Materials: {body.playIt.materials.join(', ')}
        </Typography>
      )}
      {body.twoKid && (
        <Typography variant="body2" sx={{ mt: 0.25, fontStyle: 'italic' }}>
          👥 {body.twoKid}
        </Typography>
      )}
    </CardSection>
  )

  const mvdBlock = body.mvdVersion ? (
    <CardSection title="5-minute version">
      <Typography variant="body2">{body.mvdVersion}</Typography>
    </CardSection>
  ) : null

  return (
    <Box sx={{ ml: 5, mt: 0.5 }}>
      <Box
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleToggle()
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
          color: 'text.secondary',
          '&:hover': { color: 'text.primary' },
        }}
      >
        <LightbulbOutlinedIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Help with this
        </Typography>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Stack
          spacing={1}
          sx={{ mt: 0.75, p: 1, borderRadius: 1, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}
        >
          {/* MVD day: surface the ≤5-min version first (D-MVD). */}
          {isMvd ? (
            <>
              {mvdBlock}
              {playItBlock}
            </>
          ) : (
            <>
              {playItBlock}
              {mvdBlock}
            </>
          )}

          {body.sayThis.length > 0 && (
            <CardSection title="Say this">
              {body.sayThis.map((line, i) => (
                <Typography key={i} variant="body2">
                  {line}
                </Typography>
              ))}
            </CardSection>
          )}

          {body.attentionRescue && (
            <CardSection title="Not landing? Try this">
              <Typography variant="body2">{body.attentionRescue}</Typography>
            </CardSection>
          )}

          {body.skipSignal && (
            <CardSection title="When to stop">
              <Typography variant="body2">{body.skipSignal}</Typography>
            </CardSection>
          )}

          {/* Watch — lazily fetched on first expand; renders nothing on failure. */}
          <CardSection title="Watch">
            {videoLoading && (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={14} />
                <Typography variant="caption" color="text.secondary">
                  Finding a video…
                </Typography>
              </Stack>
            )}
            {!videoLoading && card.video && (
              <Stack spacing={0.5}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {card.video.title}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {card.video.source && <Chip size="small" label={card.video.source} />}
                  {card.video.lengthNote && (
                    <Chip size="small" variant="outlined" label={card.video.lengthNote} />
                  )}
                </Stack>
                {card.video.why && (
                  <Typography variant="caption" color="text.secondary">
                    {card.video.why}
                  </Typography>
                )}
                <Button
                  size="small"
                  variant="text"
                  startIcon={<OpenInNewIcon />}
                  href={card.video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                >
                  Open / cast
                </Button>
              </Stack>
            )}
            {!videoLoading && !card.video && (
              <Typography variant="caption" color="text.disabled">
                No video for this one.
              </Typography>
            )}
          </CardSection>
        </Stack>
      </Collapse>
    </Box>
  )
}
