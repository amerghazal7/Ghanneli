'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../lib/auth/AuthProvider'
import { authedFetch } from '../../lib/api/client'
import { Tag } from '../../components/ui/Tag'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { CreditPackChooser } from '../../components/CreditPackChooser'
import type { MeData } from '../api/me/me'

export default function AccountPage() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()

  const [data, setData] = useState<MeData | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showBuyCredits, setShowBuyCredits] = useState(false)

  // Auth gate
  useEffect(() => {
    if (!loading && !user) {
      router.push('/signin')
    }
  }, [loading, user, router])

  // Fetch profile data
  useEffect(() => {
    if (!user) return
    authedFetch('/api/me')
      .then((res) => res.json() as Promise<MeData>)
      .then(setData)
      .catch(() => setFetchError('تعذّر تحميل بيانات حسابك. يرجى المحاولة مجدداً.'))
  }, [user])

  async function handleSignOut() {
    await signOut()
    router.push('/')
  }

  function statusTagColor(status: string): 'gold' | 'danger' | 'muted' {
    if (status === 'ready') return 'gold'
    if (status === 'failed') return 'danger'
    return 'muted'
  }

  function statusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'قيد الانتظار',
      lyrics: 'كتابة الكلمات',
      generating: 'جارٍ التوليد',
      postprocess: 'معالجة',
      ready: 'جاهزة',
      failed: 'فشلت',
    }
    return map[status] ?? status
  }

  // Loading state
  if (loading || (!user && !loading)) {
    return (
      <div className="account-page__spinner-wrap" aria-label="جارٍ التحميل">
        <span className="account-page__spinner" aria-hidden="true" />
      </div>
    )
  }

  return (
    <main className="account-page">
      {/* Header row */}
      <div className="account-page__header">
        <div className="account-page__user-info">
          <span className="account-page__email">{data?.email ?? user?.email ?? ''}</span>
          {data && (
            <Tag color="gold">{data.credits} رصيد</Tag>
          )}
        </div>
        <div className="account-page__actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBuyCredits(true)}
          >
            اشترِ رصيداً
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { void handleSignOut() }}
          >
            خروج
          </Button>
        </div>
      </div>

      {/* Buy credits modal overlay */}
      {showBuyCredits && (
        <div
          className="account-page__modal-backdrop"
          onClick={() => setShowBuyCredits(false)}
          role="presentation"
        >
          <div
            className="account-page__modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="شراء رصيد"
          >
            <CreditPackChooser songId="" onClose={() => setShowBuyCredits(false)} />
          </div>
        </div>
      )}

      {/* Error */}
      {fetchError && (
        <p className="account-page__error" role="alert">{fetchError}</p>
      )}

      {/* Songs library */}
      <section className="account-page__library" aria-label="مكتبة أغانيك">
        <h2 className="account-page__section-title">أغانيك</h2>

        {data && data.songs.length === 0 && (
          <div className="account-page__empty">
            <p className="account-page__empty-text">لم تصنع أي أغنية بعد</p>
            <Button
              variant="primary"
              size="md"
              onClick={() => router.push('/create')}
            >
              اصنع أغنيتك
            </Button>
          </div>
        )}

        {data && data.songs.length > 0 && (
          <div className="account-page__grid">
            {data.songs.map((song) => (
              <Link
                key={song.id}
                href={`/song/${song.shareSlug}`}
                className="account-page__card-link"
              >
                <Card className="account-page__song-card">
                  <div className="account-page__song-occasion">{song.occasion}</div>
                  <div className="account-page__song-meta">
                    {song.dialect} · {song.genre}
                  </div>
                  <div className="account-page__song-tags">
                    <Tag color={statusTagColor(song.status)}>
                      {statusLabel(song.status)}
                    </Tag>
                    {song.unlocked && (
                      <Tag color="gold">مفتوحة</Tag>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {!data && !fetchError && (
          <div className="account-page__loading-songs" aria-label="جارٍ تحميل الأغاني">
            <span className="account-page__spinner" aria-hidden="true" />
          </div>
        )}
      </section>
    </main>
  )
}
