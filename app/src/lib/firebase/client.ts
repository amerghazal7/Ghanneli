import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:     process.env.NEXT_PUBLIC_FIREBASE_API_KEY     ?? 'demo-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'demo-ghanneli.firebaseapp.com',
  projectId:  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID  ?? 'demo-ghanneli',
}

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApps()[0]!
  return initializeApp(firebaseConfig)
}

let _auth: Auth | null = null

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth
  const app = getFirebaseApp()
  _auth = getAuth(app)
  const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST
  if (emulatorHost) {
    connectAuthEmulator(_auth, emulatorHost, { disableWarnings: true })
  }
  return _auth
}
