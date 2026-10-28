// Colors for the decision boundary background: blue where the network predicts
// class 0, amber where it predicts class 1, fading to nothing where it's unsure
// (which is where the boundary is).

export type Rgb = [number, number, number]

export const HEATMAP_COLORS: Record<'dark' | 'light', { class0: Rgb; class1: Rgb }> = {
  dark: { class0: [71, 163, 243], class1: [251, 191, 36] },
  light: { class0: [37, 99, 235], class1: [217, 119, 6] },
}

const MAX_ALPHA = 0.6

// probability: the network's chance that the point is class 1. Returns r, g, b, a with a in 0-255.
export function heatmapColor(probability: number, theme: 'dark' | 'light'): [number, number, number, number] {
  const confidence = Math.min(1, Math.max(0, Math.abs(probability - 0.5) * 2))
  const [r, g, b] = HEATMAP_COLORS[theme][probability >= 0.5 ? 'class1' : 'class0']
  return [r, g, b, Math.round(255 * MAX_ALPHA * Math.pow(confidence, 0.7))]
}
