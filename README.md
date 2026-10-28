# bradywoz.com

Source code for my personal portfolio site, [bradywoz.com](https://bradywoz.com). It has a short intro, an about page, write-ups of my projects, a music page with live Spotify listening stats, an interactive terminal, and my resume.

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
│   ├── resume/            # On-site PDF viewer for the resume
│   ├── playground/        # Neural network playground (in progress, hidden)
│   ├── api/spotify/       # Now-playing and history sync endpoints
│   ├── api/terminal/      # Project content the terminal loads when opened
│   ├── og/                # Dynamic Open Graph image generation
│   └── rss/               # RSS feed
├── components/            # Nav, footer, MDX renderer, post list, now playing, resume viewer
│   └── terminal/          # Terminal window, launcher button and keyboard handling
├── data/terminal.ts       # Terminal content (about, skills, experience) and color themes
├── lib/terminal/          # Command parser, commands, virtual filesystem, tab completion
├── lib/playground/        # Playground types, datasets, autograd and the reference engine
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

## Neural network playground (in progress)

`/playground` will let visitors configure, train and inspect a small neural network in the browser. It's being built in ordered steps, tracked in [#13](https://github.com/woznia93/bw/issues/13), and stays hidden (not linked, `noindex`) until the last step. The design is in [`docs/playground.md`](docs/playground.md).

Run the tests with `pnpm test`. The playground's TypeScript engine (`src/lib/playground/`) follows the C++ engine in [gpu_nn_framework](https://github.com/woznia93/gpu_nn_framework) and is checked against numbers produced by the real C++ code (`cpp/golden/`) as well as against finite differences.

## Resume viewer

The `resume` tab opens `/resume`, which shows `public/wozresume.pdf` inside the site (rendered with [pdf.js](https://mozilla.github.io/pdf.js/)) instead of the browser's built-in PDF page. Text can be selected, the links in the PDF are clickable, and there are zoom and download buttons. pdf.js only loads on that page. To update the resume, replace the PDF in `public/` (or point `LINKS.resume` in `src/data/terminal.ts` at a different file). The raw file is still available at `/wozresume.pdf`.

## Interactive terminal

Press `Ctrl+K` (or `Cmd+K`, or `~`) anywhere on the site, or click the `>_` button in the bottom-right corner, to open a terminal for exploring the portfolio. It's a second way to navigate, so the normal site works exactly as before. It opens as a centered window that can be dragged by its title bar (double-click the bar to re-center it) or expanded to full screen, and it's full screen on phones.

Try `help`, `projects`, `neofetch`, `ls`, `cd projects`, `cat about.md`, `tree`, `grep CUDA`, `open <project>`, `resume` and `theme matrix`. Tab completes commands and paths, the up and down arrows browse history, `Ctrl+L` clears the screen and `Esc` closes it.

- **Nothing runs on a real shell.** Input is only matched against a fixed list of commands in `src/lib/terminal/commands.ts`, and the folders and files are a virtual filesystem built from the portfolio content (`src/lib/terminal/filesystem.ts`). There's no backend beyond one static route that serves the project posts.
- **Add a command** by adding an entry to the `commands` object in `src/lib/terminal/commands.ts`. It receives the arguments and the current session and returns lines to print, plus optional effects such as opening a page.
- **Edit the content** (about text, skills, experience, links, color themes) in `src/data/terminal.ts`. Projects come from the posts in `src/app/blog/posts/`, so new posts show up in the terminal automatically. `experience` lists whatever is in `EXPERIENCE` and otherwise points to the resume.
- **Themes:** the default is blue on black to match the site. `theme` lists the others, and the choice is remembered in the browser.
- **Performance:** the terminal's code and project content only load the first time it's opened, so page load is unaffected.

## Music page setup

The `/music` page shows what I'm currently playing; minutes listened, top songs and most played playlist for the current week (Sunday 12 am to Sunday 12 am, in `SPOTIFY_TIMEZONE`, default `America/New_York`); and my all-time top songs. It needs a few environment variables (see `.env.example`). Put them in `.env.local` for local development and in the Vercel project settings for production.

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

   The workflow calls `https://bradywoz.com` by default. If the site redirects to another address (such as `https://www.bradywoz.com`), add a `SITE_URL` repository variable (the Variables tab next to Secrets) set to the final address, or the sync won't reach the site.

## Deployment

The site is hosted on Vercel. See the [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for details.
