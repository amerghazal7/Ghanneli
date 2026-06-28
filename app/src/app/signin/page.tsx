'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../lib/auth/AuthProvider'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field } from '../../components/ui/Field'
import { Waveform } from '../../components/Waveform'

export default function SignInPage() {
  const router = useRouter()
  const { signIn, signUp } = useAuth()

  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isSignUp) {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
      router.push('/create')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ، حاول مجدداً'
      // Map Firebase error codes to Arabic messages
      if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      } else if (msg.includes('user-not-found')) {
        setError('لا يوجد حساب بهذا البريد الإلكتروني')
      } else if (msg.includes('email-already-in-use')) {
        setError('هذا البريد الإلكتروني مسجّل مسبقاً')
      } else if (msg.includes('weak-password')) {
        setError('كلمة المرور قصيرة جداً — ٦ أحرف على الأقل')
      } else {
        setError('حدث خطأ، حاول مجدداً')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="signin-page">
      {/* Ambient waveform backdrop */}
      <div className="signin-page__wave" aria-hidden="true">
        <Waveform mode="ambient" />
      </div>

      <div className="signin-page__content">
        {/* Wordmark */}
        <h1 className="signin-page__wordmark">غنّيلي</h1>
        <p className="signin-page__tagline">أغنية مخصصة، تُصنع بالذكاء الاصطناعي</p>

        <Card elevated className="signin-page__card">
          <h2 className="signin-page__title">
            {isSignUp ? 'إنشاء حساب' : 'تسجيل الدخول'}
          </h2>

          <form onSubmit={handleSubmit} noValidate className="signin-page__form">
            <Field
              id="email"
              label="البريد الإلكتروني"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="you@example.com"
            />
            <Field
              id="password"
              label="كلمة المرور"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="••••••••"
            />

            {error && (
              <p className="signin-page__error" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={loading || !email || !password}
            >
              {loading
                ? 'جارٍ التحميل…'
                : isSignUp
                  ? 'إنشاء الحساب'
                  : 'دخول'}
            </Button>
          </form>

          <p className="signin-page__toggle">
            {isSignUp ? 'لديك حساب؟' : 'ليس لديك حساب؟'}{' '}
            <button
              type="button"
              className="signin-page__toggle-btn"
              onClick={() => { setIsSignUp((v) => !v); setError('') }}
            >
              {isSignUp ? 'تسجيل الدخول' : 'إنشاء حساب'}
            </button>
          </p>
        </Card>
      </div>

      <style>{`
        .signin-page {
          min-block-size: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          padding-inline: var(--space-4);
          padding-block: var(--space-8);
        }
        .signin-page__wave {
          position: absolute;
          inset-inline: 0;
          inset-block-end: 0;
          opacity: 0.18;
          pointer-events: none;
          padding-inline: var(--space-8);
        }
        .signin-page__content {
          position: relative;
          z-index: 1;
          inline-size: 100%;
          max-inline-size: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-4);
        }
        .signin-page__wordmark {
          font-family: var(--font-display);
          font-size: var(--text-h2);
          color: var(--gold);
          text-align: center;
          line-height: 1;
        }
        .signin-page__tagline {
          font-size: var(--text-small);
          color: var(--muted);
          text-align: center;
        }
        .signin-page__card {
          inline-size: 100%;
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }
        .signin-page__title {
          font-size: var(--text-h3);
          color: var(--ivory);
          text-align: center;
        }
        .signin-page__form {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .signin-page__error {
          font-size: var(--text-small);
          color: var(--danger);
          text-align: center;
          padding-block: var(--space-2);
          padding-inline: var(--space-4);
          background-color: rgba(224,106,106,0.10);
          border-radius: var(--radius-sm);
          border: 1px solid rgba(224,106,106,0.25);
        }
        .signin-page__toggle {
          font-size: var(--text-small);
          color: var(--muted);
          text-align: center;
        }
        .signin-page__toggle-btn {
          background: none;
          border: none;
          color: var(--gold);
          cursor: pointer;
          font-size: inherit;
          font-family: inherit;
          padding: 0;
          text-decoration: underline;
        }
        .signin-page__toggle-btn:hover {
          color: var(--gold-deep);
        }
      `}</style>
    </main>
  )
}
