import Image from 'next/image'
import { BlogPosts } from '@/components/posts'
import { FightingGame } from '@/components/FightingGame'

export default function Page() {
  return (
    <section>
      <h1 className="mb-8 text-2xl font-semibold tracking-tighter">
        My Portfolio
      </h1>

      <div className="mb-8">
        <Image
          src="/webphoto.jpg"
          alt="Profile picture"
          width={300}
          height={300}
          className="rounded-lg"
        />
      </div>

      <p className="mb-4">
        {`I'm a software developer with a strong passion for machine learning and artificial intelligence. 
        I love exploring how intelligent systems can analyze data, learn patterns, and solve real-world problems in creative ways. 
        I enjoy understanding how things work under the hood and continuously refining my skills to write cleaner, smarter, and more scalable code.`}
      </p>

      <div className="my-12">
        <h2 className="mb-4 text-xl font-semibold tracking-tighter">
          Interactive Fighting Game Demo
        </h2>
        <FightingGame />
      </div>

      <div className="my-8">
        <BlogPosts />
      </div>
    </section>
  )
}
