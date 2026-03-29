import {
  useEffect,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import {
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { getFirebaseAuth } from '../firebase/firebase'
import { AuthContext } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const firebaseAuth = getFirebaseAuth()
    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        setLoading(false)
      } else {
        // No user — show login page (don't auto-sign-in anonymously)
        setUser(null)
        setLoading(false)
      }
    })
    return unsubscribe
  }, [])

  const familyId = user?.uid ?? null

  const upgradeToEmail = async (email: string, password: string) => {
    if (!user || !user.isAnonymous) {
      throw new Error('Only anonymous accounts can be upgraded.')
    }
    // Reload the user to ensure the token is fresh before linking.
    await user.reload()
    const credential = EmailAuthProvider.credential(email, password)
    const result = await linkWithCredential(user, credential)
    setUser(result.user)
  }

  const signIn = async (email: string, password: string) => {
    const firebaseAuth = getFirebaseAuth()
    const result = await signInWithEmailAndPassword(firebaseAuth, email, password)
    setUser(result.user)
  }

  const handleSignOut = async () => {
    const firebaseAuth = getFirebaseAuth()
    await firebaseAuth.signOut()
    // onAuthStateChanged will fire, showing the login page.
  }

  return (
    <AuthContext.Provider
      value={{ user, familyId, loading, upgradeToEmail, signIn, signOut: handleSignOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}
