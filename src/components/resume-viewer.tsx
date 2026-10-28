'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2]
const ALLOWED_LINKS = /^(https?:|mailto:)/i

type PageLink = { url: string; left: number; top: number; width: number; height: number }

function PdfPage({
  pdf,
  pageNumber,
  width,
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  width: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number; scale: number } | null>(null)
  const [links, setLinks] = useState<PageLink[]>([])

  useEffect(() => {
    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null
    let textLayer: { cancel: () => void } | null = null

    async function render() {
      const pdfjs = await import('pdfjs-dist')
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return

      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const ratio = Math.min(window.devicePixelRatio || 1, 3)

      const canvas = canvasRef.current
      const text = textRef.current
      if (!canvas || !text) return
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      setSize({ width: viewport.width, height: viewport.height, scale: viewport.scale })

      renderTask = page.render({
        canvasContext: canvas.getContext('2d')!,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      })

      // Invisible text on top of the canvas so it can be selected, copied and searched
      text.replaceChildren()
      const layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: text,
        viewport,
      })
      textLayer = layer

      try {
        await Promise.all([renderTask.promise, layer.render()])
      } catch {
        // A newer render replaced this one
        return
      }
      if (cancelled) return

      // Links in the PDF (email, LinkedIn, GitHub) become real links
      const annotations = await page.getAnnotations({ intent: 'display' })
      if (cancelled) return
      setLinks(
        annotations
          .filter((annotation: any) => annotation.subtype === 'Link' && annotation.url)
          .filter((annotation: any) => ALLOWED_LINKS.test(annotation.url))
          .map((annotation: any) => {
            const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotation.rect)
            return {
              url: annotation.url as string,
              left: Math.min(x1, x2),
              top: Math.min(y1, y2),
              width: Math.abs(x2 - x1),
              height: Math.abs(y2 - y1),
            }
          })
      )
    }

    render().catch(() => {
      // The viewer reports load failures itself, a failed page render just stays blank
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [pdf, pageNumber, width])

  return (
    <div
      data-page={pageNumber}
      className="relative mx-auto shrink-0 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-800"
      style={
        {
          width: size?.width ?? width,
          height: size?.height ?? width * 1.294,
          '--scale-factor': size?.scale ?? 1,
          '--total-scale-factor': size?.scale ?? 1,
        } as React.CSSProperties
      }
    >
      <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
      <div ref={textRef} className="textLayer" />
      {links.map((link, index) => (
        <a
          key={index}
          href={link.url}
          target={link.url.startsWith('mailto:') ? undefined : '_blank'}
          rel="noopener noreferrer"
          aria-label={link.url}
          className="absolute z-10 rounded-sm transition-colors hover:bg-blue-500/15"
          style={{ left: link.left, top: link.top, width: link.width, height: link.height }}
        />
      ))}
    </div>
  )
}

export function ResumeViewer({ src }: { src: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [failed, setFailed] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)
  const [zoomIndex, setZoomIndex] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    let loaded: PDFDocumentProxy | null = null

    async function load() {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString()
      const doc = await pdfjs.getDocument(src).promise
      if (cancelled) {
        doc.destroy()
        return
      }
      loaded = doc
      setPdf(doc)
    }

    load().catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => {
      cancelled = true
      loaded?.destroy()
    }
  }, [src])

  // Pages fit the width of the column, so re-render when it changes
  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return
    const measure = () => setContainerWidth(Math.floor(element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Track which page is mostly on screen for the "Page 1 of 2" label
  useEffect(() => {
    if (!pdf) return
    const pages = wrapperRef.current?.querySelectorAll<HTMLElement>('[data-page]')
    if (!pages || pages.length === 0) return
    const visible = new Map<number, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visible.set(Number((entry.target as HTMLElement).dataset.page), entry.intersectionRatio)
        })
        let best = 1
        let bestRatio = -1
        visible.forEach((ratio, page) => {
          if (ratio > bestRatio) {
            best = page
            bestRatio = ratio
          }
        })
        setCurrentPage(best)
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    pages.forEach((page) => observer.observe(page))
    return () => observer.disconnect()
  }, [pdf, containerWidth, zoomIndex])

  const zoom = ZOOM_STEPS[zoomIndex]
  const zoomOut = useCallback(() => setZoomIndex((i) => Math.max(0, i - 1)), [])
  const zoomIn = useCallback(() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1)), [])

  const buttonClass =
    'flex h-8 min-w-8 items-center justify-center rounded-md border border-neutral-200 px-2 text-sm transition-colors hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-800 dark:hover:bg-neutral-900'

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
        <p className="px-2 text-sm text-neutral-600 tabular-nums dark:text-neutral-400">
          {pdf ? `Page ${currentPage} of ${pdf.numPages}` : failed ? 'Unavailable' : 'Loading…'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={zoomOut}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="w-12 text-center text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className={buttonClass}
            onClick={zoomIn}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            aria-label="Zoom in"
          >
            +
          </button>
          <a className={buttonClass} href={src} download>
            Download
          </a>
        </div>
      </div>

      <div ref={wrapperRef} className="w-full overflow-x-auto">
        {failed ? (
          <p className="text-neutral-600 dark:text-neutral-400">
            The viewer couldn&apos;t load.{' '}
            <a className="underline underline-offset-2" href={src}>
              Open the PDF directly
            </a>
            .
          </p>
        ) : pdf && containerWidth > 0 ? (
          <div className="flex flex-col gap-4" style={{ width: containerWidth * zoom }}>
            {Array.from({ length: pdf.numPages }, (_, index) => (
              <PdfPage
                key={index}
                pdf={pdf}
                pageNumber={index + 1}
                width={Math.floor(containerWidth * zoom)}
              />
            ))}
          </div>
        ) : (
          <div
            className="mx-auto w-full animate-pulse rounded-md ring-1 ring-neutral-200 dark:ring-neutral-800"
            style={{ aspectRatio: '8.5 / 11' }}
          />
        )}
      </div>
    </div>
  )
}
