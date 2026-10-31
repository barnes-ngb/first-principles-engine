import type { ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { plannerAskContextLine, type PlannerAskHandoff } from '../planner-chat/plannerAskHandoff'
import type { ComposerDraft } from './composerCustody'
import { PLANNER_ASK_HANDOFF_REFUSAL_LINES } from './plannerAskHandoffLines'
import type { PlannerAskHandoffState } from './usePlannerAskHandoff'

/**
 * What Ask AI says about a question handed over from the planner (UX-273).
 *
 * Four jobs: name the context that will travel with the question, never let a
 * draft be replaced or a saved conversation be joined without an explicit tap,
 * when the question cannot be used say so and name where it still is, and for
 * as long as a draft of hers is set aside, keep saying so and keep the way back
 * to it one tap away. It renders no Send and writes nothing.
 *
 * Buttons stack on `xs` so two choices are reachable on a phone without
 * truncation, and every draft preview scrolls rather than clipping.
 */

interface PlannerAskHandoffNoticeProps {
  state: PlannerAskHandoffState
  onKeepExisting: () => void
  onReplace: () => void
  onRestoreSetAside: () => void
  onDiscardSetAside: () => void
  onKeepSetAside: () => void
  onStartFresh: () => void
  onKeepConversation: () => void
  onDismiss: () => void
}

function sourceLabel(handoff: PlannerAskHandoff): string {
  const context = plannerAskContextLine(handoff)
  return context ? `From Plan My Week — ${context}` : 'From Plan My Week'
}

/** Her words, in full and scrollable: she is choosing between two drafts. */
function DraftPreview({ text }: { text: string }) {
  return (
    <Typography
      variant="body2"
      sx={{
        mt: 0.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: 120,
        overflowY: 'auto',
        fontStyle: 'italic',
      }}
    >
      {text}
    </Typography>
  )
}

function attachmentNote(draft: ComposerDraft): string {
  const count =
    draft.attachments.length + (draft.referenceImage ? 1 : 0) + draft.uploadFiles.length
  const extras = [
    ...(count === 1 ? ['1 image'] : count > 1 ? [`${count} images`] : []),
    ...(draft.imageIdea.trim() || draft.imageFlowOpen ? ['an image you were describing'] : []),
  ]
  return extras.length === 0 ? '' : ` (with ${extras.join(' and ')})`
}

export default function PlannerAskHandoffNotice({
  state,
  onKeepExisting,
  onReplace,
  onRestoreSetAside,
  onDiscardSetAside,
  onKeepSetAside,
  onStartFresh,
  onKeepConversation,
  onDismiss,
}: PlannerAskHandoffNoticeProps) {
  if (state.kind === 'idle') return null

  const wrap = (children: ReactNode) => <Box sx={{ px: 1.5, pt: 1 }}>{children}</Box>

  /**
   * The draft that is set aside and still waiting, after the question's own
   * note has gone — closed, sent, or the box cleared.
   *
   * Deliberately NOT closeable. Every other note here can be dismissed because
   * what it says is recoverable from somewhere else; this one is the only thing
   * on screen that says where unsent work went, so its two exits are the two
   * decisions — bring it back, or throw it away — and both are taps she makes.
   *
   * It names WHICH draft it is holding rather than assuming. After a restore
   * the two have swapped: what is set aside is then the question as she had
   * edited it, which the planner cannot give back.
   */
  if (state.kind === 'set-aside') {
    const mine = state.holds === 'mine'
    return wrap(
      <Alert severity="info" icon={false}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {mine ? 'Your own draft is' : "The planner's question is"} set aside, unsent
          {attachmentNote(state.draft)}.
        </Typography>
        {state.draft.text.trim() !== '' && <DraftPreview text={state.draft.text} />}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
          <Button size="small" variant="contained" onClick={onRestoreSetAside}>
            {mine ? 'Bring my own draft back' : 'Bring that draft back'}
          </Button>
          <Button size="small" variant="outlined" onClick={onDiscardSetAside}>
            Discard it
          </Button>
        </Stack>
      </Alert>,
    )
  }

  /**
   * Two drafts, two homes, and she has asked for a third.
   *
   * One of them has to go and she is the one who decides which — the draft in
   * the box is about to become the set-aside one, so the draft already set
   * aside is what would be lost, and it is shown here rather than described.
   */
  if (state.kind === 'displace-confirm') {
    return wrap(
      <Alert severity="warning" icon={false}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          You already have a draft set aside{attachmentNote(state.standing)}.
        </Typography>
        {state.standing.text.trim() !== '' && <DraftPreview text={state.standing.text} />}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Using the planner&apos;s question sets aside what&apos;s in the box instead, so this one
          would be discarded. Nothing has been sent.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
          <Button size="small" variant="outlined" onClick={onKeepSetAside}>
            Keep it
          </Button>
          <Button size="small" variant="contained" onClick={onReplace}>
            Discard it and use the question
          </Button>
        </Stack>
      </Alert>,
    )
  }

  if (state.kind === 'refused') {
    return wrap(
      <Alert severity="info" onClose={onDismiss}>
        {PLANNER_ASK_HANDOFF_REFUSAL_LINES[state.reason]}
      </Alert>,
    )
  }

  if (state.kind === 'withdrawn') {
    return wrap(
      <Alert severity="warning" onClose={onDismiss}>
        <Typography variant="body2">{PLANNER_ASK_HANDOFF_REFUSAL_LINES[state.reason]}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {sourceLabel(state.handoff)}. Nothing was sent.
        </Typography>
      </Alert>,
    )
  }

  if (state.kind === 'declined') {
    return wrap(
      <Alert severity="info" onClose={onDismiss}>
        Kept this conversation. {sourceLabel(state.handoff)} — your question is still in Plan My
        Week.
      </Alert>,
    )
  }

  if (state.kind === 'thread-choice') {
    return wrap(
      <Alert severity="warning" icon={false}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          You&apos;re in a saved conversation.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Asking here would send your question with this conversation&apos;s history.{' '}
          {sourceLabel(state.handoff)}:
        </Typography>
        <DraftPreview text={state.handoff.question} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
          <Button size="small" variant="contained" onClick={onStartFresh}>
            Ask in a new conversation
          </Button>
          <Button size="small" variant="outlined" onClick={onKeepConversation}>
            Not now
          </Button>
        </Stack>
      </Alert>,
    )
  }

  if (state.kind === 'collision') {
    return wrap(
      <Alert severity="warning" icon={false}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {state.fromOtherThread
            ? 'You were typing this in another conversation.'
            : 'You were already typing something.'}
        </Typography>
        <DraftPreview text={state.mine.text} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Kept in the box{attachmentNote(state.mine)}. {sourceLabel(state.handoff)} wants to put
          this there instead:
        </Typography>
        <DraftPreview text={state.handoff.question} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
          <Button size="small" variant="contained" onClick={onKeepExisting}>
            Keep what I was typing
          </Button>
          <Button size="small" variant="outlined" onClick={onReplace}>
            Use the planner&apos;s question
          </Button>
        </Stack>
      </Alert>,
    )
  }

  if (state.kind === 'kept') {
    return wrap(
      <Alert severity="info" onClose={onDismiss}>
        <Typography variant="body2">
          Kept what you were typing. {sourceLabel(state.handoff)} — that question is still in Plan
          My Week.
        </Typography>
        <Button size="small" onClick={onReplace} sx={{ mt: 0.5, px: 0 }}>
          Use the planner&apos;s question instead
        </Button>
      </Alert>,
    )
  }

  return wrap(
    <Alert severity="info" onClose={onDismiss}>
      <Typography variant="body2">{sourceLabel(state.handoff)}.</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Your question is in the box below, unsent, with that context on the line above it — both go
        to Ask AI when you send. Nothing has been sent or changed.
      </Typography>
      {state.setAside && (
        <Button size="small" onClick={onRestoreSetAside} sx={{ mt: 0.5, px: 0 }}>
          Bring my own draft back{attachmentNote(state.setAside)}
        </Button>
      )}
    </Alert>,
  )
}
