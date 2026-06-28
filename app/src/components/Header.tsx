'use client'

import Link from 'next/link'
import { useAuth } from '../lib/auth/AuthProvider'
import { useRouter } from 'next/navigation'

export function Header() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push('/')
  }

  return (
    <header className="site-header" role="banner">
      <Link href="/" className="site-header__wordmark" aria-label="غنّيلي — الصفحة الرئيسية">
        غنّيلي
      </Link>

      {!loading && (
        <nav className="site-header__nav" aria-label="التنقل الرئيسي">
          {user ? (
            <>
              <Link href="/account" className="site-header__link">
                حسابي
              </Link>
              <button
                className="site-header__signout"
                onClick={() => { void handleSignOut() }}
              >
                خروج
              </button>
            </>
          ) : (
            <Link href="/signin" className="site-header__link">
              تسجيل الدخول
            </Link>
          )}
        </nav>
      )}
    </header>
  )
}
