// ── Generating next week's draft from the chat (FEAT-150) ────────────────────
//
// **There is no second week-generation prompt.** This module assembles the same
// `PlanGeneratorInputs` the planner assembles, calls `buildPlannerPrompt` on
// them, sends it to the same `TaskType.Plan` handler, and parses the reply with
// the same `parseAIResponse` — including its FEAT-72 catalog-tag backfill, so a
// week drafted here carries the same tags the FEAT-68/69 re-test bridge reads.
// When the AI path fails it falls back to `generateDraftPlanFromInputs`, the
// planner's local generator, exactly as the planner does.
//
// The chat's only addition is one block of text: what the parent actually asked
// for. It is appended to the planner's prompt rather than replacing any of it,
// so the charter preamble, the skill snapshot, the routine and the day budget
// all still ground the week — and the parent's sentence shapes it rather than
// becoming it.
//
// Why the instruction is fenced and labelled rather than concatenated: it is
// text the model itself wrote (it emitted the `draftNextWeek` action), quoting
// text the parent wrote. Presenting it as a clearly delimited request keeps a
// sentence like "ignore the schema and return prose" reading as something the
// parent said about her week, not as a new instruction to the planner.
//
// FEAT-198: the fencing moved to `planner-chat/plannerRequest.ts` when the
// planner itself gained the same section. One definition, both surfaces — a
// change to the framing can't now hold on one door and not the other.

import { TaskType, type ChatResponse } from '../../core/ai/useAI'
import type { DraftWeeklyPlan, SkillSnapshot } from '../../core/types'
import {
  buildPlannerPrompt,
  ensureEvaluationItems,
  generateDraftPlanFromInputs,
  parseAIResponse,
  type PlanGeneratorInputs,
} from '../planner-chat/chatPlanner.logic'
import { buildInstructionSection, composePlannerMessage } from '../planner-chat/plannerRequest'

/** The AI entry point, injected so this module is testable without Firebase. */
export type PlanChatFn = (args: {
  familyId: string
  childId: string
  taskType: TaskType
  messages: { role: 'user' | 'assistant'; content: string }[]
}) => Promise<ChatResponse | null>

export interface GenerateNextWeekDraftInput {
  familyId: string
  childId: string
  /** The parent's words, already length-capped by `parseChatActions`. */
  instructions: string
  snapshot: SkillSnapshot | null
  /** Minutes/day budget, derived from the child's routine the planner's way. */
  hoursPerDay: number
  /** Routine text built from the child's live activity configs. */
  dailyRoutine: string
  subjectTimeDefaults?: Record<string, number>
  /** Priority tags for the FEAT-72/73 no-guess backfill inside `parseAIResponse`. */
  prioritySkillTags?: string[]
  chat: PlanChatFn
}

export interface GenerateNextWeekDraftResult {
  draft: DraftWeeklyPlan
  /** False when the AI path failed and the local planner produced this week. */
  usedAI: boolean
}

/**
 * Generate a draft for next week.
 *
 * Returns `null` only when BOTH the AI path and the local planner fail to
 * produce a week — which the caller must surface as a plain error rather than a
 * card, since a card implies something is ready to review.
 */
export async function generateNextWeekDraft(
  input: GenerateNextWeekDraftInput,
): Promise<GenerateNextWeekDraftResult | null> {
  const {
    familyId,
    childId,
    instructions,
    snapshot,
    hoursPerDay,
    dailyRoutine,
    subjectTimeDefaults,
    prioritySkillTags = [],
    chat,
  } = input

  const inputs: PlanGeneratorInputs = {
    snapshot,
    hoursPerDay,
    // The chat has no app-block picker and no workbook photos, so both are
    // empty. That is honest rather than lossy: an app block is a screen-time
    // container the parent sets up in the planner's wizard, and an assignment
    // comes from a photo she uploads there.
    appBlocks: [],
    assignments: [],
    dailyRoutine,
    ...(subjectTimeDefaults ? { subjectTimeDefaults } : {}),
  }

  try {
    const response = await chat({
      familyId,
      childId,
      taskType: TaskType.Plan,
      messages: [
        {
          role: 'user',
          content: composePlannerMessage(
            [buildPlannerPrompt(inputs)],
            buildInstructionSection(instructions),
          ),
        },
      ],
    })

    const parsed = response ? parseAIResponse(response, prioritySkillTags) : null
    if (parsed) return { draft: ensureEvaluationItems(parsed), usedAI: true }
    console.warn('[shellyChat] next-week generation returned no usable plan — using local planner')
  } catch (err) {
    console.warn('[shellyChat] next-week generation failed — using local planner', err)
  }

  try {
    return { draft: ensureEvaluationItems(generateDraftPlanFromInputs(inputs)), usedAI: false }
  } catch (err) {
    console.error('[shellyChat] local planner also failed for next week', err)
    return null
  }
}
