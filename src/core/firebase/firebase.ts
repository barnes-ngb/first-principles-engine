import { initializeApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const app = initializeApp(firebaseConfig)

// Auth is initialized lazily to avoid failures when firebase.ts is
// imported in test files that don't provide a valid API key.
let _auth: Auth | null = null
export function getFirebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(app)
  return _auth
}
