# bradywoz.com

Source code for my personal portfolio site, [bradywoz.com](https://bradywoz.com). It has a short intro, an about page, write-ups of my projects, a music page with live Spotify listening stats, and my resume.

## Tech stack

- [Next.js 15](https://nextjs.org/) (App Router) with TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/)
- MDX project posts with syntax highlighting via [sugar-high](https://github.com/huozhi/sugar-high)
- [Geist](https://vercel.com/font) font
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) for the music page, with optional [Upstash Redis](https://upstash.com/) for listening history
- Vercel Web Analytics and Speed Insights
- Hosted on [Vercel](https://vercel.com/)

## Project structure

```
src/
├── app/
│   ├── page.tsx           # Home page
│   ├── about/             # About page
│   ├── blog/              # Projects list and individual project pages
│   │   └── posts/         # Project write-ups (.mdx)
│   ├── music/             # Now playing and weekly Spotify stats
│   ├── api/spotify/       # Now-playing and history sync endpoints
│   ├── og/                # Dynamic Open Graph image generation
│   └── rss/               # RSS feed
├── components/            # Nav, footer, MDX renderer, post list, now playing
└── utils/
    ├── blogUtils.ts       # Reads and parses MDX posts
    └── spotify.ts         # Spotify API and listening history
public/                    # Profile photo and resume PDFs
scripts/spotify-auth.mjs   # One-time helper to get a Spotify refresh token
```

## Getting started

Requires Node.js 18.18+ and [pnpm](https://pnpm.io/installation).

```bash
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Start the dev server (Turbopack)     |
| `pnpm build`     | Create a production build            |
| `pnpm start`     | Serve the production build           |
| `pnpm lint`      | Run ESLint                           |
| `pnpm typecheck` | Type-check with `tsc`                |

A Husky pre-commit hook runs `pnpm lint` and `pnpm typecheck`.

## Adding a project post

Create a new `.mdx` file in `src/app/blog/posts/`. The file name becomes the URL slug (`/blog/<file-name>`). Start it with frontmatter:

```mdx
---
title: "Project title"
publishedAt: "2025-01-01"
summary: "One-sentence description shown in the project list."
author: "Brady Wozniak"
github: "https://github.com/woznia93/your-repo"
recommended: true
---

Post content goes here.
```

`title`, `publishedAt` and `summary` are required. `image`, `author`, `github` and `recommended` are optional.

## Music page setup

The `/music` page shows what I'm currently playing; minutes listened, top songs and most played playlist for the past week; and my all-time top songs. It needs a few environment variables (see `.env.example`). Put them in `.env.local` for local development and in the Vercel project settings for production.

1. **Create a Spotify app** at the [Spotify developer dashboard](https://developer.spotify.com/dashboard). Add `http://127.0.0.1:8888/callback` as a Redirect URI and select the Web API.
2. **Get a refresh token** by running the helper script and opening the link it prints:
   ```bash
   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/spotify-auth.mjs
   ```
3. **Set** `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REFRESH_TOKEN`.

That's enough for the page to work. Spotify's API only returns the 50 most recent plays, though, so without the next steps the weekly stats only cover those 50 plays.

**For a full week of history (optional):**

4. **Create a free Upstash Redis database**, either at [upstash.com](https://upstash.com/) or from the Vercel Marketplace, and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The Vercel integration's `KV_REST_API_URL` and `KV_REST_API_TOKEN` work too.
5. **Schedule syncing.** Pick a random string and set it as `CRON_SECRET` in Vercel and as a `CRON_SECRET` repository secret in GitHub (Settings → Secrets and variables → Actions). The `Spotify sync` workflow then saves recent plays every 30 minutes. Plays are also saved whenever the music page refreshes.

## Deployment

The site is hosted on Vercel. See the [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for details.
