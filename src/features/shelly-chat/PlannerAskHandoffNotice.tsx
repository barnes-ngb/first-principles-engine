import type { ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import {
  plannerAskContextLine,
  type PlannerAskHandoff,
  type PlannerAskHandoffRefusal,
} from '../planner-chat/plannerAskHandoff'
import type { ComposerDraft } from './composerCustody'
import type { PlannerAskHandoffState } from './usePlannerAskHandoff'

/**
 * What Ask AI says about a question handed over from the planner (UX-273).
 *
 * Three jobs: name the context that will travel with the question, never let a
 * draft be replaced or a saved conversation be joined without an explicit tap,
 * and when the question cannot be used, say so and name where it still is.
 * It renders no Send and writes nothing.
 *
 * Buttons stack on `xs` so two choices are reachable on a phone without
 * truncation, and every draft preview scrolls rather than clipping.
 */

/**
 * One sentence per reason a question was not used, or stopped being usable.
 *
 * A `Record` over the reason union, so a new reason **fails to compile** until
 * somebody decides what it says. Every line ends with something true she can act
 * on — the planner still holds her words — except the account change, which
 * names the account instead because her words are in the family she left.
 */
export const PLANNER_ASK_HANDOFF_REFUSAL_LINES: Record<PlannerAskHandoffRefusal, string> = {
  missing: "Your question didn't come across — it's still in Plan My Week.",
  mismatched: "Your question didn't come across — it's still in Plan My Week.",
  expired: "That was a while ago, so your question wasn't carried over — it's still in Plan My Week.",
  'family-changed': "A different account is signed in now, so your question wasn't carried over.",
  'child-changed':
    "The active child changed, so that question was set down here — it's still in Plan My Week.",
  'child-unresolved':
    "I couldn't tell which child this is for, so your question wasn't carried over — it's still in Plan My Week.",
  'child-unknown':
    "I don't recognise the child that question was about, so it wasn't carried over — it's still in Plan My Week.",
  'context-unmapped':
    "Ask AI has no conversation open for that child, so the question wasn't carried over — it's still in Plan My Week.",
  'context-changed':
    "You moved to another child's conversation, so that question was set down here — it's still in Plan My Week.",
  'thread-changed':
    "That question wasn't added to this conversation — it's still in Plan My Week.",
  unauthorized: "This profile can't carry a planner question across. It's still in Plan My Week.",
  'week-invalid':
    "I couldn't read which week that question was about, so it wasn't carried over — it's still in Plan My Week.",
  'week-passed':
    "That planning week has finished, so your question wasn't carried over — it's still in Plan My Week.",
  malformed: "Something went wrong carrying your question across — it's still in Plan My Week.",
}

interface PlannerAskHandoffNoticeProps {
  state: PlannerAskHandoffState
  onKeepExisting: () => void
  onReplace: () => void
  onRestoreSetAside: () => void
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
  const count = draft.attachments.length + (draft.referenceImage ? 1 : 0)
  if (count === 0) return ''
  return count === 1 ? ' (1 image attached)' : ` (${count} images attached)`
}

export default function PlannerAskHandoffNotice({
  state,
  onKeepExisting,
  onReplace,
  onRestoreSetAside,
  onStartFresh,
  onKeepConversation,
  onDismiss,
}: PlannerAskHandoffNoticeProps) {
  if (state.kind === 'idle') return null

  const wrap = (children: ReactNode) => <Box sx={{ px: 1.5, pt: 1 }}>{children}</Box>

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
