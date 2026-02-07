import { describe, expect, it, vi } from 'vitest'
import { generateFilename } from './upload'

// We only test the pure helper here. uploadArtifactFile depends on Firebase
// and would need integration / emulator tests.

describe('generateFilename', () => {
  it('produces a filename with the given extension', () => {
    const name = generateFilename('jpg')
    expect(name).toMatch(/\.jpg$/)
  })

  it('includes an ISO-like timestamp', () => {
    // Freeze time so the output is deterministic
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:30:45.123Z'))

    const name = generateFilename('webm')
    expect(name).toBe('2026-03-15T10-30-45-123Z.webm')

    vi.useRealTimers()
  })

  it('handles different extensions', () => {
    expect(generateFilename('png')).toMatch(/\.png$/)
    expect(generateFilename('mp4')).toMatch(/\.mp4$/)
  })
})
