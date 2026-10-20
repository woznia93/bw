# bradywoz.com

Source code for my personal portfolio site, [bradywoz.com](https://bradywoz.com). It has a short intro, an about page, write-ups of my projects, and my resume.

## Tech stack

- [Next.js 15](https://nextjs.org/) (App Router) with TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/)
- MDX project posts with syntax highlighting via [sugar-high](https://github.com/huozhi/sugar-high)
- [Geist](https://vercel.com/font) font
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
│   ├── og/                # Dynamic Open Graph image generation
│   └── rss/               # RSS feed
├── components/            # Nav, footer, MDX renderer, post list
└── utils/blogUtils.ts     # Reads and parses MDX posts
public/                    # Profile photo and resume PDFs
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

## Deployment

The site is hosted on Vercel. See the [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for details.
