import { z } from 'zod'

import {
  DayBlockType,
  EngineStage,
  EvidenceType,
  SubjectBucket,
} from './enums'

export const subjectBucketSchema = z.nativeEnum(SubjectBucket)
export const engineStageSchema = z.nativeEnum(EngineStage)
export const evidenceTypeSchema = z.nativeEnum(EvidenceType)
export const dayBlockTypeSchema = z.nativeEnum(DayBlockType)

export const checklistItemSchema = z
  .object({
    id: z.string().optional(),
    label: z.string(),
    completed: z.boolean(),
  })
  .passthrough()

export const dayBlockSchema = z
  .object({
    id: z.string().optional(),
    type: dayBlockTypeSchema,
    title: z.string().optional(),
    subjectBucket: subjectBucketSchema.optional(),
    location: z.string().optional(),
    plannedMinutes: z.number().optional(),
    actualMinutes: z.number().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    notes: z.string().optional(),
    quickCapture: z.boolean().optional(),
    checklist: z.array(checklistItemSchema).optional(),
  })
  .passthrough()

export const artifactTagsSchema = z
  .object({
    engineStage: engineStageSchema,
    domain: z.string(),
    subjectBucket: subjectBucketSchema,
    location: z.string(),
    ladderRef: z
      .object({
        ladderId: z.string(),
        rungId: z.string(),
      })
      .optional(),
  })
  .passthrough()

export const artifactSchema = z
  .object({
    id: z.string().optional(),
    childId: z.string().optional(),
    dayLogId: z.string().optional(),
    weekPlanId: z.string().optional(),
    title: z.string(),
    type: evidenceTypeSchema,
    uri: z.string().optional(),
    createdAt: z.string().optional(),
    content: z.string().optional(),
    tags: artifactTagsSchema,
    notes: z.string().optional(),
  })
  .passthrough()

export const dayLogSchema = z
  .object({
    date: z.string(),
    blocks: z.array(dayBlockSchema),
    retro: z.string().optional(),
    checklist: z.array(checklistItemSchema).optional(),
    artifacts: z.array(artifactSchema).optional(),
  })
  .passthrough()

export const weekPlanSchema = z
  .object({
    id: z.string().optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    theme: z.string(),
    virtue: z.string(),
    scriptureRef: z.string(),
    heartQuestion: z.string(),
    childGoals: z
      .array(
        z.object({
          childId: z.string(),
          goals: z.array(z.string()),
        }),
      )
      .optional(),
    tracks: z.array(z.string()),
    flywheelPlan: z.string(),
    buildLab: z.object({
      title: z.string(),
      materials: z.array(z.string()),
      steps: z.array(z.string()),
    }),
    days: z.array(dayLogSchema).optional(),
  })
  .passthrough()

export type SubjectBucketSchema = z.infer<typeof subjectBucketSchema>
export type EngineStageSchema = z.infer<typeof engineStageSchema>
export type EvidenceTypeSchema = z.infer<typeof evidenceTypeSchema>
export type DayBlockTypeSchema = z.infer<typeof dayBlockTypeSchema>
export type ChecklistItemSchema = z.infer<typeof checklistItemSchema>
export type DayBlockSchema = z.infer<typeof dayBlockSchema>
export type DayLogSchema = z.infer<typeof dayLogSchema>
export type ArtifactTagsSchema = z.infer<typeof artifactTagsSchema>
export type ArtifactSchema = z.infer<typeof artifactSchema>
export type WeekPlanSchema = z.infer<typeof weekPlanSchema>
