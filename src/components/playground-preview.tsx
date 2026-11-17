import Link from 'next/link'

// A fixed picture of what the playground does (an XOR dataset with the boundary a trained
// network finds), so the home page doesn't load the engine. Nothing here is computed.
const CLASS_0 = [
  [-0.7, 0.62], [-0.52, 0.8], [-0.3, 0.55], [-0.82, 0.35], [-0.45, 0.28], [-0.18, 0.84],
  [0.62, -0.7], [0.4, -0.52], [0.78, -0.35], [0.28, -0.82], [0.52, -0.25], [0.2, -0.45],
]
const CLASS_1 = [
  [0.68, 0.6], [0.45, 0.78], [0.3, 0.4], [0.8, 0.3], [0.55, 0.22], [0.2, 0.8],
  [-0.64, -0.66], [-0.42, -0.8], [-0.28, -0.4], [-0.8, -0.3], [-0.55, -0.24], [-0.2, -0.76],
]
const SIZE = 160
const at = (value: number) => ((value + 1) / 2) * SIZE

export function PlaygroundPreview() {
  return (
    <Link
      href="/playground"
      className="group flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 transition-colors hover:border-blue-500 dark:border-neutral-800 dark:hover:border-[#47a3f3] sm:flex-row sm:items-center"
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Two classes of points arranged in an XOR pattern, with the decision boundary a network learns drawn between them"
        className="shrink-0 rounded-md"
      >
        <rect width={SIZE} height={SIZE} className="fill-amber-600/20 dark:fill-[#fbbf24]/20" />
        <rect width={SIZE / 2} height={SIZE / 2} className="fill-blue-600/15 dark:fill-[#47a3f3]/15" rx="14" />
        <rect x={SIZE / 2} y={SIZE / 2} width={SIZE / 2} height={SIZE / 2} className="fill-blue-600/15 dark:fill-[#47a3f3]/15" rx="14" />
        <rect width={SIZE} height={SIZE} fill="none" className="stroke-neutral-300 dark:stroke-neutral-700" />
        {CLASS_0.map(([x, y], i) => (
          <circle key={i} cx={at(x)} cy={at(-y)} r="4" className="fill-blue-600 dark:fill-[#47a3f3]" />
        ))}
        {CLASS_1.map(([x, y], i) => (
          <path
            key={i}
            d="M0 -5.5 L5.5 0 L0 5.5 L-5.5 0 Z"
            transform={`translate(${at(x)} ${at(-y)})`}
            className="fill-amber-600 dark:fill-[#fbbf24]"
          />
        ))}
      </svg>
      <div>
        <p className="mb-1 text-lg font-semibold tracking-tight">Neural network playground</p>
        <p className="mb-2 text-neutral-600 dark:text-neutral-400">
          Configure and train a small network in your browser, watch its decision boundary form, and step
          through the backward pass node by node. It is trained by my C++ autograd engine, compiled to
          WebAssembly.
        </p>
        <span className="text-sm underline underline-offset-2 group-hover:text-blue-700 dark:group-hover:text-[#47a3f3]">
          Try it
        </span>
      </div>
    </Link>
  )
}
