import { useCallback, useMemo, useState } from 'react'
import { doc } from 'firebase/firestore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import ChildSelector from '../../components/ChildSelector'
import SectionCard from '../../components/SectionCard'
import { LoadingState } from '../../components/states'
import { FOUNDATION_NODE_MAP } from '../../core/foundations'
import { useFamilyId } from '../../core/auth/useAuth'
import { learnerModelsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useLearnerModel } from '../../core/hooks/useLearnerModel'
import { useProfile } from '../../core/profile/useProfile'
import type {
  ConceptStateKind,
  LearnerModel,
} from '../../core/types/learnerModel'
import ReviewActionConfirmCard from '../foundations-review/ReviewActionConfirmCard'
import type {
  FoundationsReviewAction,
  ReviewProposedState,
} from '../foundations-review/foundationsReviewActions'
import { applyAndWriteReviewAction } from '../foundations-review/writeReviewAction'
import DispositionProfile from './DispositionProfile'
import {
  buildOverrideAction,
  buildReconcileView,
  KEEP_MY_WORD_NOTE,
  PARENT_STATE_CHOICES,
  proposableState,
  RECONCILE_CHIP_TITLE,
  RECONCILE_NOTICE,
  stateChoiceLabel,
  TAKE_MODEL_READ_NOTE,
} from './conceptOverride'
import {
  computeFocusConfirmations,
  computeMovedFeed,
  countByState,
  evidenceSourceLine,
  groupTerrainByDomain,
  scrubDisplayJargon,
  STATE_LABEL,
  STATE_META,
  type TerrainConcept,
} from './foundationsView'

const MODALITY_LABEL: Record<string, string> = {
  reading: 'Reading',
  writing: 'Writing',
  math: 'Math',
}

function stateColor(state: ConceptStateKind): string {
  return STATE_META.find((m) => m.state === state)?.color ?? 'text.primary'
}

/**
 * The Foundations tab (FEAT-65, Phase 3b) — the first-class parent home for the
 * Learner Model, graduating the `?diag=1` preview out from behind the flag.
 * Renders `synthesis.whatMattersNext`, the concept terrain, modality calibration,
 * the change-feed (with loop-confirmations, G3), routed open questions, and the
 * disposition narrative as a final section.
 *
 * **FEAT-66 makes it a write surface too** — but only for the one deliberate human
 * override the model already honours: tapping a concept lets the parent record
 * what they have seen, which is written as an ordinary `attestation` through the
 * *same* projector + writer the Foundations Review Chat uses. Every write is
 * propose → confirm → write; nothing writes on a single tap. It also surfaces and
 * resolves FEAT-76's `needsReconcile` flag — a guided eval that disagreed with a
 * parent's word no longer sits invisible in the data.
 *
 * Everything else stays read-only, and the terrain redraws from the
 * `useLearnerModel` snapshot after a write — never from local optimistic state.
 *
 * Every string passes the §14 display rules: no band numbers, no working-level
 * numbers, no percentages — four-state vocabulary only. Evidence renders via
 * plain-language source labels, never the seeded jargon notes.
 */
export default function FoundationsTab() {
  const familyId = useFamilyId()
  // `/progress` is NOT behind `RequireParent` — a kid profile can navigate to it
  // directly, and their own `activeChildId` is populated. So the override is gated
  // on the same **capability** the route guard uses (`canEdit`), never on a name
  // (ARCH-41/42/43): kids may read the terrain, they may not attest.
  const { canEdit } = useProfile()
  const { activeChild, activeChildId, children, setActiveChildId, isLoading } =
    useActiveChild()
  const { model, loading } = useLearnerModel(familyId, activeChildId)
  const [openConcept, setOpenConcept] = useState<TerrainConcept | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState<string | null>(null)

  const childName = activeChild?.name ?? 'this child'

  /**
   * Write one confirmed override. The only write on this tab, and it reaches
   * Firestore exclusively through the shared `writeReviewAction` merge — no second
   * write path, no `skillSnapshots` touch, `learnerModels` only.
   */
  const handleConfirmOverride = useCallback(
    async (action: FoundationsReviewAction) => {
      if (saving) return
      if (!canEdit) {
        // Belt-and-braces: the controls are hidden for non-parent profiles, and
        // the writer refuses one anyway.
        console.warn('[foundations] rejected override — not a parent profile')
        return
      }
      if (!familyId || !activeChildId || !model) {
        setSaveError('Could not save that — try again.')
        return
      }
      if (action.childId !== activeChildId) {
        // Same guard the Review-Chat writer keeps: never write one child's word
        // onto another's model.
        console.warn('[foundations] rejected override — child mismatch', action)
        setSaveError('Could not save that — try again.')
        return
      }
      const concept = openConcept
      setSaving(true)
      setSaveError(null)
      try {
        await applyAndWriteReviewAction(
          doc(learnerModelsCollection(familyId), activeChildId),
          model,
          action,
          new Date().toISOString(),
        )
        if (action.kind === 'attest') {
          const kidName =
            FOUNDATION_NODE_MAP[action.conceptId]?.kidName ?? concept?.kidName ?? ''
          setSavedNotice(
            `Recorded — ${stateChoiceLabel(action.state, childName)}: “${kidName}”`,
          )
        }
        setOpenConcept(null)
      } catch (err) {
        console.error('[foundations] failed to write learner model:', err)
        // Leave the drawer open with the staged proposal intact — nothing partial
        // was written, and the parent can retry without re-choosing.
        setSaveError('Could not save that — try again.')
      } finally {
        setSaving(false)
      }
    },
    [saving, canEdit, familyId, activeChildId, model, openConcept, childName],
  )

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <ChildSelector
        children={children}
        selectedChildId={activeChildId}
        onSelect={setActiveChildId}
        isLoading={isLoading}
        emptyMessage="Add a child to see their foundations."
      />

      {savedNotice && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSavedNotice(null)}>
          {savedNotice}
        </Alert>
      )}

      {loading && <LoadingState label="Loading foundations…" />}

      {!loading && (!model || model.status === 'no-data') && (
        <EmptyFoundations childName={childName} />
      )}

      {!loading && model && model.status !== 'no-data' && (
        <FoundationsBody
          model={model}
          childName={childName}
          onOpenConcept={setOpenConcept}
        />
      )}

      {/* Dispositions — self-contained section (pulls its own active child, so it
          tracks the same selection through shared profile state). §6.1 item 6. */}
      <Box sx={{ mt: 3 }}>
        <DispositionProfile />
      </Box>

      <ConceptEvidenceDrawer
        concept={openConcept}
        childId={activeChildId}
        canOverride={canEdit}
        childName={childName}
        onClose={() => setOpenConcept(null)}
        onConfirm={handleConfirmOverride}
        saving={saving}
        error={saveError}
      />
    </Container>
  )
}

function EmptyFoundations({ childName }: { childName: string }) {
  return (
    <Alert severity="info" sx={{ mt: 2 }}>
      Getting to know how {childName} learns. Do a Knowledge Mine round or a
      Foundations review to start filling this in — it grows as you capture
      evidence.
    </Alert>
  )
}

function FoundationsBody({
  model,
  childName,
  onOpenConcept,
}: {
  model: LearnerModel
  childName: string
  onOpenConcept: (c: TerrainConcept) => void
}) {
  const moves = useMemo(
    () => model.synthesis?.whatMattersNext ?? [],
    [model.synthesis?.whatMattersNext],
  )
  const narrative = model.synthesis?.narrative
  const openSummary = model.synthesis?.openQuestionsSummary ?? []
  const terrain = useMemo(() => groupTerrainByDomain(model), [model])
  const counts = useMemo(() => countByState(model), [model])
  const confirmations = useMemo(
    () => computeFocusConfirmations(model.changeFeed, moves),
    [model.changeFeed, moves],
  )
  // The plain "moved" list excludes → solid graduations — those render above as
  // the celebratory loop-confirmation cards, so listing them twice is noise.
  const moved = useMemo(
    () =>
      computeMovedFeed(model.changeFeed).filter(
        (m) => m.toLabel !== STATE_LABEL.solid,
      ),
    [model.changeFeed],
  )
  const questAsks = model.openQuestions.filter((q) => q.routedTo === 'quest')

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      {/* 1 — This week's foundation focus (whatMattersNext[0]). */}
      <SectionCard title="This week's foundation focus">
        {moves.length > 0 ? (
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {moves[0].kidName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {scrubDisplayJargon(moves[0].why)}
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Getting to know how {childName} learns — do a Knowledge Mine round or
            a Foundations review to fill this in.
          </Typography>
        )}
      </SectionCard>

      {/* 2 — The terrain. */}
      <SectionCard title="The terrain">
        {narrative && (
          <Typography
            variant="body2"
            sx={{ mb: 1.5, fontStyle: 'italic' }}
            color="text.secondary"
          >
            {scrubDisplayJargon(narrative)}
          </Typography>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
          {STATE_META.map((m) => (
            <Chip
              key={m.state}
              size="small"
              variant="outlined"
              label={`${m.label}: ${counts[m.state]}`}
              sx={{ color: m.color, fontWeight: 700 }}
            />
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Tap any concept to see the evidence behind it. Frontier is the good
          place to be — it's the edge you're working at.
        </Typography>
        {terrain.map((d) => (
          <Box key={d.domain} sx={{ mb: 1.5 }}>
            <Typography variant="overline" sx={{ fontWeight: 700 }}>
              {d.label}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
              {d.concepts.map((c) => (
                <Chip
                  key={c.conceptId}
                  label={c.kidName}
                  onClick={() => onOpenConcept(c)}
                  // A standing eval-vs-parent disagreement (FEAT-76) gets a quiet
                  // marker — never a colour change or a warning: the attested state
                  // is still in force, there is just a new take to look at.
                  icon={
                    c.entry.needsReconcile ? (
                      <InfoOutlinedIcon fontSize="small" />
                    ) : undefined
                  }
                  title={c.entry.needsReconcile ? RECONCILE_CHIP_TITLE : undefined}
                  sx={{
                    borderColor: stateColor(c.entry.state),
                    color: stateColor(c.entry.state),
                    fontWeight: 600,
                    '& .MuiChip-icon': { color: 'inherit' },
                  }}
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        ))}
      </SectionCard>

      {/* 3 — What matters next (full 1–3 moves). */}
      {moves.length > 0 && (
        <SectionCard title="What matters next">
          <List dense disablePadding>
            {moves.map((m, i) => (
              <ListItem key={`${m.conceptId}_${i}`} disableGutters alignItems="flex-start">
                <ListItemText
                  primary={m.kidName}
                  secondary={scrubDisplayJargon(m.why)}
                  slotProps={{
                    primary: { variant: 'body2', fontWeight: 700 },
                    secondary: { variant: 'body2' },
                  }}
                />
              </ListItem>
            ))}
          </List>
        </SectionCard>
      )}

      {/* 4 — How {child} learns best (modality calibration, plain language). */}
      <SectionCard title={`How ${childName} learns best`}>
        <List dense disablePadding>
          {(['reading', 'writing', 'math'] as const).map((key) => {
            const note = model.modalityCalibration?.[key]?.note
            if (!note) return null
            return (
              <ListItem key={key} disableGutters alignItems="flex-start">
                <ListItemText
                  primary={MODALITY_LABEL[key]}
                  secondary={scrubDisplayJargon(note)}
                  slotProps={{
                    primary: { variant: 'body2', fontWeight: 700 },
                    secondary: { variant: 'body2' },
                  }}
                />
              </ListItem>
            )
          })}
        </List>
      </SectionCard>

      {/* 5 — What moved, incl. loop-confirmation (G3). */}
      {(confirmations.length > 0 || moved.length > 0) && (
        <SectionCard title="What moved">
          {confirmations.map((c, i) => (
            <Alert
              key={`conf_${c.conceptId}_${i}`}
              severity="success"
              icon={false}
              sx={{ mb: 1, py: 0.5 }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {c.wasFocus ? 'Last focus was ' : ''}
                {c.kidName} — it moved to solid ✓
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {c.at.slice(0, 10)}
              </Typography>
            </Alert>
          ))}
          {moved.length > 0 && (
            <List dense disablePadding>
              {moved.map((m, i) => (
                <ListItem key={`moved_${m.conceptId}_${i}`} disableGutters>
                  <ListItemText
                    primary={m.line}
                    secondary={m.at.slice(0, 10)}
                    slotProps={{
                      primary: { variant: 'body2' },
                      secondary: { variant: 'caption' },
                    }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </SectionCard>
      )}

      {/* 6 — Questions we're exploring (routed kid-facing checks). */}
      {(questAsks.length > 0 || openSummary.length > 0) && (
        <SectionCard title="Questions we're exploring">
          {openSummary.map((q, i) => (
            <Typography key={`sum_${i}`} variant="body2" sx={{ mb: 0.5 }}>
              {scrubDisplayJargon(q)}
            </Typography>
          ))}
          {questAsks.length > 0 && (
            <List dense disablePadding sx={{ mt: openSummary.length ? 1 : 0 }}>
              {questAsks.map((q, i) => {
                const tested = Boolean(q.resolvedAt)
                return (
                  <ListItem
                    key={`${q.conceptId}_${i}`}
                    disableGutters
                    secondaryAction={
                      <Chip
                        size="small"
                        variant="outlined"
                        color={tested ? 'success' : 'default'}
                        label={
                          tested ? `tested ✓ ${q.resolvedAt?.slice(0, 10)}` : 'waiting'
                        }
                      />
                    }
                  >
                    <ListItemText
                      primary={FOUNDATION_NODE_MAP[q.conceptId]?.kidName ?? q.conceptId}
                      slotProps={{ primary: { variant: 'body2' } }}
                    />
                  </ListItem>
                )
              })}
            </List>
          )}
        </SectionCard>
      )}
    </Stack>
  )
}

function ConceptEvidenceDrawer({
  concept,
  childId,
  canOverride,
  childName,
  onClose,
  onConfirm,
  saving,
  error,
}: {
  concept: TerrainConcept | null
  childId: string | undefined
  /** Parent capability — gates the override section and the confirm card. */
  canOverride: boolean
  childName: string
  onClose: () => void
  onConfirm: (action: FoundationsReviewAction) => void
  saving: boolean
  error: string | null
}) {
  return (
    <Drawer anchor="bottom" open={Boolean(concept)} onClose={onClose}>
      {/* Mounted only while open, so the staged proposal + note reset every time
          the drawer opens — a parent never lands on someone else's staging. */}
      {concept && (
        <ConceptDrawerBody
          concept={concept}
          childId={childId}
          canOverride={canOverride && Boolean(childId)}
          childName={childName}
          onConfirm={onConfirm}
          saving={saving}
          error={error}
        />
      )}
    </Drawer>
  )
}

/**
 * The drawer's contents: the read-only evidence trail (FEAT-65), the reconcile
 * affordance when a guided eval disagreed with a parent attestation (FEAT-66 B),
 * and the parent override (FEAT-66 A).
 *
 * Nothing here writes. Choosing a state **stages** a proposal and renders the same
 * `ReviewActionConfirmCard` the Review Chat uses — the write happens only on the
 * card's Confirm tap, in the parent component.
 */
function ConceptDrawerBody({
  concept,
  childId,
  canOverride,
  childName,
  onConfirm,
  saving,
  error,
}: {
  concept: TerrainConcept
  childId: string | undefined
  /** Parent capability (never a child's name) — kids see the evidence, not the write. */
  canOverride: boolean
  childName: string
  onConfirm: (action: FoundationsReviewAction) => void
  saving: boolean
  error: string | null
}) {
  const [note, setNote] = useState('')
  /**
   * What the parent has *selected*, not what will be written. The action itself is
   * derived below, so editing the note after picking a state can never leave a
   * stale note baked into the staged proposal.
   */
  const [selection, setSelection] = useState<
    | { route: 'override'; state: ReviewProposedState }
    | { route: 'reconcileKeep' | 'reconcileTake'; state: ReviewProposedState }
    | null
  >(null)

  const reconcile = useMemo(
    () => buildReconcileView(concept.entry, childName),
    [concept.entry, childName],
  )
  /**
   * "Keep my word" re-attests **the state the parent actually attested** — read off
   * the attestation ref, not off `entry.state`, which a later derived writer (a
   * quest upgrade, a coverage claim) may have moved while the disagreement stood.
   */
  const keepState = reconcile
    ? proposableState(reconcile.yourState)
    : proposableState(concept.entry.state)
  const evalState = reconcile?.evalState

  /** The single staged proposal, derived from the live selection + note. */
  const staged = useMemo<FoundationsReviewAction | null>(() => {
    if (!selection || !childId || !canOverride) return null
    return buildOverrideAction({
      childId,
      conceptId: concept.conceptId,
      state: selection.state,
      note:
        selection.route === 'override'
          ? note
          : selection.route === 'reconcileKeep'
            ? KEEP_MY_WORD_NOTE
            : TAKE_MODEL_READ_NOTE,
      origin: selection.route === 'override' ? 'foundationsTab' : selection.route,
    })
  }, [selection, childId, canOverride, concept.conceptId, note])

  const choice = selection?.route === 'override' ? selection.state : null

  return (
    <Box sx={{ p: 2, maxWidth: 640, mx: 'auto', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {concept.kidName}
        </Typography>
        <Chip
          size="small"
          label={STATE_LABEL[concept.entry.state]}
          sx={{ color: stateColor(concept.entry.state), fontWeight: 700 }}
          variant="outlined"
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {concept.parentDescription}
      </Typography>

      {/* B — the FEAT-76 `needsReconcile` flag, surfaced. Both reads, side by side,
          then two confirm-gated ways out. Non-destructive: doing nothing leaves the
          parent's word exactly where it is. */}
      {reconcile && (
        <Alert severity="info" icon={false} sx={{ mb: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
            {RECONCILE_NOTICE}
          </Typography>
          <Typography variant="body2">{reconcile.yours.line}</Typography>
          {reconcile.yours.detail && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {reconcile.yours.detail}
            </Typography>
          )}
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {reconcile.theirs.line}
          </Typography>
          {reconcile.theirs.detail && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {reconcile.theirs.detail}
            </Typography>
          )}
          {canOverride && (
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
              {keepState && (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={saving}
                  onClick={() => setSelection({ route: 'reconcileKeep', state: keepState })}
                  sx={{ textTransform: 'none' }}
                >
                  Keep my word
                </Button>
              )}
              {evalState && (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={saving}
                  onClick={() => setSelection({ route: 'reconcileTake', state: evalState })}
                  sx={{ textTransform: 'none' }}
                >
                  Take the model’s read
                </Button>
              )}
            </Stack>
          )}
        </Alert>
      )}

      <Divider sx={{ mb: 1 }} />
      <Typography variant="overline" sx={{ fontWeight: 700 }}>
        Evidence
      </Typography>
      {concept.entry.evidence.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No evidence captured yet.
        </Typography>
      ) : (
        <List dense disablePadding>
          {concept.entry.evidence.map((ref, i) => (
            <ListItem key={i} disableGutters>
              <ListItemText
                primary={evidenceSourceLine(ref)}
                slotProps={{ primary: { variant: 'body2' } }}
              />
            </ListItem>
          ))}
        </List>
      )}

      {/* A — the parent override. Your word is the strongest evidence the model
          has; this is where you give it. */}
      {canOverride && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="overline" sx={{ fontWeight: 700 }}>
            Record what you’ve seen
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            What you’ve watched {childName} do counts more than anything the engine
            works out on its own — pick what fits and it sticks.
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="What did you see? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            sx={{ mb: 1 }}
          />
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {PARENT_STATE_CHOICES.map((state) => (
              <Button
                key={state}
                size="small"
                variant={choice === state ? 'contained' : 'outlined'}
                disabled={saving}
                onClick={() => setSelection({ route: 'override', state })}
                sx={{ textTransform: 'none' }}
              >
                {stateChoiceLabel(state, childName)}
              </Button>
            ))}
          </Stack>
        </>
      )}

      {/* Propose → confirm → write. The same card the Review Chat confirms with,
          so the preview wording and the §14 rails have exactly one definition. */}
      {staged && (
        <Box sx={{ mt: 1.5 }}>
          <ReviewActionConfirmCard
            pending={[{ id: 'override', action: staged, status: 'pending' }]}
            childName={childName}
            onConfirm={onConfirm}
            onDismiss={() => setSelection(null)}
            onConfirmAll={() => onConfirm(staged)}
          />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  )
}
