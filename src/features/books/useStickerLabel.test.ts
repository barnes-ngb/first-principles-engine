import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { defaultStickerLabel, useStickerLabel } from './useStickerLabel'

describe('defaultStickerLabel', () => {
  it('names the active child when we know who they are', () => {
    expect(defaultStickerLabel('Lincoln')).toBe("Lincoln's drawing")
  })

  it('falls back when we do not', () => {
    expect(defaultStickerLabel(undefined)).toBe('My drawing')
    expect(defaultStickerLabel('')).toBe('My drawing')
  })
})

describe('useStickerLabel (FEAT-160)', () => {
  it('picks up a child that resolves after mount — the reported "My drawing" bug', () => {
    // The capture dialog mounts with its page, before useActiveChild resolves.
    const { result, rerender } = renderHook(({ name }) => useStickerLabel(name), {
      initialProps: { name: '' as string | undefined },
    })
    expect(result.current.label).toBe('My drawing')

    rerender({ name: 'Lincoln' })
    expect(result.current.label).toBe("Lincoln's drawing")
  })

  it('never clobbers a name the kid typed', () => {
    const { result, rerender } = renderHook(({ name }) => useStickerLabel(name), {
      initialProps: { name: '' as string | undefined },
    })
    act(() => result.current.setLabel('Ender dragon'))
    rerender({ name: 'Lincoln' })
    expect(result.current.label).toBe('Ender dragon')
  })

  it('a reset (new capture) returns to the current child default', () => {
    const { result, rerender } = renderHook(({ name }) => useStickerLabel(name), {
      initialProps: { name: 'Lincoln' as string | undefined },
    })
    act(() => result.current.setLabel('Ender dragon'))
    act(() => result.current.resetLabel())
    expect(result.current.label).toBe("Lincoln's drawing")
    // ...and follows the child again after the reset.
    rerender({ name: 'London' })
    expect(result.current.label).toBe("London's drawing")
  })
})
