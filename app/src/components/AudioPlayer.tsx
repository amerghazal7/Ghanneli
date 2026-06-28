'use client'

import { useEffect, useRef, useState } from 'react'
import { Waveform } from './Waveform'

interface AudioPlayerProps {
  src: string
  label?: string
  className?: string
}

export function AudioPlayer({ src, label, className = '' }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const onTimeUpdate = () => {
      if (el.duration) setProgress(el.currentTime / el.duration)
    }
    const onDurationChange = () => setDuration(el.duration)
    const onEnded = () => setPlaying(false)

    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('durationchange', onDurationChange)
    el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('durationchange', onDurationChange)
      el.removeEventListener('ended', onEnded)
    }
  }, [src])

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      void el.play()
      setPlaying(true)
    }
  }

  function handleScrubClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    // Keep LTR progress (0=start, 1=end) matching the audio timeline
    const x = e.clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    el.currentTime = ratio * duration
    setProgress(ratio)
  }

  const currentTime = audioRef.current?.currentTime ?? 0
  const minutes = Math.floor(currentTime / 60)
  const seconds = Math.floor(currentTime % 60)
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <div className={`audio-player ${className}`.trim()}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Waveform scrubber — click handled on wrapper div */}
      <div
        ref={wrapRef}
        className="audio-player__scrubber"
        onClick={handleScrubClick}
        role="presentation"
      >
        <Waveform
          mode="progress"
          value={progress}
          aria-label={label ?? 'مشغّل الأغنية'}
        />
      </div>

      <div className="audio-player__controls">
        <button
          className="audio-player__play-btn"
          onClick={togglePlay}
          aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <span className="audio-player__time" aria-live="off">{timeStr}</span>
      </div>
    </div>
  )
}
