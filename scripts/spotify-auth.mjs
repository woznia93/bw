// One-time helper that prints a Spotify refresh token for the music page.
//
// 1. Add http://127.0.0.1:8888/callback as a Redirect URI in your Spotify app.
// 2. Run: SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/spotify-auth.mjs
// 3. Open the printed link, approve access, and copy the refresh token it prints.

import http from 'node:http'

const clientId = process.env.SPOTIFY_CLIENT_ID
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
const port = 8888
const redirectUri = `http://127.0.0.1:${port}/callback`
const scopes = 'user-read-currently-playing user-read-recently-played'

if (!clientId || !clientSecret) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.')
  process.exit(1)
}

const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
  client_id: clientId,
  response_type: 'code',
  redirect_uri: redirectUri,
  scope: scopes,
})}`

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri)
  if (url.pathname !== '/callback') {
    res.writeHead(404).end()
    return
  }

  const code = url.searchParams.get('code')
  if (!code) {
    res.end(`Authorization failed: ${url.searchParams.get('error')}`)
    server.close()
    return
  }

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  const data = await tokenRes.json()

  if (data.refresh_token) {
    console.log(`\nSPOTIFY_REFRESH_TOKEN=${data.refresh_token}\n`)
    res.end('Done! Copy the refresh token from your terminal.')
  } else {
    console.error('Token exchange failed:', data)
    res.end('Token exchange failed, see your terminal.')
  }
  server.close()
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Open this link to authorize:\n\n${authUrl}\n`)
})
