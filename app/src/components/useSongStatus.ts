'use client'

import { useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 3000

export interface SongStatusState {
  status: string | null
  previewUri: string | null
  error: boolean
}

export function useSongStatus(songId: string | null): SongStatusState {
  const [state, setState] = useState<SongStatusState>({
    status: null,
    previewUri: null,
    error: false,
  })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!songId) return

    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/songs/${songId}/status`)
        if (cancelled) return

        if (!res.ok) {
          setState((s) => ({ ...s, error: true }))
          return
        }

        const data = (await res.json()) as { status: string; previewUri?: string }
        if (cancelled) return

        setState({ status: data.status, previewUri: data.previewUri ?? null, error: false })

        // Keep polling unless terminal
        if (data.status !== 'ready' && data.status !== 'failed') {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, error: true }))
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [songId])

  return state
}
