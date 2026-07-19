import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSaveState } from './useSaveState'

describe('useSaveState', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useSaveState())
    expect(result.current.saveState).toBe('idle')
  })

  it('transitions to saved on successful save and returns the result', async () => {
    const { result } = renderHook(() => useSaveState())

    const saveFn = vi.fn(() => Promise.resolve('ok'))

    let returnVal: string | undefined
    await act(async () => {
      returnVal = await result.current.withSave(saveFn) as string | undefined
    })

    expect(saveFn).toHaveBeenCalledOnce()
    expect(result.current.saveState).toBe('saved')
    expect(returnVal).toBe('ok')
  })

  it('transitions idle → saving → error on failed save', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useSaveState())

    const saveFn = vi.fn(() => Promise.reject(new Error('network failure')))

    let returnVal: unknown
    await act(async () => {
      returnVal = await result.current.withSave(saveFn)
    })

    expect(result.current.saveState).toBe('error')
    expect(returnVal).toBeUndefined()
    errorSpy.mockRestore()
  })

  it('allows manual state override via setSaveState', () => {
    const { result } = renderHook(() => useSaveState())

    act(() => {
      result.current.setSaveState('saving')
    })
    expect(result.current.saveState).toBe('saving')

    act(() => {
      result.current.setSaveState('idle')
    })
    expect(result.current.saveState).toBe('idle')
  })

  it('returns the resolved value from the save function', async () => {
    const { result } = renderHook(() => useSaveState())

    let returnVal: number | undefined
    await act(async () => {
      returnVal = await result.current.withSave(() => Promise.resolve(42))
    })

    expect(returnVal).toBe(42)
  })

  it('can recover from error to saved on a subsequent successful save', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useSaveState())

    await act(async () => {
      await result.current.withSave(() => Promise.reject(new Error('fail')))
    })
    expect(result.current.saveState).toBe('error')

    await act(async () => {
      await result.current.withSave(() => Promise.resolve())
    })
    expect(result.current.saveState).toBe('saved')

    errorSpy.mockRestore()
  })
})
