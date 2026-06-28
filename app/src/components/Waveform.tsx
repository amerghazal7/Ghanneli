'use client'

import { useEffect, useRef, useState } from 'react'

export type WaveformMode = 'ambient' | 'active' | 'progress'

interface WaveformProps {
  mode: WaveformMode
  /** 0..1, only used when mode === 'progress' */
  value?: number
  className?: string
  'aria-label'?: string
}

// Bar heights (normalized 0..1) — 40 bars, hand-tuned to look like a real waveform
const BASE_HEIGHTS = [
  0.25, 0.40, 0.60, 0.80, 0.55, 0.70, 0.45, 0.90, 0.65, 0.75,
  0.50, 0.85, 0.40, 0.95, 0.70, 0.60, 0.80, 0.35, 0.75, 0.55,
  0.65, 0.90, 0.45, 0.70, 0.85, 0.55, 0.40, 0.80, 0.60, 0.75,
  0.90, 0.50, 0.65, 0.85, 0.45, 0.70, 0.35, 0.80, 0.55, 0.30,
]

const BAR_COUNT = BASE_HEIGHTS.length
const SVG_WIDTH = 400
const SVG_HEIGHT = 64
const BAR_GAP = 3
const BAR_WIDTH = (SVG_WIDTH - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT

export function Waveform({
  mode,
  value = 0,
  className = '',
  'aria-label': ariaLabel,
}: WaveformProps) {
  const animFrameRef = useRef<number | null>(null)
  const timeRef = useRef(0)
  const [heights, setHeights] = useState<number[]>(BASE_HEIGHTS)
  const [tick, setTick] = useState(0)

  // Detect reduced motion once, client-side
  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  useEffect(() => {
    if (prefersReducedMotion) return
    if (mode === 'ambient' || mode === 'active') {
      let running = true
      const speed = mode === 'ambient' ? 0.5 : 2.5

      function step(ts: number) {
        if (!running) return
        timeRef.current = ts * 0.001 * speed

        const next = BASE_HEIGHTS.map((base, i) => {
          const phase = (i / BAR_COUNT) * Math.PI * 2
          const wave = Math.sin(timeRef.current + phase) * 0.15
          return Math.max(0.1, Math.min(1, base + wave))
        })
        setHeights(next)
        animFrameRef.current = requestAnimationFrame(step)
      }

      animFrameRef.current = requestAnimationFrame(step)
      return () => {
        running = false
        if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [mode, prefersReducedMotion])

  // For active mode: a bright pulse that sweeps left→right
  useEffect(() => {
    if (prefersReducedMotion || mode !== 'active') return
    const id = setInterval(() => setTick((t) => t + 1), 80)
    return () => clearInterval(id)
  }, [mode, prefersReducedMotion])

  const clampedValue = Math.max(0, Math.min(1, value))
  const filledBars = Math.round(clampedValue * BAR_COUNT)

  // For active: a "lit" bar sweeps left→right
  const activePulseIdx = mode === 'active' ? tick % BAR_COUNT : -1

  return (
    <svg
      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      className={className}
      role="img"
      aria-label={ariaLabel ?? (mode === 'progress' ? `تقدم التشغيل ${Math.round(clampedValue * 100)}%` : 'موجة صوتية')}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      {heights.map((h, i) => {
        const barH = Math.max(4, h * SVG_HEIGHT)
        const x = i * (BAR_WIDTH + BAR_GAP)
        const y = (SVG_HEIGHT - barH) / 2

        let fill: string
        if (mode === 'progress') {
          fill = i < filledBars ? 'var(--gold)' : 'var(--surface-2)'
        } else if (mode === 'active') {
          const dist = Math.abs(i - activePulseIdx)
          if (dist === 0) fill = '#FFFFFF'
          else if (dist <= 2) fill = 'var(--gold)'
          else fill = 'var(--gold-deep)'
        } else {
          // ambient
          fill = 'var(--gold)'
        }

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={BAR_WIDTH}
            height={barH}
            rx={BAR_WIDTH / 2}
            fill={fill}
            opacity={mode === 'ambient' ? 0.85 : 1}
          />
        )
      })}
    </svg>
  )
}
