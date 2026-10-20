import { getNowPlaying, isSpotifyConfigured } from '@/utils/spotify'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isSpotifyConfigured()) {
    return Response.json({ configured: false, nowPlaying: null })
  }

  try {
    const nowPlaying = await getNowPlaying()
    return Response.json(
      { configured: true, nowPlaying },
      // Let the CDN share one response across visitors for a short while
      { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' } }
    )
  } catch (error) {
    console.error(error)
    return Response.json({ configured: true, nowPlaying: null }, { status: 502 })
  }
}
