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
  signInAnonymously,
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
        // No user — sign in anonymously so the app is usable immediately.
        signInAnonymously(firebaseAuth).catch((err) => {
          console.error('Anonymous sign-in failed', err)
          setLoading(false)
        })
      }
    })
    return unsubscribe
  }, [])

  const familyId = user?.uid ?? null

  const upgradeToEmail = async (email: string, password: string) => {
    if (!user || !user.isAnonymous) {
      throw new Error('Only anonymous accounts can be upgraded.')
    }
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
    // onAuthStateChanged will fire, triggering a new anonymous sign-in.
  }

  return (
    <AuthContext.Provider
      value={{ user, familyId, loading, upgradeToEmail, signIn, signOut: handleSignOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}
