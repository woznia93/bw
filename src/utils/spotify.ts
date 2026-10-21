const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_URL = 'https://api.spotify.com/v1'
const HISTORY_KEY = 'spotify:plays'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const clientId = process.env.SPOTIFY_CLIENT_ID
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN

// Upstash Redis REST credentials. The Vercel Upstash integration sets the KV_* names.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN

export type Track = {
  id: string
  name: string
  artist: string
  album: string
  image?: string
  url: string
  durationMs: number
}

// playlistId is set when the play came from a playlist
export type Play = Track & { playedAt: number; playlistId?: string }

export type Playlist = {
  name: string
  image?: string
  url: string
}

export type NowPlaying = {
  isPlaying: boolean
  track: Track
}

export type WeeklyStats = {
  minutes: number
  plays: number
  topTracks: (Track & { count: number })[]
  topPlaylist?: Playlist & { count: number }
  // 'history' = every play stored in Redis, 'recent' = only Spotify's last 50 plays
  source: 'history' | 'recent'
}

export function isSpotifyConfigured() {
  return Boolean(clientId && clientSecret && refreshToken)
}

export function isHistoryConfigured() {
  return Boolean(redisUrl && redisToken)
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken!,
    }),
  })
  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`)
  }

  const data = await res.json()
  // Refresh a minute early so a token never expires mid-request
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.value
}

async function spotify(path: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
  })
  if (!res.ok) {
    throw new Error(`Spotify request ${path} failed: ${res.status}`)
  }
  return res.status === 204 ? null : res.json()
}

function toTrack(item: any): Track {
  const images = item.album?.images ?? []
  return {
    id: item.id,
    name: item.name,
    artist: item.artists.map((artist: any) => artist.name).join(', '),
    album: item.album?.name ?? '',
    // Spotify lists images largest first; the middle size (~300px) is plenty
    image: (images[1] ?? images[0])?.url,
    url: item.external_urls?.spotify,
    durationMs: item.duration_ms,
  }
}

async function getRecentPlays(): Promise<Play[]> {
  const data = await spotify('/me/player/recently-played?limit=50')
  return (data?.items ?? []).map((item: any) => ({
    ...toTrack(item.track),
    playedAt: new Date(item.played_at).getTime(),
    playlistId:
      item.context?.type === 'playlist'
        ? item.context.uri.split(':').pop()
        : undefined,
  }))
}

export async function getAllTimeTopTracks(limit = 5): Promise<Track[]> {
  const data = await spotify(
    `/me/top/tracks?time_range=long_term&limit=${limit}`
  )
  return (data?.items ?? []).map(toTrack)
}

async function getPlaylist(id: string): Promise<Playlist> {
  const data = await spotify(
    `/playlists/${id}?fields=name,images,external_urls`
  )
  return {
    name: data.name,
    image: data.images?.[0]?.url,
    url: data.external_urls?.spotify,
  }
}

export async function getNowPlaying(): Promise<NowPlaying | null> {
  const current = await spotify('/me/player/currently-playing')
  if (current?.item && current.currently_playing_type === 'track') {
    return { isPlaying: current.is_playing, track: toTrack(current.item) }
  }

  // Nothing playing, so show the last song played instead
  const data = await spotify('/me/player/recently-played?limit=1')
  const last = data?.items?.[0]
  return last ? { isPlaying: false, track: toTrack(last.track) } : null
}

async function redis(command: (string | number)[]) {
  const res = await fetch(redisUrl!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}` },
    body: JSON.stringify(command),
  })
  if (!res.ok) {
    throw new Error(`Redis ${command[0]} failed: ${res.status}`)
  }
  return (await res.json()).result
}

// Spotify only remembers the last 50 plays, so each sync copies them into a Redis
// sorted set (scored by play time) to build up a full week of history.
export async function syncPlays() {
  const plays = await getRecentPlays()

  let added = 0
  if (plays.length > 0) {
    // Identical members are ignored by ZADD, so re-syncing the same plays is a no-op
    const args = plays.flatMap((play) => [play.playedAt, JSON.stringify(play)])
    added = await redis(['ZADD', HISTORY_KEY, ...args])
  }
  // Keep a day of slack past the weekly window
  await redis([
    'ZREMRANGEBYSCORE',
    HISTORY_KEY,
    '-inf',
    Date.now() - WEEK_MS - 24 * 60 * 60 * 1000,
  ])

  // Plays come back newest first
  const latest = plays[0]
  return {
    added,
    fetched: plays.length,
    stored: await redis(['ZCARD', HISTORY_KEY]),
    latest: latest
      ? {
          name: latest.name,
          artist: latest.artist,
          playedAt: new Date(latest.playedAt).toISOString(),
        }
      : null,
  }
}

async function getWeekOfPlays(): Promise<{
  plays: Play[]
  source: WeeklyStats['source']
}> {
  const since = Date.now() - WEEK_MS

  if (isHistoryConfigured()) {
    await syncPlays()
    const members: string[] = await redis([
      'ZRANGE',
      HISTORY_KEY,
      since,
      '+inf',
      'BYSCORE',
    ])
    // played_at is unique per play, so drop any repeats saved with different metadata
    const plays = new Map<number, Play>()
    for (const member of members) {
      const play: Play = JSON.parse(member)
      plays.set(play.playedAt, play)
    }
    return { plays: Array.from(plays.values()), source: 'history' }
  }

  const plays = await getRecentPlays()
  return {
    plays: plays.filter((play) => play.playedAt >= since),
    source: 'recent',
  }
}

export async function getWeeklyStats(limit = 5): Promise<WeeklyStats> {
  const { plays, source } = await getWeekOfPlays()

  const counts = new Map<string, Track & { count: number; lastPlayed: number }>()
  for (const play of plays) {
    const entry = counts.get(play.id)
    if (entry) {
      entry.count += 1
      entry.lastPlayed = Math.max(entry.lastPlayed, play.playedAt)
    } else {
      const { playedAt, ...track } = play
      counts.set(play.id, { ...track, count: 1, lastPlayed: playedAt })
    }
  }

  const topTracks = Array.from(counts.values())
    .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)
    .slice(0, limit)
    .map(({ lastPlayed, ...track }) => track)

  const totalMs = plays.reduce((sum, play) => sum + play.durationMs, 0)

  return {
    minutes: Math.round(totalMs / 60000),
    plays: plays.length,
    topTracks,
    topPlaylist: await getTopPlaylist(plays),
    source,
  }
}

async function getTopPlaylist(
  plays: Play[]
): Promise<WeeklyStats['topPlaylist']> {
  const counts = new Map<string, number>()
  for (const play of plays) {
    if (play.playlistId) {
      counts.set(play.playlistId, (counts.get(play.playlistId) ?? 0) + 1)
    }
  }

  const [top] = Array.from(counts).sort((a, b) => b[1] - a[1])
  if (!top) {
    return undefined
  }

  // Spotify's own editorial and algorithmic playlists can't be looked up through
  // the API, so skip the card rather than show a nameless playlist
  try {
    return { ...(await getPlaylist(top[0])), count: top[1] }
  } catch {
    return undefined
  }
}
