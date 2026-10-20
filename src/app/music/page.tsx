import Image from 'next/image'
import { NowPlaying } from '@/components/now-playing'
import {
  getWeeklyStats,
  isSpotifyConfigured,
  type WeeklyStats,
} from '@/utils/spotify'

export const metadata = {
  title: 'Music',
  description: "What I've been listening to on Spotify.",
}

// Rebuild the weekly stats at most every 5 minutes
export const revalidate = 300

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800">
      <p className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">{label}</p>
    </div>
  )
}

function ThisWeek({ stats }: { stats: WeeklyStats }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Stat value={stats.minutes.toLocaleString('en-US')} label="minutes listened" />
        <Stat value={stats.plays.toLocaleString('en-US')} label="songs played" />
      </div>

      {stats.topTracks.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Top songs
          </h3>
          <ol>
            {stats.topTracks.map((track, index) => (
              <li key={track.id}>
                <a
                  href={track.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-mx-2 flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  <span className="w-4 text-right text-sm tabular-nums text-neutral-500">
                    {index + 1}
                  </span>
                  {track.image && (
                    <Image
                      src={track.image}
                      alt={`${track.album} cover`}
                      width={40}
                      height={40}
                      className="rounded shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {track.name}
                    </p>
                    <p className="truncate text-xs text-neutral-600 dark:text-neutral-400">
                      {track.artist}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                    {track.count} {track.count === 1 ? 'play' : 'plays'}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </>
      )}

      {stats.source === 'recent' && (
        <p className="mt-4 text-xs text-neutral-500">
          Based on my 50 most recent plays.
        </p>
      )}
    </>
  )
}

export default async function Page() {
  if (!isSpotifyConfigured()) {
    return (
      <section>
        <h1 className="mb-8 text-2xl font-semibold tracking-tighter">Music</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Spotify isn&apos;t connected yet. Check back soon.
        </p>
      </section>
    )
  }

  let stats: WeeklyStats | null = null
  try {
    stats = await getWeeklyStats()
  } catch (error) {
    console.error(error)
  }

  return (
    <section>
      <h1 className="mb-2 text-2xl font-semibold tracking-tighter">Music</h1>
      <p className="mb-8 text-neutral-600 dark:text-neutral-400">
        What I&apos;ve been listening to lately, live from Spotify.
      </p>

      <NowPlaying />

      <h2 className="mt-10 mb-4 text-lg font-semibold tracking-tight">
        This week
      </h2>
      {stats ? (
        <ThisWeek stats={stats} />
      ) : (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Couldn&apos;t load listening stats right now.
        </p>
      )}
    </section>
  )
}
