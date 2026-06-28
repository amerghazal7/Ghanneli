'use client'

import { useState } from 'react'
import { PACKS } from '../lib/packs'
import { authedFetch, ApiError } from '../lib/api/client'

interface CreditPackChooserProps {
  songId: string
  onClose?: () => void
}

export function CreditPackChooser({ songId: _songId, onClose }: CreditPackChooserProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handlePick(packId: string) {
    setLoading(packId)
    setError(null)
    try {
      const res = await authedFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ packId }),
      })
      const data = (await res.json()) as { url: string }
      window.location.assign(data.url)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`حدث خطأ (${err.status}). يرجى المحاولة مجدداً.`)
      } else {
        setError('حدث خطأ. يرجى المحاولة مجدداً.')
      }
      setLoading(null)
    }
  }

  return (
    <div className="pack-chooser">
      <div className="pack-chooser__header">
        <h2 className="pack-chooser__title">اختر باقة الرصيد</h2>
        {onClose && (
          <button
            className="pack-chooser__close"
            onClick={onClose}
            aria-label="إغلاق"
          >
            ✕
          </button>
        )}
      </div>
      <p className="pack-chooser__sub">كل رصيد = أغنية واحدة كاملة</p>

      {error && (
        <p className="pack-chooser__error" role="alert">{error}</p>
      )}

      <div className="pack-chooser__grid">
        {PACKS.map((pack) => {
          const aed = (pack.amountMinor / 100).toFixed(0)
          const isLoading = loading === pack.id
          return (
            <button
              key={pack.id}
              className={`pack-card${isLoading ? ' pack-card--loading' : ''}`}
              onClick={() => { void handlePick(pack.id) }}
              disabled={loading !== null}
              aria-busy={isLoading}
            >
              <span className="pack-card__credits">{pack.credits}</span>
              <span className="pack-card__label">رصيد</span>
              <span className="pack-card__price">
                {aed} <span className="pack-card__currency">د.إ</span>
              </span>
              {isLoading && <span className="pack-card__spinner" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
