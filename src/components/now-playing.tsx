'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import type { NowPlaying as NowPlayingData } from '@/utils/spotify'

const REFRESH_MS = 30 * 1000

function Equalizer() {
  return (
    <span className="equalizer" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

export function NowPlaying() {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/spotify/now-playing')
        const data = await res.json()
        if (!cancelled) setNowPlaying(data.nowPlaying)
      } catch {
        // Keep showing the last known track
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    load()
    const interval = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (!loaded) {
    // Same height as the card so nothing jumps when it loads
    return (
      <div className="h-[82px] rounded-lg border border-neutral-200 dark:border-neutral-800 animate-pulse" />
    )
  }

  if (!nowPlaying) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Not listening to anything right now.
      </p>
    )
  }

  const { isPlaying, track } = nowPlaying

  return (
    <a
      href={track.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
    >
      {track.image && (
        <Image
          src={track.image}
          alt={`${track.album} cover`}
          width={56}
          height={56}
          className="rounded-md shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {isPlaying && <Equalizer />}
          {isPlaying ? 'Now playing' : 'Last played'}
        </p>
        <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">
          {track.name}
        </p>
        <p className="truncate text-sm text-neutral-600 dark:text-neutral-400">
          {track.artist}
        </p>
      </div>
    </a>
  )
}
