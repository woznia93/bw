'use client'

import Link from 'next/link'
import Image from 'next/image'
import { highlight } from 'sugar-high'
import md from 'markdown-it'

const markdown = md({
  html: true,
  linkify: true,
  typographer: true,
})

function CustomLink(props: any) {
  let href = props.href

  if (href?.startsWith('/')) {
    return (
      <Link href={href} {...props}>
        {props.children}
      </Link>
    )
  }

  if (href?.startsWith('#')) {
    return <a {...props} />
  }

  return <a target="_blank" rel="noopener noreferrer" {...props} />
}

function RoundedImage(props: any) {
  return (
    <Image
      alt={props.alt}
      className="rounded-lg"
      width={props.width || 800}
      height={props.height || 400}
      {...props}
    />
  )
}

export function CustomMDX({ source }: { source: string }) {
  const html = markdown.render(source)

  return (
    <div
      className="prose dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
