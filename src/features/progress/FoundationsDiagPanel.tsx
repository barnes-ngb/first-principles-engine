import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { app } from '../../core/firebase/firebase'
import { useChildren } from '../../core/hooks/useChildren'
import {
  activityConfigsCollection,
  childSkillMapsCollection,
  learnerModelsCollection,
  sightWordProgressCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import {
  foundationGraphs,
  FOUNDATION_NODE_MAP,
} from '../../core/foundations'
import { syncWorkbookPositionToModel } from '../../core/foundations/workbookPositionSync'
import type { WorkbookSyncOutcome } from '../../core/foundations/workbookPositionSync'
import type { ActivityConfig } from '../../core/types'
import {
  mergeSeededModel,
  seedLearnerModel,
} from '../../core/foundations/seedLearnerModel'
import type { ChildSkillMap } from '../../core/curriculum/skillStatus'
import type {
  ConceptStateEntry,
  ConceptStateKind,
  LearnerModel,
} from '../../core/types/learnerModel'
import type { LearnerSynthesis } from '../../core/types/learnerModel'
import type { SightWordProgress, SkillSnapshot } from '../../core/types'

const functions = getFunctions(app)
const synthesizeFn = httpsCallable<
  { familyId: string; childId: string },
  { success: boolean; status: string; synthesis?: LearnerSynthesis }
>(functions, 'generateLearnerSynthesisNow')

/** Display order + colors for the four state groups. */
const STATE_GROUPS: Array<{ state: ConceptStateKind; label: string; color: string }> = [
  { state: 'solid', label: 'Solid', color: 'success.main' },
  { state: 'forming', label: 'Forming', color: 'info.main' },
  { state: 'frontier', label: 'Frontier', color: 'warning.main' },
  { state: 'not-yet', label: 'Not yet', color: 'text.disabled' },
]

interface ChildState {
  loading: boolean
  synthesizing?: boolean
  syncingPositions?: boolean
  /** Per-workbook result lines from the last "Sync curriculum positions" run. */
  positionSyncLines?: string[] | null
  model: LearnerModel | null
  error: string | null
}

/** Turn one workbook's sync outcome into a human result line for the diag panel. */
function formatSyncOutcome(name: string, position: number, outcome: WorkbookSyncOutcome): string {
  switch (outcome.status) {
    case 'no-bridge':
      return `${name} (L${position}) → no bridge yet`
    case 'ambiguous':
      return `${name} (L${position}) → ambiguous — needs alias curation (${outcome.bridgeIds.join(', ')})`
    case 'pending-curation':
      return `${name} (L${position}) → bridge present, lesson→unit mapping pending curation`
    case 'no-model':
      return `${name} (L${position}) → seed the model first`
    case 'no-coverage':
      return `${name} (L${position}) → bridged, no new coverage at this position`
    case 'written': {
      const names = outcome.changedConceptIds
        .map((id) => FOUNDATION_NODE_MAP[id]?.kidName ?? id)
        .join(', ')
      return `${name} (L${position}) → forming: ${names}`
    }
    case 'error':
      return `${name} (L${position}) → error: ${outcome.message}`
  }
}

/**
 * Flag-gated ( `?diag=1` ) parent-only diagnostic for the Learner Model bootstrap
 * seeder (FEAT-48, slice 1). It seeds/re-seeds a child's `learnerModels/{childId}`
 * doc client-side and renders the stored states grouped solid/forming/frontier/
 * not-yet so the owner can verify seeding truth from a phone. The real Foundations
 * tab is slice 2; this exists only to prove the model.
 *
 * Reads `skillSnapshots` / `childSkillMaps` / `sightWordProgress`; writes **only**
 * `learnerModels` (merge). No LLM, no other collection touched.
 */
export default function FoundationsDiagPanel() {
  const [searchParams] = useSearchParams()
  const familyId = useFamilyId()
  const { children } = useChildren()
  const [byChild, setByChild] = useState<Record<string, ChildState>>({})

  // Load each child's EXISTING learner model on mount so the preview and the
  // "Generate synthesis (AI)" gate read the SAME `state.model` — they can't
  // disagree. Without this the model was only in state after a manual re-seed, so
  // the button stayed greyed even when a model document already existed. Reads
  // only `learnerModels`; the idempotent `already-loaded` guard keeps a re-seed /
  // sync from being clobbered by a late fetch.
  useEffect(() => {
    if (!familyId || children.length === 0) return
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        children.map(async (child) => {
          try {
            const ref = doc(learnerModelsCollection(familyId), child.id)
            const snap = await getDoc(ref)
            return [child.id, snap.exists() ? (snap.data() as LearnerModel) : null] as const
          } catch {
            return [child.id, null] as const
          }
        }),
      )
      if (cancelled) return
      setByChild((prev) => {
        const next = { ...prev }
        for (const [childId, model] of entries) {
          if (!model || next[childId]?.model) continue
          const existing = next[childId]
          next[childId] = existing
            ? { ...existing, model }
            : { loading: false, error: null, model }
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [familyId, children])

  const seedChild = useCallback(
    async (childId: string) => {
      setByChild((prev) => ({
        ...prev,
        [childId]: { loading: true, model: prev[childId]?.model ?? null, error: null },
      }))
      try {
        // Reads only — snapshot, skill map, sight words, existing model.
        const snapRef = doc(skillSnapshotsCollection(familyId), childId)
        const mapRef = doc(childSkillMapsCollection(familyId), childId)
        const modelRef = doc(learnerModelsCollection(familyId), childId)
        const [snapDoc, mapDoc, existingDoc, swSnap] = await Promise.all([
          getDoc(snapRef),
          getDoc(mapRef),
          getDoc(modelRef),
          getDocs(query(sightWordProgressCollection(familyId))),
        ])

        const snapshot: SkillSnapshot | null = snapDoc.exists()
          ? (snapDoc.data() as SkillSnapshot)
          : null
        const skillMap: ChildSkillMap | null = mapDoc.exists()
          ? (mapDoc.data() as ChildSkillMap)
          : null
        const sightWords: SightWordProgress[] = swSnap.docs
          .filter((d) => d.id.startsWith(`${childId}_`))
          .map((d) => d.data() as SightWordProgress)

        const fresh = seedLearnerModel(
          foundationGraphs,
          childId,
          snapshot,
          skillMap,
          sightWords,
        )
        const merged = mergeSeededModel(
          existingDoc.exists() ? (existingDoc.data() as LearnerModel) : null,
          fresh,
        )

        // Writes ONLY learnerModels (merge).
        await setDoc(modelRef, merged, { merge: true })
        setByChild((prev) => ({
          ...prev,
          [childId]: { loading: false, model: merged, error: null },
        }))
      } catch (err) {
        setByChild((prev) => ({
          ...prev,
          [childId]: {
            loading: false,
            model: prev[childId]?.model ?? null,
            error: err instanceof Error ? err.message : 'Seeding failed',
          },
        }))
      }
    },
    [familyId],
  )

  // Run the Sonnet synthesis beat (FEAT-57) for one child and fold the returned
  // judgment layer into the previewed model. Reads the stored model server-side;
  // writes only `learnerModels`.
  const synthesizeChild = useCallback(async (childId: string) => {
    setByChild((prev) => ({
      ...prev,
      [childId]: {
        loading: prev[childId]?.loading ?? false,
        synthesizing: true,
        model: prev[childId]?.model ?? null,
        error: null,
      },
    }))
    try {
      const res = await synthesizeFn({ familyId, childId })
      const synthesis = res.data.synthesis
      setByChild((prev) => {
        const model = prev[childId]?.model
        return {
          ...prev,
          [childId]: {
            loading: false,
            synthesizing: false,
            model: model && synthesis ? { ...model, synthesis, synthesisStaleAt: null } : model ?? null,
            error: synthesis ? null : `Synthesis returned no result (status: ${res.data.status}).`,
          },
        }
      })
    } catch (err) {
      setByChild((prev) => ({
        ...prev,
        [childId]: {
          loading: false,
          synthesizing: false,
          model: prev[childId]?.model ?? null,
          error: err instanceof Error ? err.message : 'Synthesis failed',
        },
      }))
    }
  }, [familyId])

  // FEAT-63: run the workbook-position → learner-model conversion for ALL of a
  // child's tracked workbooks at their current positions (the backfill for today's
  // L107/L110/L122/L90). Writes only `learnerModels` (merge); each workbook gets a
  // result line so bridged vs. no-bridge-yet vs. pending-curation is VISIBLE.
  const syncPositions = useCallback(
    async (childId: string) => {
      setByChild((prev) => ({
        ...prev,
        [childId]: {
          loading: prev[childId]?.loading ?? false,
          syncingPositions: true,
          positionSyncLines: prev[childId]?.positionSyncLines ?? null,
          model: prev[childId]?.model ?? null,
          error: null,
        },
      }))
      try {
        const snap = await getDocs(
          query(
            activityConfigsCollection(familyId),
            where('childId', 'in', [childId, 'both']),
          ),
        )
        const configs = snap.docs
          .map((d) => d.data() as ActivityConfig)
          .filter((c) => c.currentPosition != null && !c.completed)
          .sort((a, b) => a.sortOrder - b.sortOrder)

        const now = new Date().toISOString()
        const lines: string[] = []
        for (const config of configs) {
          const name = config.name || config.curriculum || 'workbook'
          const position = config.currentPosition as number
          const outcome = await syncWorkbookPositionToModel(
            familyId,
            childId,
            { workbookName: name, position, via: 'manual' },
            now,
          )
          lines.push(formatSyncOutcome(name, position, outcome))
        }
        if (lines.length === 0) lines.push('No tracked workbook positions for this child.')

        setByChild((prev) => ({
          ...prev,
          [childId]: {
            loading: prev[childId]?.loading ?? false,
            syncingPositions: false,
            positionSyncLines: lines,
            model: prev[childId]?.model ?? null,
            error: null,
          },
        }))
      } catch (err) {
        setByChild((prev) => ({
          ...prev,
          [childId]: {
            loading: prev[childId]?.loading ?? false,
            syncingPositions: false,
            positionSyncLines: prev[childId]?.positionSyncLines ?? null,
            model: prev[childId]?.model ?? null,
            error: err instanceof Error ? err.message : 'Position sync failed',
          },
        }))
      }
    },
    [familyId],
  )

  if (searchParams.get('diag') !== '1') return null

  return (
    <Box
      sx={{
        m: 2,
        p: 2,
        bgcolor: 'warning.50',
        border: '1px dashed',
        borderColor: 'warning.main',
        borderRadius: 1,
      }}
    >
      <Typography variant="overline" sx={{ fontWeight: 700 }}>
        Diagnostic — Foundations model (seed &amp; preview)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Deterministic bootstrap seeder (FEAT-48, slice 1). Reads skill snapshot,
        skill map, and sight words; writes only <code>learnerModels</code>. No AI.
      </Typography>

      {children.map((child) => {
        const state = byChild[child.id]
        return (
          <Box key={child.id} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {child.name}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                disabled={state?.loading}
                onClick={() => seedChild(child.id)}
              >
                {state?.loading ? 'Seeding…' : 'Seed / re-seed Foundations model'}
              </Button>
              <Tooltip
                title={!state?.model ? 'Seed the model first.' : ''}
                disableHoverListener={Boolean(state?.model)}
              >
                {/* span so the tooltip still fires while the button is disabled */}
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    disabled={state?.synthesizing || !state?.model}
                    onClick={() => synthesizeChild(child.id)}
                  >
                    {state?.synthesizing ? 'Synthesizing…' : 'Generate synthesis (AI)'}
                  </Button>
                </span>
              </Tooltip>
              <Button
                size="small"
                variant="outlined"
                disabled={state?.syncingPositions}
                onClick={() => syncPositions(child.id)}
              >
                {state?.syncingPositions ? 'Syncing…' : 'Sync curriculum positions'}
              </Button>
              {(state?.loading || state?.synthesizing || state?.syncingPositions) && (
                <CircularProgress size={16} />
              )}
            </Box>
            {state?.error && (
              <Typography variant="body2" color="error.main">
                {state.error}
              </Typography>
            )}
            {state?.positionSyncLines && (
              <Box sx={{ mb: 1, pl: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  Curriculum position sync
                </Typography>
                <List dense disablePadding>
                  {state.positionSyncLines.map((line, i) => (
                    <ListItem key={i} disableGutters sx={{ py: 0.1 }}>
                      <ListItemText
                        primary={line}
                        slotProps={{ primary: { variant: 'caption' } }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
            {state?.model && <ModelPreview model={state.model} />}
          </Box>
        )
      })}
    </Box>
  )
}

function ModelPreview({ model }: { model: LearnerModel }) {
  const grouped: Record<ConceptStateKind, Array<[string, ConceptStateEntry]>> = {
    solid: [],
    forming: [],
    frontier: [],
    'not-yet': [],
  }
  for (const entry of Object.entries(model.conceptStates)) {
    grouped[entry[1].state].push(entry)
  }

  return (
    <Box sx={{ pl: 1 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
        <Chip size="small" label={`status: ${model.status}`} />
        <Chip size="small" label={`graph ${model.graphVersion}`} />
        <Chip size="small" label={`seededAt ${model.seededAt.slice(0, 19)}`} />
        {STATE_GROUPS.map((g) => (
          <Chip
            key={g.state}
            size="small"
            label={`${g.label}: ${grouped[g.state].length}`}
            sx={{ color: g.color, fontWeight: 700 }}
            variant="outlined"
          />
        ))}
      </Box>
      {STATE_GROUPS.map((g) =>
        grouped[g.state].length === 0 ? null : (
          <Box key={g.state} sx={{ mb: 1 }}>
            <Typography variant="caption" sx={{ color: g.color, fontWeight: 700 }}>
              {g.label} ({grouped[g.state].length})
            </Typography>
            <Divider />
            <List dense disablePadding>
              {grouped[g.state]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([nodeId, entry]) => {
                  const node = FOUNDATION_NODE_MAP[nodeId]
                  const evLine = entry.evidence.map((e) => e.note).join(' · ') || '—'
                  return (
                    <ListItem key={nodeId} disableGutters sx={{ py: 0.25 }}>
                      <ListItemText
                        primary={`${node?.kidName ?? nodeId} · band ${node?.band ?? '?'}`}
                        secondary={evLine}
                        slotProps={{
                          primary: { variant: 'body2' },
                          secondary: { variant: 'caption' },
                        }}
                      />
                    </ListItem>
                  )
                })}
            </List>
          </Box>
        ),
      )}
      <SynthesisPreview model={model} />
      <QueuedForTesting model={model} />
    </Box>
  )
}

/**
 * The LLM judgment layer (FEAT-57, Phase 3a) surfaced on the diag preview: the
 * synthesized `whatMattersNext` moves, the growth `narrative`, and the
 * open-questions summary. This is 3a's only UI — the real Foundations tab is 3b.
 * Renders nothing until a synthesis has been generated.
 */
function SynthesisPreview({ model }: { model: LearnerModel }) {
  const synthesis = model.synthesis
  const stale = Boolean(model.synthesisStaleAt)
  if (!synthesis) {
    return (
      <Box sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          No synthesis yet — tap “Generate synthesis (AI)”.
        </Typography>
      </Box>
    )
  }
  return (
    <Box sx={{ mb: 1, mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          Synthesis
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          color={stale ? 'warning' : 'success'}
          label={stale ? 'stale — regenerate' : `generated ${synthesis.generatedAt.slice(0, 10)}`}
        />
      </Box>
      {synthesis.narrative && (
        <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic' }}>
          {synthesis.narrative}
        </Typography>
      )}
      {synthesis.whatMattersNext.length > 0 && (
        <>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            What matters next
          </Typography>
          <Divider />
          <List dense disablePadding>
            {synthesis.whatMattersNext.map((m, i) => (
              <ListItem key={`${m.conceptId}_${i}`} disableGutters sx={{ py: 0.25 }}>
                <ListItemText
                  primary={`${m.kidName} · ${m.suggestedVehicle}`}
                  secondary={m.why}
                  slotProps={{
                    primary: { variant: 'body2' },
                    secondary: { variant: 'caption' },
                  }}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}
      {synthesis.openQuestionsSummary.length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            Questions we're exploring
          </Typography>
          <List dense disablePadding>
            {synthesis.openQuestionsSummary.map((q, i) => (
              <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                <ListItemText primary={q} slotProps={{ primary: { variant: 'caption' } }} />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  )
}

/**
 * The quest queue (FEAT-54, slice 2c) surfaced on the diag preview: each concept
 * the Review Chat routed to a kid-facing check, with its status — **waiting** or
 * **tested ✓** with the date the Knowledge Mine resolved it. Extends what the diag
 * preview already renders; no new page.
 */
function QueuedForTesting({ model }: { model: LearnerModel }) {
  const questAsks = model.openQuestions.filter((q) => q.routedTo === 'quest')
  if (questAsks.length === 0) return null

  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        Queued for testing ({questAsks.length})
      </Typography>
      <Divider />
      <List dense disablePadding>
        {questAsks.map((q, i) => {
          const node = FOUNDATION_NODE_MAP[q.conceptId]
          const tested = Boolean(q.resolvedAt)
          return (
            <ListItem key={`${q.conceptId}_${i}`} disableGutters sx={{ py: 0.25, gap: 1 }}>
              <ListItemText
                primary={node?.kidName ?? q.conceptId}
                slotProps={{ primary: { variant: 'body2' } }}
              />
              <Chip
                size="small"
                variant="outlined"
                color={tested ? 'success' : 'default'}
                label={
                  tested
                    ? `tested ✓ ${q.resolvedAt?.slice(0, 10)}`
                    : 'waiting'
                }
              />
            </ListItem>
          )
        })}
      </List>
    </Box>
  )
}
