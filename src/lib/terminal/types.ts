export type Tone = 'normal' | 'dim' | 'accent' | 'accent2' | 'ok' | 'err'

export type Seg = {
  text: string
  tone?: Tone
  // Makes the segment a link: a path stays on the site, anything else opens a new tab
  href?: string
  // On a line's first segment: wrapped text lines up this many characters in
  hang?: number
}

export type Line = Seg[]

export type Project = {
  slug: string
  title: string
  publishedAt: string
  summary: string
  github?: string
  content: string
}

export type Effect =
  | { type: 'navigate'; path: string }
  | { type: 'external'; url: string }
  | { type: 'clear' }
  | { type: 'theme'; name: string }
  | { type: 'close' }

export type Session = {
  cwd: string[]
  projects: Project[]
  theme: string
  history: string[]
  startedAt: number
  now: number
}

export type Result = {
  out: Line[]
  effects?: Effect[]
  cwd?: string[]
}
