'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSongStatus } from './useSongStatus'
import { AudioPlayer } from './AudioPlayer'
import { CreditPackChooser } from './CreditPackChooser'
import { Waveform } from './Waveform'
import { Tag } from './ui/Tag'
import { Button } from './ui/Button'
import { authedFetch, ApiError } from '../lib/api/client'

type Variant = 'primary' | 'alt'

interface SongPageProps {
  songId?: string
  shareSlug?: string
  initialStatus: string
  previewUri?: string
  fullUri?: string
  altPreviewUri?: string
  altFullUri?: string
  unlocked?: boolean
}

type PageState =
  | { kind: 'generating' }
  | { kind: 'preview'; previewUri: string }
  | { kind: 'paywall'; previewUri: string }
  | { kind: 'unlocked'; fullUri: string; previewUri: string }
  | { kind: 'failed' }

function resolveInitialState(
  initialStatus: string,
  previewUri: string | undefined,
  fullUri: string | undefined,
  unlocked: boolean | undefined,
): PageState {
  if (unlocked && fullUri && previewUri) return { kind: 'unlocked', fullUri, previewUri }
  if (initialStatus === 'ready' && previewUri) return { kind: 'preview', previewUri }
  if (initialStatus === 'failed') return { kind: 'failed' }
  return { kind: 'generating' }
}

const STATUS_COPY: Record<string, string> = {
  pending:     'نبدأ تأليف أغنيتك…',
  lyrics:      'نكتب الكلمات…',
  generating:  'نؤلّف الموسيقى…',
  postprocess: 'نُلمّع اللمسات الأخيرة…',
}

const VERSION_LABELS: Record<Variant, string> = {
  primary: 'النسخة الأولى',
  alt: 'النسخة الثانية',
}

export function SongPage({
  songId,
  shareSlug,
  initialStatus,
  previewUri: initialPreviewUri,
  fullUri: initialFullUri,
  altPreviewUri: initialAltPreviewUri,
  altFullUri: initialAltFullUri,
  unlocked: initialUnlocked,
}: SongPageProps) {
  const [pageState, setPageState] = useState<PageState>(() =>
    resolveInitialState(initialStatus, initialPreviewUri, initialFullUri, initialUnlocked),
  )
  // Alt-engine URIs (the A/B "second version"). Tracked separately from the
  // primary state machine so both versions render in preview AND unlocked.
  const [altPreviewUri, setAltPreviewUri] = useState<string | undefined>(initialAltPreviewUri)
  const [altFullUri, setAltFullUri] = useState<string | undefined>(initialAltFullUri)
  const [chosen, setChosen] = useState<Variant | null>(null)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [unlockLoading, setUnlockLoading] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [ratingDone, setRatingDone] = useState(false)

  // Poll only while generating
  const pollId = pageState.kind === 'generating' ? (songId ?? null) : null
  const songStatus = useSongStatus(pollId)

  // Transition out of generating when status becomes ready
  if (
    pageState.kind === 'generating' &&
    songStatus.status === 'ready' &&
    songStatus.previewUri
  ) {
    if (songStatus.altPreviewUri && !altPreviewUri) setAltPreviewUri(songStatus.altPreviewUri)
    setPageState({ kind: 'preview', previewUri: songStatus.previewUri })
  }
  if (pageState.kind === 'generating' && songStatus.status === 'failed') {
    setPageState({ kind: 'failed' })
  }

  async function handleUnlock() {
    if (!songId) return
    setUnlockLoading(true)
    setUnlockError(null)
    try {
      const res = await authedFetch(`/api/songs/${songId}/unlock`, { method: 'POST' })
      const data = (await res.json()) as { fullUri: string; altFullUri?: string }
      if (data.altFullUri) setAltFullUri(data.altFullUri)
      const prevUri =
        pageState.kind === 'preview' || pageState.kind === 'paywall'
          ? pageState.previewUri
          : initialPreviewUri ?? ''
      setPageState({ kind: 'unlocked', fullUri: data.fullUri, previewUri: prevUri })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 402) {
          const prevUri =
            pageState.kind === 'preview' ? pageState.previewUri : initialPreviewUri ?? ''
          setPageState({ kind: 'paywall', previewUri: prevUri })
        } else if (err.status === 409) {
          setUnlockError('الأغنية لا تزال قيد التأليف، يرجى الانتظار قليلاً.')
        } else {
          setUnlockError('حدث خطأ. يرجى المحاولة مجدداً.')
        }
      } else {
        setUnlockError('حدث خطأ. يرجى المحاولة مجدداً.')
      }
    } finally {
      setUnlockLoading(false)
    }
  }

  async function handleChoose(variant: Variant) {
    setChosen(variant) // optimistic
    if (!songId) return
    try {
      await authedFetch(`/api/songs/${songId}/choose`, {
        method: 'POST',
        body: JSON.stringify({ variant }),
      })
    } catch {
      // non-fatal — keep the optimistic selection
    }
  }

  async function handleRate(value: number) {
    if (!songId || ratingDone) return
    setRating(value)
    try {
      await authedFetch(`/api/songs/${songId}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating: value }),
      })
      setRatingDone(true)
    } catch {
      // rating failure is non-fatal — keep UI optimistic
    }
  }

  const shareUrl =
    typeof window !== 'undefined' && shareSlug
      ? `${window.location.origin}/song/${shareSlug}`
      : null

  // A labeled version block — player, optional download, and a "pick" control.
  function VersionBlock({
    variant,
    src,
    download,
  }: {
    variant: Variant
    src: string
    download: boolean
  }) {
    const isChosen = chosen === variant
    return (
      <div className={`version-block${isChosen ? ' version-block--chosen' : ''}`}>
        <div className="version-block__head">
          <span className="version-block__label">{VERSION_LABELS[variant]}</span>
          {isChosen && <Tag color="gold">اختيارك</Tag>}
        </div>
        <AudioPlayer src={src} label={VERSION_LABELS[variant]} />
        <div className="version-block__actions">
          <button
            type="button"
            className={`btn btn--md ${isChosen ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => { void handleChoose(variant) }}
          >
            {isChosen ? 'المختارة' : 'اختر هذه'}
          </button>
          {download && (
            <a href={src} download className="btn btn--ghost btn--md">تحميل</a>
          )}
        </div>
      </div>
    )
  }

  // ---- Generating state ----
  if (pageState.kind === 'generating') {
    const statusCopy =
      (songStatus.status ? STATUS_COPY[songStatus.status] : null) ??
      'جاري تأليف أغنيتك…'
    return (
      <div className="song-page song-page--generating">
        <div className="song-page__wave-wrap">
          <Waveform mode="active" aria-label="جاري التأليف" />
        </div>
        <p className="song-page__status-copy">{statusCopy}</p>
        {songStatus.error && (
          <p className="song-page__error" role="alert">
            حدث خطأ أثناء التحقق. يرجى تحديث الصفحة.
          </p>
        )}
      </div>
    )
  }

  // ---- Failed state ----
  if (pageState.kind === 'failed') {
    return (
      <div className="song-page song-page--failed">
        <p className="song-page__error">تعذّر إنشاء الأغنية. يرجى المحاولة مجدداً.</p>
        <Link href="/create" className="btn btn--primary btn--md">
          اصنع أغنيتك
        </Link>
      </div>
    )
  }

  // ---- Preview state ----
  if (pageState.kind === 'preview') {
    return (
      <div className="song-page song-page--preview">
        <div className="song-page__tags">
          <Tag color="rose">مقطع تجريبي ٣٠ ثانية</Tag>
        </div>
        {altPreviewUri ? (
          <>
            <p className="song-page__compare-hint">جرّبنا لك نسختين — استمع لكلٍّ منهما واختر المفضّلة.</p>
            <div className="version-grid">
              <VersionBlock variant="primary" src={pageState.previewUri} download={false} />
              <VersionBlock variant="alt" src={altPreviewUri} download={false} />
            </div>
          </>
        ) : (
          <AudioPlayer src={pageState.previewUri} label="معاينة الأغنية" />
        )}
        {unlockError && (
          <p className="song-page__error" role="alert">{unlockError}</p>
        )}
        {songId && (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => { void handleUnlock() }}
            disabled={unlockLoading}
            aria-busy={unlockLoading}
          >
            {unlockLoading ? 'جاري الفتح…' : 'افتح الأغنية كاملة'}
          </Button>
        )}
        <Link href="/create" className="song-page__cta-link">
          اصنع أغنيتك
        </Link>
      </div>
    )
  }

  // ---- Paywall state ----
  if (pageState.kind === 'paywall') {
    return (
      <div className="song-page song-page--paywall">
        <div className="song-page__tags">
          <Tag color="rose">مقطع تجريبي ٣٠ ثانية</Tag>
        </div>
        {altPreviewUri ? (
          <div className="version-grid">
            <VersionBlock variant="primary" src={pageState.previewUri} download={false} />
            <VersionBlock variant="alt" src={altPreviewUri} download={false} />
          </div>
        ) : (
          <AudioPlayer src={pageState.previewUri} label="معاينة الأغنية" />
        )}
        <div className="song-page__paywall-box">
          <p className="song-page__paywall-intro">
            رصيدك غير كافٍ. اختر باقة لفتح الأغنية كاملة.
          </p>
          {songId && (
            <CreditPackChooser
              songId={songId}
              onClose={() => setPageState({ kind: 'preview', previewUri: pageState.previewUri })}
            />
          )}
        </div>
        <Link href="/create" className="song-page__cta-link">
          اصنع أغنيتك
        </Link>
      </div>
    )
  }

  // ---- Unlocked state ----
  return (
    <div className="song-page song-page--unlocked">
      {altFullUri ? (
        <>
          <p className="song-page__compare-hint">نسختان كاملتان — اختر المفضّلة وحمّلها.</p>
          <div className="version-grid">
            <VersionBlock variant="primary" src={pageState.fullUri} download />
            <VersionBlock variant="alt" src={altFullUri} download />
          </div>
        </>
      ) : (
        <>
          <AudioPlayer src={pageState.fullUri} label="الأغنية كاملة" />
          <div className="song-page__actions">
            <a href={pageState.fullUri} download className="btn btn--ghost btn--md">
              تحميل الأغنية
            </a>
          </div>
        </>
      )}

      {shareUrl && (
        <div className="song-page__actions">
          <button
            className="btn btn--ghost btn--md"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl)
            }}
          >
            نسخ رابط المشاركة
          </button>
        </div>
      )}

      {!ratingDone && (
        <div className="song-page__rating">
          <p className="song-page__rating-label">كيف وجدت الأغنية؟</p>
          <div className="song-page__stars" role="group" aria-label="تقييم الأغنية">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={`song-page__star${rating !== null && rating >= star ? ' song-page__star--active' : ''}`}
                onClick={() => { void handleRate(star) }}
                aria-label={`${star} نجوم`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      )}
      {ratingDone && (
        <p className="song-page__rating-thanks">شكراً على تقييمك!</p>
      )}

      <Link href="/create" className="song-page__cta-link">
        اصنع أغنيتك
      </Link>
    </div>
  )
}
