import { getBlogPosts } from '@/utils/blogUtils'

// The terminal loads this the first time it opens, so project text isn't sent with every page
export const dynamic = 'force-static'

export async function GET() {
  const projects = getBlogPosts().map((post) => ({
    slug: post.slug,
    title: post.metadata.title,
    publishedAt: post.metadata.publishedAt,
    summary: post.metadata.summary,
    github: post.metadata.github || undefined,
    content: post.content,
  }))
  return Response.json({ projects })
}
