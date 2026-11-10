import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

import ActiveChildLine from '../../components/ActiveChildLine'
import SectionCard from '../../components/SectionCard'
import { LoadingState } from '../../components/states'
import {
  completionReviewSupported,
  FOUNDATION_NODE_MAP,
} from '../../core/foundations'
import { useFamilyId } from '../../core/auth/useAuth'
import { learnerModelsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useLearnerModel } from '../../core/hooks/useLearnerModel'
import { useProfile } from '../../core/profile/useProfile'
import type { UserProfile } from '../../core/types/enums'
import type {
  ConceptStateKind,
  LearnerModel,
} from '../../core/types/learnerModel'
import DataReviewExportPanel from '../records/DataReviewExportPanel'
import FoundationsReviewLauncher from '../foundations-review/FoundationsReviewLauncher'
import ReviewActionConfirmCard from '../foundations-review/ReviewActionConfirmCard'
import type {
  FoundationsReviewAction,
  ReviewProposedState,
} from '../foundations-review/foundationsReviewActions'
import { applyAndWriteReviewAction } from '../foundations-review/writeReviewAction'
import DispositionProfile from './DispositionProfile'
import FoundationsDiagPanel from './FoundationsDiagPanel'
import {
  BOOTSTRAP_FAILED_LINE,
  REPROJECTION_FAILED_LINE,
  BOOTSTRAP_RETRY_LABEL,
  bootstrapRunningLine,
  emptyFoundationsLines,
} from './foundationsBootstrap'
import { useFoundationsBootstrap } from './useFoundationsBootstrap'
import {
  buildReconcileView,
  COMPLETION_REVIEW_NOTICE,
  COMPLETION_REVIEW_SUPPORTED_NOTICE,
  conceptDecisionBasis,
  DECISION_STALE_NOTICE,
  PARENT_STATE_CHOICES,
  proposableState,
  RECONCILE_CHIP_TITLE,
  RECONCILE_NOTICE,
  ReviewActionBasisError,
  sameConceptDecisionBasis,
  SAVE_RETRY_LINE,
  SCOPE_LOST_NOTICE,
  stagedDecisionAction,
  stateChoiceLabel,
  type DecisionRoute,
  type StagedDecision,
} from './conceptOverride'
import {
  computeFocusConfirmations,
  computeMovedFeed,
  countByState,
  evidenceSourceLine,
  groupTerrainByDomain,
  scrubDisplayJargon,
  selectTerrainConcept,
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
 * What ONE opening of the concept drawer is bound to — captured on the tap and
 * never re-read from the page afterwards (CLAUDE.md › *a global control that
 * changes a scoped identity obliges every mounted editor to decide what the
 * change means*). The drawer held a whole concept snapshot before, so a child
 * switch left the old concept on screen while the write addressed the new child.
 *
 * The concept itself is **not** here: it is re-resolved from the live model on
 * every render, so the evidence is current and a concept that goes away closes
 * the drawer.
 */
interface DrawerScope {
  /** Monotonic per opening. Every outcome is keyed to it. */
  lifetimeId: number
  familyId: string
  childId: string
  /** The name as it read at open, so a receipt names the child it was for. */
  childName: string
  /** The profile that opened it, and the capability it actually had. */
  profile: UserProfile | null
  canEdit: boolean
  conceptId: string
}

/** A refusal signal for one lifetime: clear its staged confirmation. */
interface StaleSignal {
  lifetimeId: number
  token: number
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
  // Both halves, not the capability alone: a profile change is a scope change
  // even when `canEdit` happens to read the same for the new one.
  const { canEdit, profile } = useProfile()
  // UX-425: this page no longer chooses or adds a child — it reads the active
  // one. The shell's chip is the one control that changes it.
  const { activeChild, activeChildId } = useActiveChild()
  const { model, loading } = useLearnerModel(familyId, activeChildId)
  // UX-286 — the model's ONE non-diagnostic door into existence. Create-only:
  // it fires when the snapshot has resolved and the document is absent, once per
  // child, for a profile that may write. Writes `learnerModels` only.
  const {
    bootstrapping,
    failed: bootstrapFailed,
    reprojectFailed,
    retry: retryBootstrap,
  } = useFoundationsBootstrap({ familyId, childId: activeChildId, canEdit, model, loading })
  const [scope, setScope] = useState<DrawerScope | null>(null)
  /** The next lifetime id. A ref, so two taps in one tick cannot share one. */
  const lifetimeRef = useRef(0)
  /**
   * The lifetime of the **committed** open, still-valid drawer (0 when none),
   * so an `await` that resolves later can ask whether its own opening is still
   * the live one. Written only after a commit (the layout effect below) or by
   * the close handler, which invalidates immediately. Never during render: an
   * interrupted render could otherwise zero it without the scope change ever
   * committing, and silence a live save's feedback.
   */
  const openLifetimeRef = useRef(0)
  /** The lifetimes with a save in flight — per-lifetime, so one tap writes once. */
  const inFlightRef = useRef<Set<number>>(new Set())
  /** Which lifetime, if any, has a save in flight / an error. */
  const [savingLifetime, setSavingLifetime] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<{ lifetimeId: number; text: string } | null>(
    null,
  )
  const [staleSignal, setStaleSignal] = useState<StaleSignal>({ lifetimeId: 0, token: 0 })
  /** The receipt for the lifetime that wrote, cleared by any scope change. */
  const [savedNotice, setSavedNotice] = useState<string | null>(null)
  /** The generic loss line — no evidence, no note, nothing of the concept. */
  const [lostNotice, setLostNotice] = useState<string | null>(null)

  const childName = activeChild?.name ?? 'this child'

  /**
   * The open concept, resolved from the LIVE model in the scope it was opened
   * under. Null the moment any part of that scope stops holding: a committed
   * family, child, profile or capability change, an unsettled or absent model,
   * a model for another child, or a concept the model no longer carries.
   *
   * Null for any reason is the same answer — nothing to show, so nothing is
   * editable. Telling a failed read apart from an absent model is a separate
   * follow-up and would not change it.
   */
  const scopedConcept = useMemo<TerrainConcept | null>(() => {
    if (!scope) return null
    if (
      scope.familyId !== familyId ||
      scope.childId !== activeChildId ||
      scope.profile !== profile ||
      scope.canEdit !== canEdit
    ) {
      return null
    }
    if (loading || !model || model.status === 'no-data') return null
    if (model.childId !== scope.childId) return null
    return selectTerrainConcept(model, scope.conceptId)
  }, [scope, familyId, activeChildId, profile, canEdit, loading, model])

  /**
   * Drop an invalid scope **during render** — the pattern `useLearnerModel`
   * uses for a key change. An effect would leave the drawer one commit behind,
   * and an identity that came back before it ran would reopen the old staging.
   */
  if (scope && !scopedConcept) {
    setScope(null)
    setSaveError(null)
    setSavedNotice(null)
    setLostNotice(SCOPE_LOST_NOTICE)
  }

  /**
   * The committed truth of which opening is live, derived from the effective
   * scope and the concept it resolved to — the same two values every render
   * decides the drawer from. It runs after the commit that changed them, so no
   * abandoned render can move it, and the cleanup clears it on unmount.
   */
  useLayoutEffect(() => {
    openLifetimeRef.current = scope && scopedConcept ? scope.lifetimeId : 0
    return () => {
      openLifetimeRef.current = 0
    }
  }, [scope, scopedConcept])

  /**
   * A receipt belongs to the scope it was written in, so a committed change of
   * family, child, profile or capability clears it even with nothing open.
   */
  const scopeKey = `${familyId ?? ''}|${activeChildId ?? ''}|${profile ?? ''}|${canEdit}`
  const [lastScopeKey, setLastScopeKey] = useState(scopeKey)
  if (lastScopeKey !== scopeKey) {
    setLastScopeKey(scopeKey)
    setSavedNotice(null)
    setSaveError(null)
  }

  /**
   * Write one confirmed override. The only write on this tab, and it reaches
   * Firestore exclusively through the shared `writeReviewAction` merge — no second
   * write path, no `skillSnapshots` touch, `learnerModels` only.
   *
   * Everything it checks comes from the captured scope and the staged decision,
   * never from what the page happens to show now: the destination, the child on
   * the action, the concept, and the evidence the decision described.
   */
  const handleConfirmDecision = useCallback(
    async (decision: StagedDecision, action: FoundationsReviewAction) => {
      const lifetimeId = decision.lifetimeId
      // Per-lifetime, so a pending save in a closed drawer cannot disable a new
      // one's Confirm, and two taps in one tick still write once.
      if (inFlightRef.current.has(lifetimeId)) return
      // Refuse before any work unless this tap belongs to the drawer that is
      // committed and valid right now — the same ref its own outcome is judged
      // against, so a save can never start under a lifetime that cannot report.
      if (openLifetimeRef.current !== lifetimeId) return
      if (!scope || scope.lifetimeId !== lifetimeId || !scopedConcept) return
      if (!canEdit || !scope.canEdit || scope.profile !== profile) {
        // Belt-and-braces: the controls are hidden for non-parent profiles, and
        // the writer refuses one anyway.
        console.warn('[foundations] rejected override — not a parent profile')
        return
      }
      if (
        !familyId ||
        !activeChildId ||
        !model ||
        scope.familyId !== familyId ||
        scope.childId !== activeChildId ||
        model.childId !== scope.childId
      ) {
        return
      }
      if (
        action.childId !== scope.childId ||
        action.conceptId !== scope.conceptId ||
        decision.childId !== scope.childId ||
        decision.conceptId !== scope.conceptId
      ) {
        // Same guard the Review-Chat writer keeps, widened to the concept: never
        // write one child's word onto another's model, or onto another concept.
        console.warn('[foundations] rejected override — scope mismatch', action)
        return
      }
      // Validated at Confirm as well as at render: the staged intent must still
      // describe the evidence in front of the parent.
      if (
        !sameConceptDecisionBasis(conceptDecisionBasis(scopedConcept.entry), decision.basis)
      ) {
        setStaleSignal((s) => ({ lifetimeId, token: s.token + 1 }))
        return
      }
      inFlightRef.current.add(lifetimeId)
      setSavingLifetime(lifetimeId)
      setSaveError(null)
      // The destination is the one captured at open, so a switch landing while
      // this is in flight cannot re-address a save that has started.
      const destination = doc(learnerModelsCollection(scope.familyId), scope.childId)
      const forChildName = scope.childName
      const kidName =
        FOUNDATION_NODE_MAP[action.conceptId]?.kidName ?? scopedConcept.kidName
      try {
        await applyAndWriteReviewAction(destination, model, action, new Date().toISOString(), {
          childId: scope.childId,
          conceptId: scope.conceptId,
          basis: decision.basis,
        })
        // Outcomes are for the opening that asked. If that opening is no longer
        // the live one — closed, switched away from, or an A → B → A return —
        // this says nothing at all rather than stamping a later drawer.
        if (openLifetimeRef.current !== lifetimeId) return
        if (action.kind === 'attest') {
          setSavedNotice(
            `Recorded — ${stateChoiceLabel(action.state, forChildName)}: “${kidName}”`,
          )
        }
        openLifetimeRef.current = 0
        setScope(null)
      } catch (err) {
        console.error('[foundations] could not write learner model:', err)
        if (openLifetimeRef.current !== lifetimeId) return
        // A basis refusal is not retryable — the same tap would be refused the
        // same way — so the confirmation is cleared and the parent is asked to
        // look again. An ordinary error keeps the proposal: retry is one tap.
        if (err instanceof ReviewActionBasisError) {
          setStaleSignal((s) => ({ lifetimeId, token: s.token + 1 }))
        } else {
          setSaveError({ lifetimeId, text: SAVE_RETRY_LINE })
        }
      } finally {
        inFlightRef.current.delete(lifetimeId)
        // Only this lifetime's guard — an old completion must not clear a newer
        // drawer's in-flight state.
        setSavingLifetime((l) => (l === lifetimeId ? null : l))
      }
    },
    [scope, scopedConcept, canEdit, profile, familyId, activeChildId, model],
  )

  /** Open the drawer for one concept, capturing the scope it was tapped in. */
  const handleOpenConcept = useCallback(
    (concept: TerrainConcept) => {
      // A settled model for this very child, or there is nothing to open on.
      if (!familyId || !activeChildId || loading || !model) return
      if (model.childId !== activeChildId) return
      lifetimeRef.current += 1
      // No write here: the layout effect commits this opening's lifetime once
      // the scope it captured has actually rendered and still resolves.
      setScope({
        lifetimeId: lifetimeRef.current,
        familyId,
        childId: activeChildId,
        childName,
        profile,
        canEdit,
        conceptId: concept.conceptId,
      })
      setSaveError(null)
      setSavedNotice(null)
      setLostNotice(null)
    },
    [familyId, activeChildId, childName, profile, canEdit, loading, model],
  )

  /** The parent closed it. Nothing is lost that was not theirs to close. */
  const handleCloseDrawer = useCallback(() => {
    openLifetimeRef.current = 0
    setScope(null)
  }, [])

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      {/* UX-425 / UX-426: the selector is gone — the shell's chip is the one
          place a parent chooses the child. This tab's first control is the
          Foundations Review launcher, which opens a conversation that writes
          `learnerModels` for one boy, and the tab's own headings name him only
          further down. So the sentence stays where the control was. */}
      <ActiveChildLine hint />

      {/* Foundations Review Chat (FEAT-51, slice 2a) — a ~10-minute parent
          conversation that establishes where each child really is, and the
          primary way the Learner Model gets fed. UX-326 moved it here, below
          this tab's child selector: it feeds the model, and this tab is what
          shows the model. It rendered in the ProgressPage shell before, above
          every tab and above every selector on the page. Same component, same
          props, same gating — only its home changed. */}
      <Box sx={{ mt: 2 }}>
        <FoundationsReviewLauncher />
      </Box>

      {savedNotice && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSavedNotice(null)}>
          {savedNotice}
        </Alert>
      )}

      {/* The drawer's scope went away under it. Generic by construction: no
          evidence line, no note, nothing about the concept it was for. */}
      {lostNotice && (
        <Alert severity="info" sx={{ mt: 2 }} onClose={() => setLostNotice(null)}>
          {lostNotice}
        </Alert>
      )}

      {loading && <LoadingState label="Loading foundations…" />}

      {!loading && bootstrapping && (
        <LoadingState label={bootstrapRunningLine(childName)} />
      )}

      {!loading && !bootstrapping && bootstrapFailed && (
        <Alert
          severity="warning"
          sx={{ mt: 2 }}
          action={
            <Button color="inherit" size="small" onClick={retryBootstrap}>
              {BOOTSTRAP_RETRY_LABEL}
            </Button>
          }
        >
          {BOOTSTRAP_FAILED_LINE}
        </Alert>
      )}

      {/* A failed re-projection (UX-291) is a quiet notice BESIDE the terrain, not
          in place of it: the map below is real, it is just not refreshed from the
          latest working levels. Blanking a page of evidence to say so would cost
          more than the staleness it reports. */}
      {!loading && !bootstrapping && !bootstrapFailed && reprojectFailed && (
        <Alert
          severity="info"
          sx={{ mt: 2 }}
          action={
            <Button color="inherit" size="small" onClick={retryBootstrap}>
              {BOOTSTRAP_RETRY_LABEL}
            </Button>
          }
        >
          {REPROJECTION_FAILED_LINE}
        </Alert>
      )}

      {!loading && !bootstrapping && !bootstrapFailed &&
        (!model || model.status === 'no-data') && (
          <EmptyFoundations childName={childName} canEdit={canEdit} />
        )}

      {!loading && model && model.status !== 'no-data' && (
        <FoundationsBody
          model={model}
          childName={childName}
          onOpenConcept={handleOpenConcept}
        />
      )}

      {/* Dispositions — self-contained section (pulls its own active child, so it
          tracks the same selection through shared profile state). §6.1 item 6. */}
      <Box sx={{ mt: 3 }}>
        <DispositionProfile />
      </Box>

      {/* UX-326 — the two `?diag=1` panels, at the bottom of the tab whose data
          they diagnose. Both still gate themselves on `canEdit` FIRST and then
          on `?diag=1` (a surface flag, never access control), so nothing about
          who sees them changed; they simply no longer render above every one of
          the six tabs. They carry their own margins, so no wrapper here. */}
      <FoundationsDiagPanel />
      <DataReviewExportPanel />

      <ConceptEvidenceDrawer
        scope={scope}
        concept={scopedConcept}
        staleSignal={staleSignal}
        onClose={handleCloseDrawer}
        onConfirm={handleConfirmDecision}
        saving={scope !== null && savingLifetime === scope.lifetimeId}
        error={
          scope && saveError?.lifetimeId === scope.lifetimeId ? saveError.text : null
        }
      />
    </Container>
  )
}

/**
 * UX-287 — the empty state names a route that works. Copy (and the capability
 * split) is the pure `emptyFoundationsLines`; this only renders it.
 */
function EmptyFoundations({
  childName,
  canEdit,
}: {
  childName: string
  canEdit: boolean
}) {
  const lines = emptyFoundationsLines(childName, canEdit)
  return (
    <Alert severity="info" sx={{ mt: 2 }}>
      <Stack spacing={1}>
        {lines.map((line) => (
          <Typography key={line} variant="body2">
            {line}
          </Typography>
        ))}
      </Stack>
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
  scope,
  concept,
  staleSignal,
  onClose,
  onConfirm,
  saving,
  error,
}: {
  /** The opening this drawer belongs to, or null when nothing is open. */
  scope: DrawerScope | null
  /** The concept as the live model holds it, or null — which closes the drawer. */
  concept: TerrainConcept | null
  staleSignal: StaleSignal
  onClose: () => void
  onConfirm: (decision: StagedDecision, action: FoundationsReviewAction) => void
  saving: boolean
  error: string | null
}) {
  return (
    <Drawer anchor="bottom" open={Boolean(scope && concept)} onClose={onClose}>
      {/* Keyed on the lifetime, so one opening's note and staged choice can
          never be inherited by the next — including an A → B → A return, which
          is a new opening and starts empty. */}
      {scope && concept && (
        <ConceptDrawerBody
          key={scope.lifetimeId}
          scope={scope}
          concept={concept}
          staleSignal={staleSignal}
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
  scope,
  concept,
  staleSignal,
  onConfirm,
  saving,
  error,
}: {
  scope: DrawerScope
  concept: TerrainConcept
  staleSignal: StaleSignal
  onConfirm: (decision: StagedDecision, action: FoundationsReviewAction) => void
  saving: boolean
  error: string | null
}) {
  /** Parent capability (never a child's name) — kids see the evidence, not the write. */
  const canOverride = scope.canEdit
  /** The name captured at open, so every line in here is about one child. */
  const childName = scope.childName
  const [note, setNote] = useState('')
  /**
   * What the parent has *selected*, not what will be written: the route, the
   * state, the scope it was chosen in, and the evidence it describes. The action
   * is derived below, so editing the note after picking a state can never leave
   * a stale note baked into the staged proposal.
   */
  const [decision, setDecision] = useState<StagedDecision | null>(null)
  /** Shown once a staged choice has been dropped under the parent's feet. */
  const [reviewAgain, setReviewAgain] = useState(false)
  /** The refusal token this body has already acted on. */
  const [handledRefusal, setHandledRefusal] = useState(0)

  /** The evidence this drawer is showing, fingerprinted from the active refs. */
  const basis = useMemo(() => conceptDecisionBasis(concept.entry), [concept.entry])

  /**
   * Both of these drop the staged choice **during render** (the pattern
   * `useLearnerModel` uses) and drop it for good — a derived "is it stale?"
   * would let the evidence coming back revive a confirmation the parent has
   * already been told to re-make:
   *
   * 1. the evidence it described moved — a replacement eval, a withdrawn ref, a
   *    new attestation, a state change, a disagreement raised or settled;
   * 2. the writer refused it against the stored model.
   */
  if (decision && !sameConceptDecisionBasis(decision.basis, basis)) {
    setDecision(null)
    setReviewAgain(true)
  } else if (
    staleSignal.lifetimeId === scope.lifetimeId &&
    staleSignal.token !== handledRefusal
  ) {
    setHandledRefusal(staleSignal.token)
    setDecision(null)
    setReviewAgain(true)
  }

  const chooseDecision = useCallback(
    (route: DecisionRoute, state: ReviewProposedState) => {
      setReviewAgain(false)
      setDecision({
        lifetimeId: scope.lifetimeId,
        childId: scope.childId,
        conceptId: scope.conceptId,
        route,
        state,
        basis,
      })
    },
    [scope.lifetimeId, scope.childId, scope.conceptId, basis],
  )

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

  /** The single staged proposal, derived from the live decision + note. */
  const staged = useMemo<FoundationsReviewAction | null>(() => {
    if (!decision || !canOverride) return null
    return stagedDecisionAction(decision, note)
  }, [decision, canOverride, note])

  const choice = decision?.route === 'override' ? decision.state : null

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
                  onClick={() => chooseDecision('reconcileKeep', keepState)}
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
                  onClick={() => chooseDecision('reconcileTake', evalState)}
                  sx={{ textTransform: 'none' }}
                >
                  Take the model’s read
                </Button>
              )}
            </Stack>
          )}
        </Alert>
      )}

      {/* FEAT-242 — a confirmed program completion was withdrawn and nothing
          recorded what this concept rested on beforehand. The state is left
          exactly as it was (the record is not rewritten) and every advice
          surface reads it cautiously until a parent's word or an evaluation
          settles it, so the drawer says that plainly here. Deliberately NOT the
          eval-vs-parent reconcile notice above: nobody disagreed with anybody.
          Which of the two lines is true depends on whether anything live stands
          behind the reading: a claim that landed after the withdrawal can carry
          it at its stored state while the basis stays unsettled, and promising
          caution that is not happening would be the untrue half. */}
      {concept.entry.completionReviewNeeded && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          {completionReviewSupported(concept.entry)
            ? COMPLETION_REVIEW_SUPPORTED_NOTICE
            : COMPLETION_REVIEW_NOTICE}
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
                onClick={() => chooseDecision('override', state)}
                sx={{ textTransform: 'none' }}
              >
                {stateChoiceLabel(state, childName)}
              </Button>
            ))}
          </Stack>
        </>
      )}

      {/* The evidence the choice described has moved. Short, plain, and with
          nothing of the older read in it — the sections above already show what
          stands now. */}
      {reviewAgain && !decision && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          {DECISION_STALE_NOTICE}
        </Alert>
      )}

      {/* Propose → confirm → write. The same card the Review Chat confirms with,
          so the preview wording and the §14 rails have exactly one definition. */}
      {decision && staged && (
        <Box sx={{ mt: 1.5 }}>
          <ReviewActionConfirmCard
            pending={[{ id: 'override', action: staged, status: 'pending' }]}
            childName={childName}
            onConfirm={(action) => onConfirm(decision, action)}
            onDismiss={() => setDecision(null)}
            onConfirmAll={() => onConfirm(decision, staged)}
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
