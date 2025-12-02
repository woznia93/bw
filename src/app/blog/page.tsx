import Link from 'next/link'
import { BlogPosts } from '@/components/posts'
import { getRecommendedPosts } from '@/utils/blogUtils'

export const metadata = {
  title: 'Blog',
  description: 'Read my blog.',
}

export default function Page() {
  const recommendedPosts = getRecommendedPosts()

  return (
    <section>
      <h1 className="font-semibold text-2xl mb-8 tracking-tighter">My Blog</h1>

      {recommendedPosts.length > 0 && (
        <div className="mb-12 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
          <h2 className="font-semibold text-lg mb-4 text-blue-900 dark:text-blue-100">
            Recommended Reads
          </h2>
          <div className="space-y-2">
            {recommendedPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 hover:underline font-medium"
              >
                → {post.metadata.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <h2 className="font-semibold text-lg mb-4">All Posts</h2>
      <BlogPosts />
    </section>
  )
}
