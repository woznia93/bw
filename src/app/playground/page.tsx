import { Playground } from '@/components/playground/Playground'

export const metadata = {
  title: 'Neural Network Playground',
  description:
    'Configure, train and inspect a small neural network in the browser, powered by a custom autograd engine.',
  // Hidden until the feature is finished (step 8 of the plan in docs/playground.md)
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-semibold tracking-tighter">
        Neural Network Playground
      </h1>
      <p className="mb-8 text-neutral-600 dark:text-neutral-400">
        Neural networks, built from scratch. Change a network&apos;s architecture, train it on
        sample datasets, and see how it learns.
      </p>
      <Playground />
    </section>
  )
}
