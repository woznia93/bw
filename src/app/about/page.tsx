export default function About() {
  return (
    <section>
      <h1 className="mb-8 text-2xl font-semibold tracking-tighter">
        About Me
      </h1>

      <div className="prose dark:prose-invert max-w-none">
        <p className="mb-4">
          {`I'm a software developer with a strong passion for machine learning and artificial intelligence. 
          I love exploring how new technologies will affect the future of tech.`}
        </p>

        <h2 className="mt-8 mb-4 text-xl font-semibold">
          My Background
        </h2>
        <p className="mb-4">
          {`I enjoy learning new technologies and applying them to build innovative solutions. `}
        </p>

        <h2 className="mt-8 mb-4 text-xl font-semibold">
          Skills & Interests
        </h2>
        <ul className="list-disc list-inside mb-4">
          <li>Machine Learning & AI</li>
          <li>Full-stack Development</li>
          <li>Back-end Development</li>
        </ul>

        <h2 className="mt-8 mb-4 text-xl font-semibold">
          Let&apos;s Connect
        </h2>
        <p>
          {`Feel free to reach out if you'd like to collaborate or discuss anything related to software development, AI, or machine learning.`}
        </p>
      </div>
    </section>
  )
}
