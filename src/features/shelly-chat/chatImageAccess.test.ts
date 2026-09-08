/**
 * UX-189 — the chat's image door is gated and metered.
 *
 * The pure half: who is refused, in what order, and with what words. The wiring
 * half (that every path funnels through `handleGenerateImageDirect`, that a
 * refusal returns before the paid call, and that the counter moves only on a
 * URL) is asserted in `chatImageGeneration.test.ts`.
 */
import { describe, expect, it } from 'vitest'

import {
  ART_QUOTA_MESSAGE,
  CHAT_IMAGE_KID_NOTICE,
  resolveChatImageGate,
} from './chatImageAccess'
import { expectKidWording } from '../../test/kidReadability'

describe('resolveChatImageGate (UX-189)', () => {
  it('refuses a child profile, whatever the budget says', () => {
    for (const atLimit of [false, true]) {
      const gate = resolveChatImageGate(false, atLimit, ART_QUOTA_MESSAGE)
      expect(gate.ok).toBe(false)
      if (!gate.ok) expect(gate.reason).toBe('not-permitted')
    }
  })

  it('lets a parent through, and never reads a cap for them', () => {
    // `useArtQuota` returns `atLimit: false` for an uncapped actor by
    // construction, so this is belt and braces rather than a second rule.
    expect(resolveChatImageGate(true, false, ART_QUOTA_MESSAGE).ok).toBe(true)
  })

  it('refuses at the cap with the ONE cap message, not a second phrasing', () => {
    const gate = resolveChatImageGate(true, true, ART_QUOTA_MESSAGE)
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.reason).toBe('at-limit')
      expect(gate.notice).toBe(ART_QUOTA_MESSAGE)
    }
  })

  it('fails closed when the capability was never wired', () => {
    expect(resolveChatImageGate(undefined as unknown as boolean, false, ART_QUOTA_MESSAGE).ok).toBe(
      false,
    )
  })
})

describe('the kid refusal is a way forward, not a wall', () => {
  it('names real places a child can actually make a picture', () => {
    expect(CHAT_IMAGE_KID_NOTICE).toContain('Stickers page')
    expect(CHAT_IMAGE_KID_NOTICE).toContain('book')
  })

  it('carries no shame language and no error register', () => {
    expect(CHAT_IMAGE_KID_NOTICE).not.toMatch(/not allowed|denied|error|sorry|can't|cannot/i)
  })

  it('reads at London’s level, sentence by sentence', () => {
    for (const sentence of CHAT_IMAGE_KID_NOTICE.split('. ')) {
      expectKidWording(sentence, 'chat image refusal')
    }
  })
})
