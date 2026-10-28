import { ABOUT, EXPERIENCE, FOCUS, LANGUAGES, LINKS, PROFILE, TOOLS } from '@/data/terminal'
import type { Project } from './types'

export type FsNode =
  | { type: 'dir'; children: Record<string, FsNode>; href?: string }
  | { type: 'file'; content: string; href?: string }

const file = (content: string, href?: string): FsNode => ({
  type: 'file',
  content,
  href,
})

// Posts are markdown/MDX; keep the text readable in a terminal
function toPlainText(content: string) {
  return content
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function projectDir(project: Project): FsNode {
  const readme = [
    `# ${project.title}`,
    `Published ${project.publishedAt}`,
    '',
    project.summary,
    '',
    project.github ? `Source: ${project.github}` : 'Source: (not public)',
    `Write-up: type 'open ${project.slug}'`,
  ].join('\n')

  return {
    type: 'dir',
    href: `/blog/${project.slug}`,
    children: {
      'README.md': file(readme, `/blog/${project.slug}`),
      'article.md': file(toPlainText(project.content), `/blog/${project.slug}`),
    },
  }
}

export function buildFilesystem(projects: Project[]): FsNode {
  const experience = EXPERIENCE.length
    ? EXPERIENCE.map(
        (job) => `${job.role} · ${job.org} (${job.period})\n  ${job.summary}`
      ).join('\n\n')
    : "Nothing listed here yet. The full history is in resume.pdf (type 'resume')."

  const sorted = projects
    .slice()
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))

  return {
    type: 'dir',
    children: {
      'about.md': file(ABOUT.join('\n\n'), '/about'),
      'skills.md': file(
        [
          'Focus',
          ...FOCUS.map((item) => `  - ${item}`),
          '',
          `Languages: ${LANGUAGES.join(', ')}`,
          `Tools: ${TOOLS.join(', ')}`,
        ].join('\n')
      ),
      'experience.md': file(experience, LINKS.resumePage),
      'contact.md': file(
        [
          `${PROFILE.name}`,
          `GitHub:   ${LINKS.github}`,
          `LinkedIn: ${LINKS.linkedin}`,
        ].join('\n')
      ),
      projects: {
        type: 'dir',
        href: '/blog',
        children: Object.fromEntries(
          sorted.map((project) => [project.slug, projectDir(project)])
        ),
      },
      'resume.pdf': file(
        "Binary file. Type 'resume' to view it.",
        LINKS.resumePage
      ),
    },
  }
}

export function getNode(root: FsNode, path: string[]): FsNode | null {
  let node: FsNode = root
  for (const part of path) {
    if (node.type !== 'dir' || !node.children[part]) {
      return null
    }
    node = node.children[part]
  }
  return node
}

// Turns what was typed ("~/projects", "..", "foo/bar") into a list of names from the root
export function resolvePath(cwd: string[], input: string): string[] {
  let parts: string[]
  if (input === '~' || input === '/' || input.startsWith('~/') || input.startsWith('/')) {
    parts = []
  } else {
    parts = cwd.slice()
  }

  for (const segment of input.replace(/^~/, '').split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts
}

export function displayPath(cwd: string[]) {
  return cwd.length ? `~/${cwd.join('/')}` : '~'
}
