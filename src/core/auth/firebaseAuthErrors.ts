/**
 * Maps Firebase Auth error codes to user-friendly messages.
 */
const errorMessages: Record<string, string> = {
  'auth/operation-not-allowed':
    'Email/password sign-in is not enabled. Please ask the admin to enable it in the Firebase Console (Authentication → Sign-in method).',
  'auth/email-already-in-use':
    'An account with this email already exists. Use "Sign In" instead.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/too-many-requests':
    'Too many failed attempts. Please wait a moment and try again.',
  'auth/network-request-failed':
    'Network error. Please check your connection and try again.',
  'auth/credential-already-in-use':
    'This credential is already linked to a different account.',
}

/**
 * Extract a user-friendly message from a Firebase Auth error.
 * Falls back to the original message if the code is unrecognized.
 */
export function getAuthErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code
    if (code in errorMessages) return errorMessages[code]
  }
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred.'
}
