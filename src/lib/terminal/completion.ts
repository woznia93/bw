import { PAGES, THEMES } from '@/data/terminal'
import { COMMAND_NAMES } from './commands'
import { buildFilesystem, getNode, resolvePath } from './filesystem'
import type { Session } from './types'

const PATH_COMMANDS = ['cd', 'ls', 'cat', 'tree', 'grep', 'open']

function commonPrefix(values: string[]) {
  let prefix = values[0] ?? ''
  values.forEach((value) => {
    while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1)
  })
  return prefix
}

// Returns the input with as much of the current word filled in as is unambiguous,
// plus every candidate so the caller can list them when there is more than one.
export function complete(input: string, session: Session) {
  const hasSpace = /\s/.test(input)
  const words = input.split(/\s+/)
  const current = words[words.length - 1]
  const head = input.slice(0, input.length - current.length)

  let candidates: string[] = []

  if (!hasSpace) {
    candidates = COMMAND_NAMES.filter((name) => name.startsWith(current))
  } else {
    const command = words[0].toLowerCase()
    if (command === 'theme') {
      candidates = Object.keys(THEMES).filter((name) => name.startsWith(current))
    } else if (command === 'skills') {
      candidates = ['--lang', '--tools'].filter((flag) => flag.startsWith(current))
    } else if (PATH_COMMANDS.indexOf(command) !== -1) {
      const slash = current.lastIndexOf('/')
      const dir = slash === -1 ? '' : current.slice(0, slash + 1)
      const partial = current.slice(slash + 1)
      const node = getNode(
        buildFilesystem(session.projects),
        dir ? resolvePath(session.cwd, dir) : session.cwd
      )
      if (node?.type === 'dir') {
        candidates = Object.keys(node.children)
          .filter((name) => name.startsWith(partial))
          .sort()
          .map((name) => dir + name + (node.children[name].type === 'dir' ? '/' : ''))
      }
      if (command === 'open' && !dir) {
        candidates = candidates.concat(
          Object.keys(PAGES).filter((name) => name.startsWith(partial)),
          session.projects
            .map((project) => project.slug)
            .filter((name) => name.startsWith(partial)),
          ['resume', 'github', 'linkedin'].filter((name) => name.startsWith(partial))
        )
      }
    }
  }

  if (candidates.length === 0) return { value: input, options: [] }
  const filled = commonPrefix(candidates)
  const done = candidates.length === 1 && !filled.endsWith('/')
  return {
    value: head + filled + (done ? ' ' : ''),
    options: candidates.length > 1 ? candidates : [],
  }
}
