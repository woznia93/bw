import Link from 'next/link'
import { BlogPosts } from '@/components/posts'

export const metadata = {
  title: 'Blog',
  description: 'Read my blog.',
}

export default function Page() {
  return (
    <section>
      <h1 className="font-semibold text-2xl mb-8 tracking-tighter">My Blog</h1>

      <div className="mb-12">
        <h2 className="font-semibold text-lg mb-4 text-neutral-900 dark:text-neutral-100">
          Recommended Reads
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Paper 1 */}
          <a
            href="https://arxiv.org/pdf/1706.03762"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition flex flex-col justify-between h-40"
          >
            <div>
              <h3 className="font-semibold text-blue-600 dark:text-blue-300 text-sm line-clamp-2">
                Attention is All You Need
              </h3>
              <div className="flex gap-2 mt-2 text-xs text-blue-500 dark:text-blue-400">
                <span>Vaswani et al.</span>
                <span>•</span>
                <span>2017</span>
              </div>
            </div>
            <span className="text-lg text-blue-600 dark:text-blue-400">↗</span>
          </a>

          {/* Paper 2 */}
          <a
            href="https://arxiv.org/pdf/2503.02819"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition flex flex-col justify-between h-40"
          >
            <div>
              <h3 className="font-semibold text-blue-600 dark:text-blue-300 text-sm line-clamp-2">
                Feyman-Kac Correctors in Diffusion
              </h3>
              <div className="flex gap-2 mt-2 text-xs text-blue-500 dark:text-blue-400">
                <span>arXiv</span>
                <span>•</span>
                <span>2025</span>
              </div>
            </div>
            <span className="text-lg text-blue-600 dark:text-blue-400">↗</span>
          </a>
        </div>
      </div>

      <h2 className="font-semibold text-lg mb-4">All Posts</h2>
      <BlogPosts />
    </section>
  )
}
