import { isSpotifyConfigured, syncPlays } from '@/utils/spotify'

export const dynamic = 'force-dynamic'

// Called on a schedule (see .github/workflows/spotify-sync.yml) so plays are saved
// even when nobody visits the music page.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isSpotifyConfigured()) {
    return Response.json({ error: 'Spotify is not configured' }, { status: 503 })
  }

  try {
    return Response.json(await syncPlays())
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Sync failed' }, { status: 502 })
  }
}
