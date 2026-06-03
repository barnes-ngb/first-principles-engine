import { describe, expect, it } from 'vitest'

import { buildMaterialsPrompt, type MaterialsChild } from './generateMaterials'
import type { DraftDayPlan, SkillSnapshot } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

const day: DraftDayPlan = {
  day: 'Monday',
  timeBudgetMinutes: 60,
  items: [
    {
      id: 'm1',
      title: 'Math practice',
      subjectBucket: SubjectBucket.Math,
      estimatedMinutes: 20,
      skillTags: [],
      accepted: true,
    },
  ],
}

// A child born ~10 years ago and ~6 years ago (relative to "now").
const olderBirthdate = `${new Date().getFullYear() - 10}-01-01`
const youngerBirthdate = `${new Date().getFullYear() - 6}-01-01`

describe('buildMaterialsPrompt', () => {
  it('picks the theme from interests, not the child name', () => {
    // A child NOT named Lincoln, but with a Minecraft interest, still gets the
    // Minecraft theme — proving theme is interest-driven, never name-driven.
    const child: MaterialsChild = {
      name: 'Zoe',
      birthdate: olderBirthdate,
      interests: 'Minecraft, building',
    }
    const prompt = buildMaterialsPrompt(day, child, null)
    expect(prompt).toContain('Minecraft-themed')
  })

  it('gives a story theme to a child with story interests', () => {
    const child: MaterialsChild = {
      name: 'Theo',
      birthdate: olderBirthdate,
      interests: 'stories, drawing, book-making',
    }
    const prompt = buildMaterialsPrompt(day, child, null)
    expect(prompt).toContain('adventure and story themed')
  })

  it('applies younger-learner presentation by age, not name', () => {
    const child: MaterialsChild = { name: 'Kid', birthdate: youngerBirthdate }
    const prompt = buildMaterialsPrompt(day, child, null)
    // Younger learners get the large-font CSS block and the younger math note.
    expect(prompt).toContain('body { font-size: 16pt; }')
    expect(prompt).toContain('For a younger learner')
  })

  it('does not apply the younger-only font block to an older child', () => {
    const child: MaterialsChild = { name: 'Kid', birthdate: olderBirthdate }
    const prompt = buildMaterialsPrompt(day, child, null)
    expect(prompt).not.toContain('body { font-size: 16pt; }')
  })

  it('threads age and grade into the child context', () => {
    const child: MaterialsChild = {
      name: 'Sam',
      birthdate: olderBirthdate,
      grade: '4th grade',
    }
    const prompt = buildMaterialsPrompt(day, child, null)
    expect(prompt).toContain('age 10')
    expect(prompt).toContain('4th grade')
  })

  it('never emits the old hardcoded per-name prose', () => {
    const child: MaterialsChild = { name: 'Lincoln', birthdate: olderBirthdate }
    const prompt = buildMaterialsPrompt(day, child, null)
    // The old workaround hardcoded "Lincoln (10): Speech + neurodivergence…".
    expect(prompt).not.toContain('Speech + neurodivergence')
    expect(prompt).not.toContain("LINCOLN'S CURRENT LEVELS")
    expect(prompt).not.toContain("LONDON'S CURRENT LEVELS")
  })

  it('calibrates from snapshot working levels when present', () => {
    const snapshot = {
      childId: 'c1',
      prioritySkills: [],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
      workingLevels: {
        math: { level: 3, updatedAt: '2026-01-01', source: 'quest' },
      },
    } as unknown as SkillSnapshot
    const child: MaterialsChild = { name: 'Sam', birthdate: olderBirthdate }
    const prompt = buildMaterialsPrompt(day, child, snapshot)
    expect(prompt).toContain('CURRENT WORKING LEVELS')
    expect(prompt).toContain('math: level 3')
  })

  it('seeds calibration from grade when there is no snapshot', () => {
    const child: MaterialsChild = {
      name: 'Sam',
      birthdate: olderBirthdate,
      grade: '4th grade',
    }
    const prompt = buildMaterialsPrompt(day, child, null)
    expect(prompt).toContain('No skill snapshot yet')
    expect(prompt).toContain('4th grade level')
  })
})
