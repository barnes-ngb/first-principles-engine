/**
 * Story Call audience labels (FEAT-98) — the single source of truth for who the Barnes
 * kids read to on a Story Call.
 *
 * Single-family app: the kids read to one grandparent household — Mimi & Papa (confirmed
 * by Nathan, 2026-07-18). These names are hardcoded on purpose: a family-configurable
 * "who they read to" list (STORY_CALL_DESIGN §9 item 0b) is deliberately deferred. They
 * live here, centralized, so that future version is a clean swap — never a scatter-hunt
 * across chips, headings, and the printable brief.
 */

/** Audience chips on the Story Call back cover ("Who did you read to?"). */
export const STORY_CALL_AUDIENCES = ['Mimi', 'Papa', 'Someone else'] as const
export type StoryCallAudience = (typeof STORY_CALL_AUDIENCES)[number]

/** The grandparent household, named — used where it's always correct (the printable brief). */
export const STORY_CALL_GRANDPARENTS_LABEL = 'Mimi & Papa'
