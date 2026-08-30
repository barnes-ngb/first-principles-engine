import { describe, expect, it } from 'vitest'

import { getAuthErrorMessage } from './firebaseAuthErrors'

describe('getAuthErrorMessage', () => {
  it('returns a friendly message for auth/wrong-password', () => {
    const err = { code: 'auth/wrong-password', message: 'Firebase: ...' }
    expect(getAuthErrorMessage(err)).toBe('Incorrect password.')
  })

  it('returns a friendly message for auth/email-already-in-use', () => {
    const err = { code: 'auth/email-already-in-use', message: 'Firebase: ...' }
    expect(getAuthErrorMessage(err)).toBe(
      'An account with this email already exists. Use "Sign In" instead.',
    )
  })

  it('returns a friendly message for auth/invalid-email', () => {
    const err = { code: 'auth/invalid-email', message: 'raw' }
    expect(getAuthErrorMessage(err)).toBe('Please enter a valid email address.')
  })

  it('returns a friendly message for auth/weak-password', () => {
    const err = { code: 'auth/weak-password', message: 'raw' }
    expect(getAuthErrorMessage(err)).toBe(
      'Password must be at least 6 characters.',
    )
  })

  it('returns a friendly message for auth/user-not-found', () => {
    const err = { code: 'auth/user-not-found', message: 'raw' }
    expect(getAuthErrorMessage(err)).toBe('No account found with this email.')
  })

  it('returns a friendly message for auth/invalid-credential', () => {
    const err = { code: 'auth/invalid-credential', message: 'raw' }
    expect(getAuthErrorMessage(err)).toBe('Incorrect email or password.')
  })

  it('returns a friendly message for auth/too-many-requests', () => {
    const err = { code: 'auth/too-many-requests', message: 'raw' }
    expect(getAuthErrorMessage(err)).toBe(
      'Too many failed attempts. Please wait a moment and try again.',
    )
  })

  it('returns a friendly message for auth/network-request-failed', () => {
    const err = { code: 'auth/network-request-failed', message: 'raw' }
    expect(getAuthErrorMessage(err)).toBe(
      'Network error. Please check your connection and try again.',
    )
  })

  it('returns a friendly message for auth/operation-not-allowed', () => {
    const err = { code: 'auth/operation-not-allowed', message: 'raw' }
    expect(getAuthErrorMessage(err)).toContain('not enabled')
  })

  it('returns a friendly message for auth/credential-already-in-use', () => {
    const err = { code: 'auth/credential-already-in-use', message: 'raw' }
    expect(getAuthErrorMessage(err)).toContain('already linked')
  })

  it('falls back to err.message for an Error with an unrecognized code', () => {
    const err = Object.assign(new Error('Something broke'), {
      code: 'auth/unknown-thing',
    })
    expect(getAuthErrorMessage(err)).toBe('Something broke')
  })

  it('falls back to err.message for a plain Error (no code)', () => {
    const err = new Error('Network timeout')
    expect(getAuthErrorMessage(err)).toBe('Network timeout')
  })

  it('returns generic message for a non-Error, non-code object', () => {
    expect(getAuthErrorMessage({ foo: 'bar' })).toBe(
      'An unexpected error occurred.',
    )
  })

  it('returns generic message for null', () => {
    expect(getAuthErrorMessage(null)).toBe('An unexpected error occurred.')
  })

  it('returns generic message for undefined', () => {
    expect(getAuthErrorMessage(undefined)).toBe('An unexpected error occurred.')
  })

  it('returns generic message for a string', () => {
    expect(getAuthErrorMessage('some error string')).toBe(
      'An unexpected error occurred.',
    )
  })

  it('prefers the mapped message over err.message when code is recognized', () => {
    const err = Object.assign(new Error('Firebase internal error'), {
      code: 'auth/wrong-password',
    })
    expect(getAuthErrorMessage(err)).toBe('Incorrect password.')
  })

  it('handles object with code but not an Error instance (unrecognized code)', () => {
    const err = { code: 'auth/custom-error' }
    expect(getAuthErrorMessage(err)).toBe('An unexpected error occurred.')
  })
})
