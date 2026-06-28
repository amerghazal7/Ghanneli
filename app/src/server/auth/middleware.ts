/**
 * Production Firebase-admin verifier.
 * Tests must NOT import this file — import only from verify.ts instead.
 */
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { type TokenVerifier, getUserFromRequest } from './verify'

// ---------------------------------------------------------------------------
// Lazy Firebase admin initialisation
// ---------------------------------------------------------------------------

function ensureFirebaseApp(): void {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Cloud Run injects the key with literal \n — restore real newlines.
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const firebaseVerifier: TokenVerifier = async (idToken) => {
  ensureFirebaseApp()
  const decoded = await getAuth().verifyIdToken(idToken)
  return { uid: decoded.uid, email: decoded.email }
}

/** Convenience wrapper for Next.js route handlers and middleware. */
export const requireUser = (req: Request) => getUserFromRequest(req, firebaseVerifier)
