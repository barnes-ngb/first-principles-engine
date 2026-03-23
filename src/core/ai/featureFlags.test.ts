import { describe, it, expect, beforeEach } from 'vitest'
import {
  AIFeatureFlag,
  AIFeatureFlagLabel,
  AIFeatureFlagDescription,
  getAIFeatureFlag,
  setAIFeatureFlag,
} from './featureFlags'

describe('AI feature flags', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('AIFeatureFlag enum', () => {
    it('defines AiPlanning flag', () => {
      expect(AIFeatureFlag.AiPlanning).toBe('ai_planning')
    })

    it('has labels for all flags', () => {
      for (const flag of Object.values(AIFeatureFlag)) {
        expect(AIFeatureFlagLabel[flag]).toBeDefined()
        expect(typeof AIFeatureFlagLabel[flag]).toBe('string')
      }
    })

    it('has descriptions for all flags', () => {
      for (const flag of Object.values(AIFeatureFlag)) {
        expect(AIFeatureFlagDescription[flag]).toBeDefined()
        expect(typeof AIFeatureFlagDescription[flag]).toBe('string')
      }
    })
  })

  describe('getAIFeatureFlag', () => {
    it('returns default-enabled value when flag is not set', () => {
      // AiPlanning defaults to true (core feature that should work out of the box)
      expect(getAIFeatureFlag(AIFeatureFlag.AiPlanning)).toBe(true)
    })

    it('returns false when flag is set to "false"', () => {
      localStorage.setItem('fpe_ai_flag_ai_planning', 'false')
      expect(getAIFeatureFlag(AIFeatureFlag.AiPlanning)).toBe(false)
    })

    it('returns true when flag is set to "true"', () => {
      localStorage.setItem('fpe_ai_flag_ai_planning', 'true')
      expect(getAIFeatureFlag(AIFeatureFlag.AiPlanning)).toBe(true)
    })

    it('returns false for arbitrary values', () => {
      localStorage.setItem('fpe_ai_flag_ai_planning', 'yes')
      expect(getAIFeatureFlag(AIFeatureFlag.AiPlanning)).toBe(false)
    })
  })

  describe('setAIFeatureFlag', () => {
    it('sets flag to true', () => {
      setAIFeatureFlag(AIFeatureFlag.AiPlanning, true)
      expect(localStorage.getItem('fpe_ai_flag_ai_planning')).toBe('true')
    })

    it('sets flag to false', () => {
      setAIFeatureFlag(AIFeatureFlag.AiPlanning, true)
      setAIFeatureFlag(AIFeatureFlag.AiPlanning, false)
      expect(localStorage.getItem('fpe_ai_flag_ai_planning')).toBe('false')
    })

    it('roundtrips through get', () => {
      setAIFeatureFlag(AIFeatureFlag.AiPlanning, true)
      expect(getAIFeatureFlag(AIFeatureFlag.AiPlanning)).toBe(true)

      setAIFeatureFlag(AIFeatureFlag.AiPlanning, false)
      expect(getAIFeatureFlag(AIFeatureFlag.AiPlanning)).toBe(false)
    })
  })
})
