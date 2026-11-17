import Link from 'next/link'
import { Playground } from '@/components/playground/Playground'

export const metadata = {
  title: 'Neural Network Playground',
  description:
    'Configure, train and inspect a small neural network in the browser, trained by my C++ autograd engine compiled to WebAssembly.',
}

export default function Page() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-semibold tracking-tighter">
        Neural Network Playground
      </h1>
      <p className="mb-8 text-neutral-600 dark:text-neutral-400">
        Neural networks, built from scratch. Change a network&apos;s architecture, train it on
        sample datasets, and see how it learns. It is trained by{' '}
        <a
          href="https://github.com/woznia93/gpu_nn_framework"
          className="underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          my C++ autograd engine
        </a>
        , compiled to WebAssembly and running in your browser.{' '}
        <Link href="/blog/neural-network-playground" className="underline underline-offset-2">
          How it works
        </Link>
        .
      </p>
      <Playground />
    </section>
  )
}
