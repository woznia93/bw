// Splits a command line into words. Quotes group words together; nothing is ever
// run as a real shell command, the result is only matched against the command list.
export function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: string | null = null
  let started = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quote) {
      if (char === quote) quote = null
      else current += char
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (char === ' ' || char === '\t') {
      if (started || current) tokens.push(current)
      current = ''
      started = false
    } else {
      current += char
      started = true
    }
  }
  if (started || current) tokens.push(current)
  return tokens
}

export function splitFlags(args: string[]) {
  return {
    flags: args.filter((arg) => arg.startsWith('-') && arg.length > 1),
    rest: args.filter((arg) => !(arg.startsWith('-') && arg.length > 1)),
  }
}
