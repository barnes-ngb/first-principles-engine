import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import ChildSelector from '../../components/ChildSelector'
import SectionCard from '../../components/SectionCard'
import { LoadingState } from '../../components/states'
import { FOUNDATION_NODE_MAP } from '../../core/foundations'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useLearnerModel } from '../../core/hooks/useLearnerModel'
import type {
  ConceptStateKind,
  LearnerModel,
} from '../../core/types/learnerModel'
import DispositionProfile from './DispositionProfile'
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
 * The Foundations tab (FEAT-65, Phase 3b) — the first-class, **read-only** parent
 * home for the Learner Model, graduating the `?diag=1` preview out from behind the
 * flag. Renders `synthesis.whatMattersNext`, the concept terrain, modality
 * calibration, the change-feed (with loop-confirmations, G3), routed open
 * questions, and the disposition narrative as a final section.
 *
 * Every string passes the §14 display rules: no band numbers, no working-level
 * numbers, no percentages — four-state vocabulary only. Evidence renders via
 * plain-language source labels, never the seeded jargon notes.
 */
export default function FoundationsTab() {
  const familyId = useFamilyId()
  const { activeChild, activeChildId, children, setActiveChildId, isLoading } =
    useActiveChild()
  const { model, loading } = useLearnerModel(familyId, activeChildId)
  const [openConcept, setOpenConcept] = useState<TerrainConcept | null>(null)

  const childName = activeChild?.name ?? 'this child'

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <ChildSelector
        children={children}
        selectedChildId={activeChildId}
        onSelect={setActiveChildId}
        isLoading={isLoading}
        emptyMessage="Add a child to see their foundations."
      />

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
        onClose={() => setOpenConcept(null)}
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
                  sx={{
                    borderColor: stateColor(c.entry.state),
                    color: stateColor(c.entry.state),
                    fontWeight: 600,
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
  onClose,
}: {
  concept: TerrainConcept | null
  onClose: () => void
}) {
  return (
    <Drawer anchor="bottom" open={Boolean(concept)} onClose={onClose}>
      {concept && (
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
        </Box>
      )}
    </Drawer>
  )
}
