// Content and themes for the interactive terminal (press Ctrl+K or ~).
// Projects are read from the blog posts, so everything else lives here.

export const PROFILE = {
  name: 'Brady Wozniak',
  user: 'brady',
  host: 'portfolio',
  tagline: 'software developer · machine learning & AI',
}

export const LINKS = {
  github: 'https://github.com/woznia93',
  linkedin: 'https://www.linkedin.com/in/bradywozniak/',
  source: 'https://github.com/woznia93/bw',
  // The raw PDF, and the page on this site that shows it
  resume: '/wozresume.pdf',
  resumePage: '/resume',
}

export const ABOUT = [
  "I'm a software developer with a strong passion for machine learning and artificial intelligence. I love exploring how new technologies will affect the future of tech.",
  "I've been drawn to computers for as long as I can remember, starting with exploring how technology works and eventually teaching myself to program discord bots. That early curiosity grew into a passion for building software, experimenting with new tools, and creating projects that challenge me to learn more.",
]

export const FOCUS = [
  'Machine Learning & AI',
  'Full-stack Development',
  'Back-end Development',
]

export const LANGUAGES = ['C++', 'CUDA', 'Python', 'JavaScript', 'TypeScript']
export const TOOLS = ['FastAPI', 'React', 'Next.js', 'Tailwind CSS', 'Raspberry Pi']

// Add entries here and `experience` will list them, e.g.
// { role: 'Software Engineering Intern', org: 'Company', period: 'Summer 2026', summary: '...' }
export const EXPERIENCE: {
  role: string
  org: string
  period: string
  summary: string
}[] = []

// Pages the `open` command can jump to
export const PAGES: Record<string, string> = {
  home: '/',
  about: '/about',
  projects: '/blog',
  music: '/music',
}

export type Theme = {
  label: string
  vars: Record<string, string>
}

// Default is blue on black to match the site
export const THEMES: Record<string, Theme> = {
  blue: {
    label: 'Black and blue (default)',
    vars: {
      '--t-bg': '#050a14',
      '--t-bar': '#0a1426',
      '--t-border': '#1e3a66',
      '--t-fg': '#cfe3ff',
      '--t-dim': '#6f8bb3',
      '--t-accent': '#47a3f3',
      '--t-accent2': '#8cc8ff',
      '--t-ok': '#5eead4',
      '--t-err': '#ff7b8a',
    },
  },
  ice: {
    label: 'Pale blue on navy',
    vars: {
      '--t-bg': '#0b1a33',
      '--t-bar': '#10264a',
      '--t-border': '#2a4d86',
      '--t-fg': '#e3efff',
      '--t-dim': '#86a3cc',
      '--t-accent': '#7cc0ff',
      '--t-accent2': '#b9dcff',
      '--t-ok': '#7ff0d8',
      '--t-err': '#ff8f9c',
    },
  },
  matrix: {
    label: 'Green on black',
    vars: {
      '--t-bg': '#020a04',
      '--t-bar': '#06160a',
      '--t-border': '#14532d',
      '--t-fg': '#b7f7c5',
      '--t-dim': '#4f9a66',
      '--t-accent': '#22e55c',
      '--t-accent2': '#7dffa0',
      '--t-ok': '#22e55c',
      '--t-err': '#ff7b8a',
    },
  },
  amber: {
    label: 'Amber on black',
    vars: {
      '--t-bg': '#0d0802',
      '--t-bar': '#1a1004',
      '--t-border': '#6b4a12',
      '--t-fg': '#ffe2a8',
      '--t-dim': '#a8833d',
      '--t-accent': '#ffb000',
      '--t-accent2': '#ffd37a',
      '--t-ok': '#9be564',
      '--t-err': '#ff7b6b',
    },
  },
}
