import Image from 'next/image'
import { NowPlaying } from '@/components/now-playing'
import {
  getAllTimeTopTracks,
  getWeeklyStats,
  isSpotifyConfigured,
  type Track,
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

function TrackList({ tracks }: { tracks: (Track & { count?: number })[] }) {
  return (
    <ol>
      {tracks.map((track, index) => (
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
            {track.count !== undefined && (
              <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                {track.count} {track.count === 1 ? 'play' : 'plays'}
              </span>
            )}
          </a>
        </li>
      ))}
    </ol>
  )
}

function PlaylistCard({
  playlist,
}: {
  playlist: NonNullable<WeeklyStats['topPlaylist']>
}) {
  return (
    <a
      href={playlist.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-6 flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
    >
      {playlist.image && (
        <Image
          src={playlist.image}
          alt={`${playlist.name} cover`}
          width={40}
          height={40}
          className="rounded shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Most played playlist
        </p>
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {playlist.name}
        </p>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-neutral-500">
        {playlist.count} {playlist.count === 1 ? 'play' : 'plays'}
      </span>
    </a>
  )
}

function ThisWeek({ stats }: { stats: WeeklyStats }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Stat value={stats.minutes.toLocaleString('en-US')} label="minutes listened" />
        <Stat value={stats.plays.toLocaleString('en-US')} label="songs played" />
      </div>

      {stats.topPlaylist ? (
        <PlaylistCard playlist={stats.topPlaylist} />
      ) : (
        <div className="mb-6" />
      )}

      {stats.topTracks.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Top songs
          </h3>
          <TrackList tracks={stats.topTracks} />
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

  // Load each section separately so one failing doesn't hide the other
  const [stats, allTime] = await Promise.all([
    getWeeklyStats().catch((error) => {
      console.error(error)
      return null
    }),
    getAllTimeTopTracks().catch((error) => {
      console.error(error)
      return []
    }),
  ])

  return (
    <section>
      <h1 className="mb-2 text-2xl font-semibold tracking-tighter">Music</h1>
      <p className="mb-8 text-neutral-600 dark:text-neutral-400">
        What I&apos;ve been listening to lately, live from Spotify.
      </p>

      <NowPlaying />

      <h2 className="mt-10 mb-4 flex items-baseline justify-between text-lg font-semibold tracking-tight">
        This week
        {stats && (
          <span className="text-xs font-normal text-neutral-500">
            since {stats.since} · resets Sunday
          </span>
        )}
      </h2>
      {stats ? (
        <ThisWeek stats={stats} />
      ) : (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Couldn&apos;t load listening stats right now.
        </p>
      )}

      {allTime.length > 0 && (
        <>
          <h2 className="mt-10 mb-4 text-lg font-semibold tracking-tight">
            All time
          </h2>
          <TrackList tracks={allTime} />
        </>
      )}
    </section>
  )
}
