import {
  ABOUT,
  EXPERIENCE,
  FOCUS,
  LANGUAGES,
  LINKS,
  PAGES,
  PROFILE,
  THEMES,
  TOOLS,
} from '@/data/terminal'
import {
  buildFilesystem,
  displayPath,
  getNode,
  resolvePath,
  type FsNode,
} from './filesystem'
import { splitFlags, tokenize } from './parser'
import type { Line, Result, Seg, Session, Tone } from './types'

const t = (text: string, tone: Tone = 'normal', href?: string): Seg => ({
  text,
  tone,
  href,
})
const hang = (seg: Seg, width: number): Seg => ({ ...seg, hang: width })
const text = (value: string, tone: Tone = 'normal'): Line => [t(value, tone)]
const blank: Line = []

type Handler = (args: string[], session: Session, fs: FsNode) => Result

type Command = { desc: string; usage?: string; run: Handler }

const isExternal = (href: string) => /^https?:/.test(href) || href.endsWith('.pdf')

function sortedProjects(session: Session) {
  return session.projects
    .slice()
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
}

function describeUptime(ms: number) {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just started'
  return `${minutes} min${minutes === 1 ? '' : 's'}`
}

function walk(node: FsNode, path: string[], visit: (path: string[], node: FsNode) => void) {
  visit(path, node)
  if (node.type === 'dir') {
    Object.keys(node.children)
      .sort()
      .forEach((name) => walk(node.children[name], path.concat(name), visit))
  }
}

function sortedEntries(node: FsNode & { type: 'dir' }) {
  const names = Object.keys(node.children)
  const dirs = names.filter((name) => node.children[name].type === 'dir').sort()
  const files = names.filter((name) => node.children[name].type === 'file').sort()
  return { dirs, files }
}

const NEOFETCH_ART = [
  ' ____  __        __ ',
  '| __ ) \\ \\      / / ',
  '|  _ \\  \\ \\ /\\ / /  ',
  '| |_) |  \\ V  V /   ',
  '|____/    \\_/\\_/    ',
]

const commands: Record<string, Command> = {
  help: {
    desc: 'List all commands',
    run: () => ({
      out: [
        text('Available commands:'),
        ...Object.keys(commands).map((name): Line => [
          t(`  ${name.padEnd(12)}`, 'accent'),
          t(commands[name].desc),
        ]),
        blank,
        text('Tab completes, ↑/↓ browse history, Ctrl+L clears, Esc closes.', 'dim'),
      ],
    }),
  },

  about: {
    desc: 'Learn about me',
    run: () => ({
      out: ABOUT.flatMap((paragraph): Line[] => [text(paragraph), blank]).slice(0, -1),
    }),
  },

  whoami: {
    desc: 'Short introduction',
    run: () => ({
      out: [
        [t(PROFILE.name, 'accent2'), t(` · ${PROFILE.tagline}`)],
        text("Type 'about' to read more or 'projects' to see my work.", 'dim'),
      ],
    }),
  },

  neofetch: {
    desc: 'System information',
    run: (_, session) => {
      const info: Line[] = [
        [t(`${PROFILE.user}@${PROFILE.host}`, 'accent2')],
        [t('-'.repeat(PROFILE.user.length + PROFILE.host.length + 1), 'dim')],
        [t('OS       ', 'accent'), t('bradywoz.com')],
        [t('Shell    ', 'accent'), t('bradysh 1.0')],
        [t('Projects ', 'accent'), t(String(session.projects.length))],
        [t('Focus    ', 'accent'), t('ML / AI, full-stack')],
        [t('Langs    ', 'accent'), t(LANGUAGES.slice(0, 3).join(', '))],
        [t('Theme    ', 'accent'), t(session.theme)],
        [t('Uptime   ', 'accent'), t(describeUptime(session.now - session.startedAt))],
        blank,
        [
          t('███', 'dim'),
          t('███', 'accent'),
          t('███', 'accent2'),
          t('███', 'ok'),
          t('███', 'err'),
        ],
      ]

      const out: Line[] = []
      const rows = Math.max(info.length, NEOFETCH_ART.length + 1)
      for (let i = 0; i < rows; i++) {
        const art = NEOFETCH_ART[i - 1] ?? ''
        out.push([t(art.padEnd(NEOFETCH_ART[0].length + 2), 'accent'), ...(info[i] ?? [])])
      }
      return { out }
    },
  },

  projects: {
    desc: 'List my projects',
    run: (_, session) => {
      const list = sortedProjects(session)
      if (list.length === 0) {
        return { out: [text('Loading projects… try again in a second.', 'dim')] }
      }
      const width = Math.max(...list.map((project) => project.slug.length)) + 2
      const out: Line[] = []
      list.forEach((project) => {
        out.push([
          hang(t(`  ${project.slug.padEnd(width)}`, 'accent'), width + 2),
          t(project.title, 'normal'),
          t(`  ${project.publishedAt}`, 'dim'),
        ])
        out.push([hang(t(`  ${' '.repeat(width)}${project.summary}`, 'dim'), width + 2)])
      })
      out.push(blank, text("Read one with 'open <name>', for example: open " + list[0].slug, 'dim'))
      return { out }
    },
  },

  experience: {
    desc: 'Work experience',
    run: () => {
      if (EXPERIENCE.length === 0) {
        return {
          out: [
            text('No experience listed here yet. My full history is on my resume.'),
            text("Type 'resume' to open it.", 'dim'),
          ],
        }
      }
      const out: Line[] = []
      EXPERIENCE.forEach((job) => {
        out.push([t(job.role, 'accent2'), t(` · ${job.org}`), t(`  ${job.period}`, 'dim')])
        out.push(text(`  ${job.summary}`, 'dim'))
      })
      return { out }
    },
  },

  skills: {
    desc: 'Technical skills',
    usage: 'skills [--lang | --tools]',
    run: (args) => {
      const { flags } = splitFlags(args)
      const languages: Line = [t('Languages  ', 'accent'), t(LANGUAGES.join(', '))]
      const tools: Line = [t('Tools      ', 'accent'), t(TOOLS.join(', '))]
      if (flags.includes('--lang')) return { out: [languages] }
      if (flags.includes('--tools')) return { out: [tools] }
      return {
        out: [
          [t('Focus      ', 'accent'), t(FOCUS.join(' · '))],
          languages,
          tools,
        ],
      }
    },
  },

  contact: {
    desc: 'Contact information',
    run: () => ({
      out: [
        [t('GitHub    ', 'accent'), t(LINKS.github, 'normal', LINKS.github)],
        [t('LinkedIn  ', 'accent'), t(LINKS.linkedin, 'normal', LINKS.linkedin)],
      ],
    }),
  },

  ls: {
    desc: 'List files and folders',
    usage: 'ls [path]',
    run: (args, session, fs) => {
      const target = splitFlags(args).rest[0]
      const path = target ? resolvePath(session.cwd, target) : session.cwd
      const node = getNode(fs, path)
      if (!node) {
        return { out: [text(`ls: cannot access '${target}': No such file or directory`, 'err')] }
      }
      if (node.type === 'file') {
        return { out: [text(path[path.length - 1])] }
      }
      const { dirs, files } = sortedEntries(node)
      const segs: Seg[] = []
      dirs.forEach((name) => segs.push(t(`${name}/`, 'accent'), t('  ')))
      files.forEach((name) => segs.push(t(name), t('  ')))
      return { out: segs.length ? [segs] : [] }
    },
  },

  cd: {
    desc: 'Change directory',
    usage: 'cd [path]',
    run: (args, session, fs) => {
      const target = args[0]
      if (!target) return { out: [], cwd: [] }
      const path = resolvePath(session.cwd, target)
      const node = getNode(fs, path)
      if (!node) return { out: [text(`cd: no such file or directory: ${target}`, 'err')] }
      if (node.type === 'file') return { out: [text(`cd: not a directory: ${target}`, 'err')] }
      return { out: [], cwd: path }
    },
  },

  pwd: {
    desc: 'Print the current directory',
    run: (_, session) => ({
      out: [text(`/home/${PROFILE.user}${session.cwd.map((part) => `/${part}`).join('')}`)],
    }),
  },

  cat: {
    desc: 'Read a file',
    usage: 'cat <file>',
    run: (args, session, fs) => {
      if (args.length === 0) return { out: [text('usage: cat <file>', 'dim')] }
      const out: Line[] = []
      args.forEach((target) => {
        const node = getNode(fs, resolvePath(session.cwd, target))
        if (!node) out.push(text(`cat: ${target}: No such file or directory`, 'err'))
        else if (node.type === 'dir') out.push(text(`cat: ${target}: Is a directory`, 'err'))
        else node.content.split('\n').forEach((row) => out.push(text(row)))
      })
      return { out }
    },
  },

  tree: {
    desc: 'Show the folder structure',
    usage: 'tree [path]',
    run: (args, session, fs) => {
      const target = args[0]
      const path = target ? resolvePath(session.cwd, target) : session.cwd
      const root = getNode(fs, path)
      if (!root) return { out: [text(`tree: ${target}: No such file or directory`, 'err')] }
      if (root.type === 'file') return { out: [text(path[path.length - 1])] }

      const out: Line[] = [[t(displayPath(path), 'accent')]]
      let dirCount = 0
      let fileCount = 0
      const draw = (node: FsNode & { type: 'dir' }, prefix: string) => {
        const { dirs, files } = sortedEntries(node)
        const names = dirs.concat(files)
        names.forEach((name, index) => {
          const last = index === names.length - 1
          const child = node.children[name]
          const branch = last ? '└── ' : '├── '
          out.push([
            t(prefix + branch, 'dim'),
            t(child.type === 'dir' ? `${name}/` : name, child.type === 'dir' ? 'accent' : 'normal'),
          ])
          if (child.type === 'dir') {
            dirCount++
            draw(child, prefix + (last ? '    ' : '│   '))
          } else {
            fileCount++
          }
        })
      }
      draw(root, '')
      out.push(blank, text(`${dirCount} directories, ${fileCount} files`, 'dim'))
      return { out }
    },
  },

  grep: {
    desc: 'Search the portfolio',
    usage: 'grep [-i] <text> [path]',
    run: (args, session, fs) => {
      const { flags, rest } = splitFlags(args)
      const pattern = rest[0]
      if (!pattern) return { out: [text('usage: grep [-i] <text> [path]', 'dim')] }
      const ignoreCase = flags.includes('-i')
      const needle = ignoreCase ? pattern.toLowerCase() : pattern

      const start = rest[1] ? resolvePath(session.cwd, rest[1]) : session.cwd
      const node = getNode(fs, start)
      if (!node) return { out: [text(`grep: ${rest[1]}: No such file or directory`, 'err')] }

      const out: Line[] = []
      let total = 0
      walk(node, start, (path, current) => {
        if (current.type !== 'file') return
        current.content.split('\n').forEach((row, index) => {
          const haystack = ignoreCase ? row.toLowerCase() : row
          if (!haystack.includes(needle)) return
          total++
          if (out.length < 25) {
            out.push([t(`${path.join('/')}:${index + 1}: `, 'accent'), t(row.trim())])
          }
        })
      })
      if (total === 0) return { out: [text(`No matches for '${pattern}'.`, 'dim')] }
      if (total > out.length) out.push(text(`… and ${total - out.length} more`, 'dim'))
      return { out }
    },
  },

  open: {
    desc: 'Open a page, project or link',
    usage: 'open <page | project | file>',
    run: (args, session, fs) => {
      const target = args[0]
      if (!target) {
        return {
          out: [
            text('usage: open <name>', 'dim'),
            [t('pages     ', 'accent'), t(Object.keys(PAGES).join(', '))],
            [t('links     ', 'accent'), t('resume, github, linkedin')],
            [
              t('projects  ', 'accent'),
              t(session.projects.map((project) => project.slug).join(', ') || '…'),
            ],
          ],
        }
      }

      const go = (href: string): Result =>
        isExternal(href)
          ? { out: [text(`Opening ${href}`, 'dim')], effects: [{ type: 'external', url: href }] }
          : { out: [text(`Opening ${href}`, 'dim')], effects: [{ type: 'navigate', path: href }] }

      const key = target.toLowerCase()
      if (PAGES[key]) return go(PAGES[key])
      if (key === 'resume') return go(LINKS.resume)
      if (key === 'github') return go(LINKS.github)
      if (key === 'linkedin') return go(LINKS.linkedin)

      const matches = session.projects.filter(
        (project) => project.slug === key || project.slug.startsWith(key)
      )
      const exact = matches.find((project) => project.slug === key)
      const project = exact ?? (matches.length === 1 ? matches[0] : undefined)
      if (project) return go(`/blog/${project.slug}`)
      if (matches.length > 1) {
        return {
          out: [text(`open: '${target}' matches ${matches.map((m) => m.slug).join(', ')}`, 'err')],
        }
      }

      const node = getNode(fs, resolvePath(session.cwd, target))
      if (node?.href) return go(node.href)
      return { out: [text(`open: ${target}: not found. Try 'open' on its own for a list.`, 'err')] }
    },
  },

  resume: {
    desc: 'Open my resume',
    run: () => ({
      out: [text('Opening resume.pdf', 'dim')],
      effects: [{ type: 'external', url: LINKS.resume }],
    }),
  },

  github: {
    desc: 'Open my GitHub profile',
    run: () => ({
      out: [text(`Opening ${LINKS.github}`, 'dim')],
      effects: [{ type: 'external', url: LINKS.github }],
    }),
  },

  linkedin: {
    desc: 'Open my LinkedIn profile',
    run: () => ({
      out: [text(`Opening ${LINKS.linkedin}`, 'dim')],
      effects: [{ type: 'external', url: LINKS.linkedin }],
    }),
  },

  music: {
    desc: 'What I am listening to',
    run: () => ({
      out: [text('Opening /music', 'dim')],
      effects: [{ type: 'navigate', path: '/music' }],
    }),
  },

  theme: {
    desc: 'Change colors',
    usage: 'theme [name]',
    run: (args, session) => {
      const name = args[0]?.toLowerCase()
      if (!name) {
        return {
          out: [
            ...Object.keys(THEMES).map((key): Line => [
              t(`  ${key.padEnd(8)}`, 'accent'),
              t(THEMES[key].label),
              t(key === session.theme ? '  ← current' : '', 'dim'),
            ]),
            blank,
            text('Switch with: theme <name>', 'dim'),
          ],
        }
      }
      if (!THEMES[name]) {
        return { out: [text(`theme: unknown theme '${args[0]}'. Type 'theme' for a list.`, 'err')] }
      }
      return {
        out: [text(`Theme set to ${name}.`, 'dim')],
        effects: [{ type: 'theme', name }],
      }
    },
  },

  history: {
    desc: 'Show previous commands',
    run: (_, session) => ({
      out: session.history.length
        ? session.history.map((entry, index): Line => [
            t(`  ${String(index + 1).padStart(3)}  `, 'dim'),
            t(entry),
          ])
        : [text('No history yet.', 'dim')],
    }),
  },

  echo: {
    desc: 'Print text',
    run: (args) => ({ out: [text(args.join(' '))] }),
  },

  date: {
    desc: 'Show the date and time',
    run: (_, session) => ({ out: [text(new Date(session.now).toString())] }),
  },

  clear: {
    desc: 'Clear the screen',
    run: () => ({ out: [], effects: [{ type: 'clear' }] }),
  },

  exit: {
    desc: 'Close the terminal',
    run: () => ({ out: [text('bye 👋', 'dim')], effects: [{ type: 'close' }] }),
  },
}

// Not listed in help
const aliases: Record<string, string> = {
  '?': 'help',
  dir: 'ls',
  ll: 'ls',
  quit: 'exit',
  logout: 'exit',
  cls: 'clear',
}

const eggs: Record<string, (args: string[]) => Line[]> = {
  sudo: () => [text(`${PROFILE.user} is not in the sudoers file. This incident will be reported.`, 'err')],
  rm: (args) => [
    text(`rm: cannot remove '${args.filter((arg) => !arg.startsWith('-'))[0] ?? ''}': Read-only file system`, 'err'),
  ],
  hello: () => [text(`Hi! I'm ${PROFILE.name}. Type 'help' to look around.`, 'accent2')],
  hi: () => [text(`Hi! I'm ${PROFILE.name}. Type 'help' to look around.`, 'accent2')],
  vim: () => [text('vim: not installed. This is a read-only portfolio. (Try cat instead.)', 'dim')],
  nano: () => [text('nano: not installed. This is a read-only portfolio. (Try cat instead.)', 'dim')],
}

export const COMMAND_NAMES = Object.keys(commands)

export function execute(input: string, session: Session): Result {
  const tokens = tokenize(input.trim())
  if (tokens.length === 0) return { out: [] }

  const name = aliases[tokens[0].toLowerCase()] ?? tokens[0].toLowerCase()
  const args = tokens.slice(1)

  if (name === 'matrix') {
    return { out: [text('Wake up…', 'dim')], effects: [{ type: 'theme', name: 'matrix' }] }
  }
  if (eggs[name]) return { out: eggs[name](args) }

  const command = commands[name]
  if (!command) {
    return {
      out: [
        text(`bradysh: command not found: ${tokens[0]}`, 'err'),
        text("Type 'help' to see what you can run.", 'dim'),
      ],
    }
  }
  return command.run(args, session, buildFilesystem(session.projects))
}
