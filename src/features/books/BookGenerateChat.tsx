import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import SendIcon from '@mui/icons-material/Send'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import StopCircleIcon from '@mui/icons-material/StopCircle'

import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useTTS } from '../../core/hooks/useTTS'
import VoiceInput from '../../components/VoiceInput'
import { useProfile } from '../../core/profile/useProfile'
import { UserProfile } from '../../core/types/enums'
import type { ChatTurn } from '../../core/types'
import { ART_QUOTA_MESSAGE } from '../business/useArtQuota'
import ArtHelpSheet, { ArtHelpButton, GenerateHint } from './ArtHelpSheet'
import { useBookArtQuota } from './useBookArtQuota'
import { storyWordsPreviewLine } from './storyPracticeWords'
import { useBookGenerateChat } from './useBookGenerateChat'
import StoryLengthSelector from './StoryLengthSelector'
import StoryLevelStretchSelector from './StoryLevelStretchSelector'
import { DEFAULT_TARGET_PAGE_COUNT } from './storyPageTargets'

interface Props {
  /** Called after commitAndClose; parent dialog should close itself and navigate. */
  onCommit: (bookId: string) => void
  /** Called after abandonDraft (only available before any AI turn). */
  onAbandon: () => void
  /** When provided, the chat resumes an in-progress draft. */
  resumeBookId?: string
}

// ── Illustration style icons (emoji prefix + text; image assets TODO) ─

const STYLE_OPTIONS: Array<{ value: string; label: string; emoji: string }> = [
  { value: 'minecraft', label: 'Minecraft', emoji: '🟦' },
  { value: 'garden-warfare', label: 'Garden Battle', emoji: '🌸' },
  { value: 'storybook', label: 'Storybook', emoji: '📖' },
  { value: 'platformer', label: 'Platformer World', emoji: '🎮' },
  { value: 'comic', label: 'Comic Book', emoji: '💥' },
  { value: 'realistic', label: 'Realistic', emoji: '📷' },
]

// ── Age helper ────────────────────────────────────────────────────

function ageFromBirthdate(birthdate: string | undefined, fallback: number): number {
  if (!birthdate) return fallback
  try {
    const birth = new Date(birthdate)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    return age > 0 ? age : fallback
  } catch {
    return fallback
  }
}

// ── Component ─────────────────────────────────────────────────────

export default function BookGenerateChat({ onCommit, onAbandon, resumeBookId }: Props) {
  const familyId = useFamilyId()
  const { activeChild, isChildProfile } = useActiveChild()
  const { profile } = useProfile()
  const isParent = profile === UserProfile.Parents
  // The active profile IS the context (FEAT-173, owner decision 2026-09-02):
  // the words read, the child the server writes for and the shelf the draft
  // lands on all follow the child active in the header, exactly as every
  // other surface does. No picker here and nothing inferred from the prose —
  // a story for London is written from London's profile.
  const childName = activeChild?.name ?? 'kid'
  const childId = activeChild?.id ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'
  const childAge = ageFromBirthdate(activeChild?.birthdate, isLincoln ? 10 : 6)
  const defaultStyle = isLincoln ? 'minecraft' : 'storybook'

  const attribution = isParent && childId
    ? { createdBy: 'parent' as const, createdFor: childId }
    : childId
      ? { createdBy: childId, createdFor: childId }
      : undefined

  const chat = useBookGenerateChat({
    familyId,
    childId,
    childName,
    childAge,
    // Fresh drafts start at the priced product size (FEAT-97); the hook owns the
    // live value from here and hydrates it when resuming a saved draft.
    initialPageCount: DEFAULT_TARGET_PAGE_COUNT,
    defaultIllustrationStyle: defaultStyle,
    attribution,
    resumeBookId,
  })

  const {
    chatHistory,
    currentStory,
    illustrationStyle,
    isLoading,
    error,
    clarificationPhase,
    pendingRefinement,
    canStartStory,
    pageCount,
    setPageCount,
    levelStretch,
    setLevelStretch,
    storyWords,
    storyWordSource,
    storyWordsLoading,
    illustrationProgress,
    sendKidMessage,
    setIllustrationStyle,
    commitAndClose,
    abandonDraft,
    confirmStartStory,
    confirmAddRefinement,
    confirmChangeRefinement,
  } = chat

  const isIllustrating = illustrationProgress.phase === 'illustrating'

  // Help (FEAT-178). The counter is read for display only — the illustrate loop
  // asks for itself inside `useBookIllustrator`, and nothing here spends,
  // records or gates. Audience is capability, never a name.
  const { limit: artLimit, remaining: artRemaining } = useBookArtQuota()
  const artAudience = isChildProfile ? 'kid' : 'parent'
  const artBudget = { limit: artLimit, remaining: artRemaining, capped: isChildProfile }
  const [showArtHelp, setShowArtHelp] = useState(false)
  // What committing will actually spend: one picture per page that carries a
  // scene. A page without one is skipped and costs nothing, so counting the
  // whole story would overstate the price. Before a draft exists the chosen
  // length is the honest upper bound.
  const scenePageCount = currentStory
    ? currentStory.pages.filter((p) => (p.sceneDescription ?? '').trim() !== '').length
    : pageCount

  // ── Composer state ────────────────────────────────────────────

  const [composerText, setComposerText] = useState('')
  const tts = useTTS()

  const composerDisabled =
    isLoading ||
    isIllustrating ||
    (clarificationPhase === 'clarifying' && pendingRefinement !== null)

  const handleSend = useCallback(async () => {
    const text = composerText.trim()
    if (!text || composerDisabled) return
    setComposerText('')
    await sendKidMessage(text)
  }, [composerText, composerDisabled, sendKidMessage])

  const handleVoiceTranscript = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || composerDisabled) return
      await sendKidMessage(trimmed)
    },
    [composerDisabled, sendKidMessage],
  )

  const voiceProfile = useMemo(
    () => ({
      id: childId,
      voiceInputEnhanced: activeChild?.voiceInputEnhanced === true,
    }),
    [childId, activeChild?.voiceInputEnhanced],
  )

  // ── TTS: auto-play templated turns + first story draft ────────

  const lastReadKeyRef = useRef<string>('')
  useEffect(() => {
    if (chatHistory.length === 0) return
    let lastAi: ChatTurn | undefined
    let lastAiIndex = -1
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === 'ai') {
        lastAi = chatHistory[i]
        lastAiIndex = i
        break
      }
    }
    if (!lastAi) return
    const key = `${lastAi.ts}:${lastAiIndex}`
    if (key === lastReadKeyRef.current) return

    if (lastAi.kind === 'echo' || lastAi.kind === 'add-or-change') {
      lastReadKeyRef.current = key
      tts.cancel()
      tts.speak(lastAi.content)
      return
    }

    if (lastAi.kind === 'story-draft' && currentStory) {
      lastReadKeyRef.current = key
      const isFirstStoryDraft =
        chatHistory.filter((t) => t.role === 'ai' && t.kind === 'story-draft')
          .length === 1
      if (isFirstStoryDraft) {
        // `spokenContent` is the draft line WITHOUT the FEAT-176 readability
        // clause (UX-109). The clause tells a parent which words are above the
        // child's level, by name — read aloud beside the phone it tells the
        // child that about himself, which the charter does not allow. It stays
        // on screen and never enters this queue. An older persisted turn has
        // no `spokenContent`; `content` is then all we have.
        const queue = [
          lastAi.spokenContent ?? lastAi.content,
          ...currentStory.pages.map((p) => `Page ${p.pageNumber}: ${p.text}`),
        ]
        tts.speakQueue(queue)
      }
    }
  }, [chatHistory, currentStory, tts])

  const handleReadPageAloud = useCallback(
    (pageNumber: number, text: string) => {
      tts.cancel()
      tts.speak(`Page ${pageNumber}. ${text}`)
    },
    [tts],
  )

  // ── Scroll thread to bottom on update ─────────────────────────

  const threadRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [chatHistory, isLoading])

  // ── Commit / abandon ──────────────────────────────────────────

  /**
   * The finished book, held back from the hand-off while the cap notice is on
   * screen (FEAT-168, Codex P2 on PR #1720).
   *
   * `commitAndClose` sets `illustrationProgress` as it finishes, so a notice
   * rendered off that state used to be unmounted by `onCommit`'s navigation in
   * the same tick — a kid landed in an unillustrated book with no explanation.
   * Parking the id here lets the effect below decide: navigate as before when
   * the pictures were made, or wait for a tap when the budget refused them.
   */
  const [pendingCommitId, setPendingCommitId] = useState<string | null>(null)

  const handleCommit = useCallback(async () => {
    tts.cancel()
    const id = await commitAndClose()
    if (id) setPendingCommitId(id)
  }, [commitAndClose, tts])

  // Hand off immediately unless the day's art budget has something to say.
  // Reading `capReached` here rather than inside `handleCommit` keeps it off a
  // closure captured before `commitAndClose` ran.
  useEffect(() => {
    if (!pendingCommitId || illustrationProgress.capReached) return
    onCommit(pendingCommitId)
  }, [pendingCommitId, illustrationProgress.capReached, onCommit])

  const handleAbandon = useCallback(async () => {
    tts.cancel()
    await abandonDraft()
    onAbandon()
  }, [abandonDraft, onAbandon, tts])

  // Abandon allowed any time before an AI story-draft turn exists.
  const canAbandon = currentStory === null
  const canCommit = currentStory !== null && !isLoading && !isIllustrating

  const lastAiKind = useMemo(() => {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === 'ai') return chatHistory[i].kind
    }
    return undefined
  }, [chatHistory])

  const showYesStartButton =
    clarificationPhase === 'clarifying' &&
    pendingRefinement === null &&
    canStartStory &&
    lastAiKind === 'echo'

  // The list hasn't settled yet, so the Yes button is withheld (FEAT-169,
  // Codex P1): say why, instead of an echo turn with nothing under it.
  const showWordsLoading =
    clarificationPhase === 'clarifying' &&
    pendingRefinement === null &&
    storyWordsLoading &&
    lastAiKind === 'echo'

  const showAddOrChangeButtons =
    clarificationPhase === 'clarifying' &&
    pendingRefinement !== null &&
    lastAiKind === 'add-or-change'

  // ── Render ────────────────────────────────────────────────────

  const placeholder = useMemo(
    () =>
      isLincoln
        ? 'A Minecraft adventure with a cat and a dragon…'
        : 'A princess who finds a magic garden with talking animals…',
    [isLincoln],
  )

  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      {/* Chat thread */}
      <Box
        ref={threadRef}
        sx={{
          maxHeight: { xs: 280, sm: 360 },
          overflowY: 'auto',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          p: 1.5,
          bgcolor: 'background.default',
          minHeight: 120,
        }}
      >
        {chatHistory.length === 0 && !isLoading && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            {isLincoln
              ? 'Tell me what your story is about! Type or tap the mic.'
              : "Let's make a story! What's it about?"}
          </Typography>
        )}
        <Stack spacing={1.5}>
          {chatHistory.map((turn, idx) => {
            const isLastAi =
              turn.role === 'ai' && idx === chatHistory.length - 1
            const showYesHere =
              isLastAi && turn.kind === 'echo' && showYesStartButton
            const showWordsLoadingHere =
              isLastAi && turn.kind === 'echo' && showWordsLoading
            const showAddChangeHere =
              isLastAi && turn.kind === 'add-or-change' && showAddOrChangeButtons
            return (
              <Box
                key={`${turn.ts}-${idx}`}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: turn.role === 'kid' ? 'flex-end' : 'flex-start',
                }}
              >
                <Box
                  sx={{
                    maxWidth: '85%',
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: turn.role === 'kid' ? 'primary.50' : 'grey.100',
                    border: '1px solid',
                    borderColor: turn.role === 'kid' ? 'primary.200' : 'divider',
                  }}
                >
                  <Typography variant="body2">{turn.content}</Typography>
                </Box>
                {/* Which sight words the story will carry, said before the tap
                    (FEAT-169) — so the parent can see the list is in play, and
                    a child with nothing to practise sees no claim at all. The
                    line names its source (FEAT-172/173): a list the parent
                    typed into the idea, or the active child's practice words
                    — never one dressed as the other. */}
                {showWordsLoadingHere && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    data-testid="story-practice-words-loading"
                    sx={{ mt: 1, alignSelf: 'stretch' }}
                  >
                    One sec — checking which of {childName}&apos;s practice words to
                    bring along…
                  </Typography>
                )}
                {showYesHere && storyWords.length > 0 && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    data-testid="story-practice-words"
                    sx={{ mt: 1, alignSelf: 'stretch' }}
                  >
                    {storyWordsPreviewLine(storyWordSource, childName, storyWords)}
                  </Typography>
                )}
                {showYesHere && (
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    fullWidth
                    onClick={() => void confirmStartStory()}
                    sx={{
                      mt: 1,
                      minHeight: 56,
                      textTransform: 'none',
                      fontWeight: 700,
                    }}
                  >
                    ✓ Yes, start my story!
                  </Button>
                )}
                {showAddChangeHere && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1, width: '100%' }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => void confirmAddRefinement()}
                      sx={{ flex: 1, textTransform: 'none', fontWeight: 700 }}
                    >
                      + Add it
                    </Button>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={() => void confirmChangeRefinement()}
                      sx={{ flex: 1, textTransform: 'none', fontWeight: 700 }}
                    >
                      ↺ Change it
                    </Button>
                  </Stack>
                )}
              </Box>
            )
          })}
          {currentStory && (
            <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {currentStory.title}
              </Typography>
              {currentStory.pages.map((p) => (
                <Stack
                  key={p.pageNumber}
                  direction="row"
                  spacing={1}
                  alignItems="flex-start"
                  sx={{ mb: 0.75 }}
                >
                  <IconButton
                    size="small"
                    aria-label={`Read page ${p.pageNumber} aloud`}
                    onClick={() => handleReadPageAloud(p.pageNumber, p.text)}
                    sx={{ mt: 0.25 }}
                  >
                    {tts.isSpeaking ? (
                      <StopCircleIcon fontSize="small" />
                    ) : (
                      <VolumeUpIcon fontSize="small" />
                    )}
                  </IconButton>
                  <Typography variant="body2">
                    <strong>Page {p.pageNumber}:</strong> {p.text}
                  </Typography>
                </Stack>
              ))}
            </Box>
          )}
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Box
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  bgcolor: 'grey.100',
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">
                  …
                </Typography>
              </Box>
            </Box>
          )}
        </Stack>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      {/* The day's art budget refused or cut short the pictures (FEAT-168). The
          story itself is written and saved — only the paid illustrations have a
          ceiling — so this is a warm nudge in `text.secondary`, never an error.
          The hand-off to the book waits on the tap, so the kid actually reads
          it instead of being navigated past it. */}
      {illustrationProgress.capReached && (
        <Stack spacing={1} sx={{ py: 1 }} aria-live="polite">
          <Typography variant="body2" color="text.secondary">
            Your story is saved! {ART_QUOTA_MESSAGE} You can add photos or
            drawings in the editor.
          </Typography>
          {pendingCommitId && (
            <Box>
              <Button
                variant="contained"
                onClick={() => onCommit(pendingCommitId)}
                sx={{ minHeight: 44, textTransform: 'none' }}
              >
                Okay — take me to my book
              </Button>
            </Box>
          )}
        </Stack>
      )}

      {isIllustrating && (
        <Box
          aria-live="polite"
          role="status"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.25,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'primary.200',
            bgcolor: 'primary.50',
          }}
        >
          <CircularProgress size={20} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Making picture {illustrationProgress.currentPage} of{' '}
              {illustrationProgress.totalPages}…
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Hang tight — this can take up to a minute.
            </Typography>
          </Box>
          {illustrationProgress.lastImageUrl && (
            <Box
              component="img"
              src={illustrationProgress.lastImageUrl}
              alt="Latest picture"
              sx={{ width: 48, height: 48, borderRadius: 1, boxShadow: 1 }}
            />
          )}
        </Box>
      )}

      {/* Composer — typed input + VoiceInput module (replaces the prior
          ad-hoc mic + "Did I hear you right?" banner). */}
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <TextField
          label="Type your message"
          placeholder={placeholder}
          value={composerText}
          onChange={(e) => setComposerText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
          multiline
          minRows={1}
          maxRows={4}
          fullWidth
          disabled={composerDisabled}
          helperText={
            composerDisabled && !isLoading
              ? 'Tap Add or Change above to continue.'
              : undefined
          }
        />
        <IconButton
          color="primary"
          onClick={() => void handleSend()}
          disabled={!composerText.trim() || composerDisabled}
          aria-label="Send message"
          sx={{ mb: 0.5 }}
        >
          <SendIcon />
        </IconButton>
      </Stack>
      {childId && (
        <VoiceInput
          profile={voiceProfile}
          sourceSurface="generate-chat"
          mode="toggle"
          maxDurationSec={60}
          placeholder="Or tap the mic to speak"
          showConfirmation={true}
          disabled={composerDisabled}
          onTranscript={(text) => void handleVoiceTranscript(text)}
        />
      )}

      {/* Story length — choose before the story starts; locked once a draft exists */}
      {!currentStory && (
        <StoryLengthSelector
          value={pageCount}
          onChange={setPageCount}
          disabled={isLoading || isIllustrating}
        />
      )}

      {/* How hard are the words (FEAT-191) — a PARENT control, gated on
          capability and never on a name. A kid never sees it: choosing to write
          above your own reading level is a teaching decision, and the honest
          line about what came out above the level is already parent-only.
          Locked once a draft exists, like the length: the book is written. */}
      {isParent && !currentStory && (
        <StoryLevelStretchSelector
          value={levelStretch}
          onChange={setLevelStretch}
          childName={childName}
          disabled={isLoading || isIllustrating}
        />
      )}

      {/* Illustration style strip */}
      <Box>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Picture style
          </Typography>
          {/* One "?" for the whole surface (FEAT-178) — what each style looks
              like, what committing spends, and what it never touches. */}
          <ArtHelpButton onClick={() => setShowArtHelp(true)} />
        </Stack>
        <ToggleButtonGroup
          value={illustrationStyle}
          exclusive
          onChange={(_, val) => {
            if (val) setIllustrationStyle(val)
          }}
          sx={{ flexWrap: 'wrap' }}
          size="small"
        >
          {STYLE_OPTIONS.map((opt) => (
            <ToggleButton
              key={opt.value}
              value={opt.value}
              aria-label={`Picture style: ${opt.label}`}
              sx={{ textTransform: 'none', px: 1.5 }}
            >
              <span aria-hidden style={{ marginRight: 6 }}>{opt.emoji}</span>
              {opt.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Commit + abandon */}
      <Stack spacing={1} alignItems="stretch">
        <Button
          variant="contained"
          size="large"
          disabled={!canCommit}
          onClick={() => void handleCommit()}
          sx={{ minHeight: 56, textTransform: 'none', fontWeight: 700 }}
        >
          ✓ Make my book!
        </Button>
        {/* What committing makes and what it spends (FEAT-178). At the cap the
            surface already shows ART_QUOTA_MESSAGE above, so the hint stands
            down rather than doubling it. */}
        {!illustrationProgress.capReached && (
          <GenerateHint
            door="illustrateBook"
            audience={artAudience}
            count={scenePageCount}
          />
        )}
        {canAbandon && (
          <Button
            variant="text"
            size="small"
            onClick={() => void handleAbandon()}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            Cancel — start over
          </Button>
        )}
      </Stack>

      <ArtHelpSheet
        surface="generateBook"
        open={showArtHelp}
        onClose={() => setShowArtHelp(false)}
        audience={artAudience}
        budget={artBudget}
      />
    </Stack>
  )
}
