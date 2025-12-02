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

      <div className="mb-12 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
        <h2 className="font-semibold text-lg mb-4 text-blue-900 dark:text-blue-100">
          Recommended Reads
        </h2>
        <div className="space-y-3">
          {/* Paper 1 */}
          <a
            href="https://arxiv.org/pdf/1706.03762"
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1">
                <h3 className="font-semibold text-blue-600 dark:text-blue-300 hover:underline">
                  Attention is All You Need
                </h3>
                <p className="text-sm text-blue-500 dark:text-blue-400 mt-1">
                  A foundational paper introducing the Transformer architecture, which powers modern NLP and AI systems.
                </p>
                <div className="flex gap-3 mt-2 text-xs text-blue-500 dark:text-blue-400">
                  <span>By Vaswani et al.</span>
                  <span>arXiv • 2017</span>
                </div>
              </div>
              <span className="text-lg">↗</span>
            </div>
          </a>

          {/* Paper 2 */}
          <a
            href="https://arxiv.org/pdf/2503.02819"
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1">
                <h3 className="font-semibold text-blue-600 dark:text-blue-300 hover:underline">
                  Feyman-Kac Correctors in Diffusion
                </h3>
                <p className="text-sm text-blue-500 dark:text-blue-400 mt-1">
                  Explore cutting-edge developments in machine learning and AI research.
                </p>
                <div className="flex gap-3 mt-2 text-xs text-blue-500 dark:text-blue-400">
                  <span>arXiv • 2025</span>
                </div>
              </div>
              <span className="text-lg">↗</span>
            </div>
          </a>
        </div>
      </div>

      <h2 className="font-semibold text-lg mb-4">All Posts</h2>
      <BlogPosts />
    </section>
  )
}
