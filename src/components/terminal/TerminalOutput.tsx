import type { Entry } from './useTerminal'
import type { Line, Seg } from '@/lib/terminal/types'
import { PROFILE } from '@/data/terminal'

const URL_PATTERN = /(https?:\/\/[^\s)]+)/g

function Segment({
  seg,
  onNavigate,
}: {
  seg: Seg
  onNavigate: (path: string) => void
}) {
  const className = `term-tone-${seg.tone ?? 'normal'}`

  if (seg.href) {
    const external = /^https?:/.test(seg.href) || seg.href.endsWith('.pdf')
    return external ? (
      <a
        className={`${className} term-link`}
        href={seg.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {seg.text}
      </a>
    ) : (
      <a
        className={`${className} term-link`}
        href={seg.href}
        onClick={(event) => {
          event.preventDefault()
          onNavigate(seg.href as string)
        }}
      >
        {seg.text}
      </a>
    )
  }

  // Make bare URLs in file contents clickable
  return (
    <span className={className}>
      {seg.text.split(URL_PATTERN).map((part, index) =>
        index % 2 === 1 ? (
          <a
            key={index}
            className="term-link"
            href={part}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </span>
  )
}

function Row({ line, onNavigate }: { line: Line; onNavigate: (path: string) => void }) {
  return (
    <div
      className="term-line"
      style={
        line[0]?.hang
          ? { paddingLeft: `${line[0].hang}ch`, textIndent: `-${line[0].hang}ch` }
          : undefined
      }
    >
      {line.length === 0
        ? ' '
        : line.map((seg, index) => <Segment key={index} seg={seg} onNavigate={onNavigate} />)}
    </div>
  )
}

export function Prompt({ path }: { path: string }) {
  return (
    <span className="term-prompt">
      <span className="term-tone-accent">
        {PROFILE.user}@{PROFILE.host}
      </span>
      <span className="term-tone-dim">:</span>
      <span className="term-tone-accent2">{path}</span>
      <span className="term-tone-dim">$</span>
    </span>
  )
}

export function TerminalOutput({
  entries,
  onNavigate,
}: {
  entries: Entry[]
  onNavigate: (path: string) => void
}) {
  return (
    <>
      {entries.map((entry) =>
        entry.kind === 'cmd' ? (
          <div key={entry.id} className="term-line">
            <Prompt path={entry.prompt} /> {entry.input}
          </div>
        ) : (
          <div key={entry.id} className="term-block">
            {entry.lines.map((line, index) => (
              <Row key={index} line={line} onNavigate={onNavigate} />
            ))}
          </div>
        )
      )}
    </>
  )
}
