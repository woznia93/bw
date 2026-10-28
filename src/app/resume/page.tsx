import { ResumeViewer } from '@/components/resume-viewer'
import { LINKS } from '@/data/terminal'

export const metadata = {
  title: 'Resume',
  description: "Brady Wozniak's resume.",
}

export default function Page() {
  return (
    <section>
      <h1 className="mb-8 text-2xl font-semibold tracking-tighter">Resume</h1>
      <ResumeViewer src={LINKS.resume} />
      <noscript>
        <p className="text-neutral-600 dark:text-neutral-400">
          Turn on JavaScript to view the resume here, or{' '}
          <a className="underline underline-offset-2" href={LINKS.resume}>
            open the PDF directly
          </a>
          .
        </p>
      </noscript>
    </section>
  )
}
