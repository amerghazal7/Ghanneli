'use client'

interface PlayerProps {
  src: string
}

export function Player({ src }: PlayerProps) {
  return (
    <div>
      <p>معاينة مائية — للاستماع الكامل اشترِ النسخة الكاملة</p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls src={src} />
    </div>
  )
}
