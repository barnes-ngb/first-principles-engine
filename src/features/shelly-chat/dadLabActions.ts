// ── Dad Lab chat actions: resolution + plain-language previews (FEAT-157) ──
//
// The pure half of "Ask AI can plan Dad Lab". `parseChatActions` validates the
// SHAPE of a `createConceptArc` / `planLab` proposal; this module decides
// whether that shape names anything real, and — when it doesn't — says why in
// a sentence a parent can read.
//
// It is the direct sibling of `curriculumActions` (FEAT-143), `dayItemActions`
// (FEAT-142) and `watchActions` (FEAT-149): a model can emit any arc id, any
// step number and any child id it likes, so a proposal is resolved against the
// family's LIVE arcs and children BEFORE a confirm card is offered. Nothing
// here writes; the writes are the extracted `dad-lab/useConceptArcs.createArc`
// and `dad-lab/plannedLab.createPlannedLab` — the same lanes the Dad Lab
// page's New Arc dialog and suggestion flow use, so the chat opens no second
// write path to `conceptArcs` or `dadLabReports`.
//
// Pure by design, so "a hallucinated arc id never reaches a card" is testable
// without Firestore.

import type { ArcStep, ChatAction, ConceptArc } from '../../core/types'
import { ArcStepStatus, DadLabType } from '../../core/types/enums'

/** The Dad Lab kinds, narrowed off the `ChatAction` union. */
export type DadLabAction = Extract<
  ChatAction,
  { kind: 'createConceptArc' | 'planLab' }
>

export const isDadLabAction = (action: ChatAction): action is DadLabAction =>
  action.kind === 'createConceptArc' || action.kind === 'planLab'

/** The slice of a family child this module needs — id to check, name to say. */
export interface DadLabChild {
  id: string
  name: string
}

/**
 * A resolved proposal — everything the confirm card needs, with no ids in it.
 * `arc` is present only for a `planLab` that links to one.
 */
export interface ResolvedDadLabAction {
  action: DadLabAction
  /** The live arc a `planLab` links to. Absent for an unlinked lab or an arc. */
  arc?: ConceptArc
  /** Who the write is for, BY NAME — the card never shows a child id. */
  childNames: string[]
}

export type DadLabResolution =
  | { ok: true; resolved: ResolvedDadLabAction }
  | { ok: false; notice: string }

/**
 * Plain-language refusals, shown in the card's place — FEAT-135's lesson: the
 * model's prose signs off with "confirm with a tap", so a silently dropped
 * proposal leaves the app promising a card that never appears.
 *
 * `unknownArc` follows `CURRICULUM_NOTICES.notFound`'s shape (never quoting the
 * bad id back) and names the real surface, because an arc id the model made up
 * is indistinguishable from one whose arc was archived a moment ago — either
 * way the true sentence is "that's not one of your active arcs".
 */
export const DAD_LAB_NOTICES = {
  notPermitted:
    'Planning Dad Lab is something a grown-up does — nothing was changed.',
  unknownChild:
    "That named a child I don't recognize, so nothing was changed. Dad Lab is for the whole family by default — ask again without naming anyone, or name the boys as they appear in the app.",
  unknownArc:
    "That didn't match one of your active concept arcs, so nothing was changed. The arcs live on the Dad Lab page.",
} as const

/** The refusal for a step number past the end of a real arc. */
export function stepOutOfRangeNotice(arcTitle: string, stepCount: number): string {
  return `"${arcTitle}" only has ${stepCount} step${stepCount === 1 ? '' : 's'}, so that lab points past the end of it — nothing was changed. Tell me which step you mean and I'll propose it again.`
}

/**
 * Resolve a proposed Dad Lab action against the live arcs and children.
 *
 * Returns the resolved action or a single plain-language reason it was
 * dropped. The order of the checks is the order a parent would ask them in: am
 * I allowed to do this, who is it for, and does the arc it points at exist.
 *
 * `canEdit` is a required argument, not an ambient assumption — `/chat` sits
 * outside `RequireParent`, so a kid profile can reach it by URL (FEAT-133's
 * lesson; same contract as every sibling resolver).
 *
 * `arcs` is the ACTIVE list (`useChatConceptArcs` filters archived, matching
 * `useConceptArcs`), so an archived arc refuses as not-active — the true
 * sentence — rather than resolving into a card for a container the parent
 * can't see.
 */
export function resolveDadLabAction(
  action: DadLabAction,
  arcs: ConceptArc[],
  children: DadLabChild[],
  canEdit: boolean,
): DadLabResolution {
  if (!canEdit) return { ok: false, notice: DAD_LAB_NOTICES.notPermitted }

  if (action.kind === 'createConceptArc') {
    // DATA-04: an arc names its audience, defaulting to every child. Each
    // NAMED id must be a family child — audience is never guessed, and a
    // half-recognized list is refused whole rather than silently narrowed.
    let childNames: string[]
    if (action.childIds && action.childIds.length > 0) {
      const names: string[] = []
      for (const id of action.childIds) {
        const child = children.find((c) => c.id === id)
        if (!child) return { ok: false, notice: DAD_LAB_NOTICES.unknownChild }
        names.push(child.name)
      }
      childNames = names
    } else {
      childNames = children.map((c) => c.name)
    }
    return { ok: true, resolved: { action, childNames } }
  }

  // planLab — a Dad Lab lab is whole-family by design (DATA-04), so the card
  // names everyone; the report carries no participation field to scope.
  const childNames = children.map((c) => c.name)
  if (!action.arcId) {
    return { ok: true, resolved: { action, childNames } }
  }
  const arc = arcs.find((a) => a.id === action.arcId)
  if (!arc) return { ok: false, notice: DAD_LAB_NOTICES.unknownArc }
  if (action.arcStepIndex != null && action.arcStepIndex >= arc.steps.length) {
    return { ok: false, notice: stepOutOfRangeNotice(arc.title, arc.steps.length) }
  }
  return { ok: true, resolved: { action, arc, childNames } }
}

/**
 * Resolve for DISPLAY, ignoring the gates that decide whether an action may be
 * OFFERED — the FEAT-144 split (`resolveCurriculumActionForDisplay`'s reason):
 * both kinds mint fresh documents, so once the parent has tapped, the question
 * "may this be proposed?" is settled and the card must keep its "Done ✓" even
 * if the arc it linked to is archived a moment later. The arc is still looked
 * up (leniently) so a linked card keeps naming it while it can.
 *
 * **Never** use this to decide whether to OFFER a card; that is
 * {@link resolveDadLabAction}'s job and it stays gated on the live state.
 */
export function resolveDadLabActionForDisplay(
  action: DadLabAction,
  arcs: ConceptArc[],
  children: DadLabChild[],
): ResolvedDadLabAction {
  const childNames =
    action.kind === 'createConceptArc' && action.childIds && action.childIds.length > 0
      ? action.childIds.map((id) => children.find((c) => c.id === id)?.name ?? 'this child')
      : children.map((c) => c.name)
  const arc =
    action.kind === 'planLab' && action.arcId
      ? arcs.find((a) => a.id === action.arcId)
      : undefined
  return { action, ...(arc ? { arc } : {}), childNames }
}

/**
 * Build the arc's `ArcStep[]` from a confirmed proposal — the New Arc dialog's
 * own rule, extracted so it is directly assertable: the steps land in the
 * card's order, verbatim, with the FIRST step active and the rest upcoming.
 * Step statuses are never the model's to set; there is no field for them in
 * the action, and this is the only place they come from.
 */
export function buildArcStepsFromAction(
  steps: Extract<DadLabAction, { kind: 'createConceptArc' }>['steps'],
): ArcStep[] {
  return steps.map((s, i) => ({
    title: s.title,
    conceptBeat: s.conceptBeat ?? '',
    status: i === 0 ? ArcStepStatus.Active : ArcStepStatus.Upcoming,
  }))
}

// ── Card wording ─────────────────────────────────────────────────────────────

const LAB_TYPE_LABELS: Record<DadLabType, string> = {
  [DadLabType.Science]: 'Science',
  [DadLabType.Engineering]: 'Engineering',
  [DadLabType.Adventure]: 'Adventure',
  [DadLabType.Heart]: 'Heart',
}

/** "Lincoln and London" — the audience, said the way a card says lists. */
export function formatChildNames(names: string[]): string {
  const clean = names.filter((n) => n.trim().length > 0)
  if (clean.length === 0) return 'the whole family'
  if (clean.length === 1) return clean[0]
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`
}

/**
 * The one-line preview a parent reads before tapping Confirm. Names the write
 * by TITLE and the audience by NAME — never a doc id, because an id on a
 * confirm card is not something a parent can check the proposal against.
 */
export function describeDadLabAction(resolved: ResolvedDadLabAction): string {
  const { action, arc, childNames } = resolved
  if (action.kind === 'createConceptArc') {
    return `Create the concept arc "${action.title}" for ${formatChildNames(childNames)}`
  }
  const type = LAB_TYPE_LABELS[action.labType]
  const arcSuffix =
    arc && action.arcStepIndex != null
      ? ` — step ${action.arcStepIndex + 1} of "${arc.title}"`
      : arc
        ? ` — part of "${arc.title}"`
        : ''
  return `Plan the ${type} lab "${action.title}"${arcSuffix}`
}

/**
 * The line under the preview. For a lab it is the sentence the run's design
 * pinned verbatim — where the write lands, and that starting it is a Dad Lab
 * page act — plus the hours rule, because "does this count school time" is the
 * question a parent asks of anything lab-shaped. For an arc, that the steps
 * shown ARE the record being created and everything else stays on the page.
 */
export function dadLabActionFootnote(action: DadLabAction): string {
  if (action.kind === 'createConceptArc') {
    return 'Creates the arc exactly as its steps read above — the first step starts active. Planning labs against it, marking steps done, and archiving all live on the Dad Lab page. No hours are recorded.'
  }
  return 'Adds to the Dad Lab backlog — start it from the Dad Lab page. No hours are recorded until the lab is completed there.'
}
