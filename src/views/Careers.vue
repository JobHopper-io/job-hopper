<script setup lang="ts">
const sponsorship =
  'We actively encourage applications from candidates who require U.S. work authorization sponsorship, including individuals on H1B, OPT, and STEM OPT. Sponsorship support may be available for qualified candidates.'

const sharedNiceToHave = [
  'A self-starter mindset with the drive to take ownership and see work through without heavy oversight.',
  'Vision and ambition, with an interest in growing into greater responsibility as the company scales.',
  'The adaptability to wear several hats and move quickly in a rapidly growing company.',
  'An interest in the recruiting, HR technology, or job search space and in the mission of helping job seekers succeed.',
]

const jobs = [
  {
    title: 'Software Architect',
    meta: 'Remote · Full-time · ~4-6 years experience',
    overview:
      'We are seeking a Software Architect to help shape the technical foundation of the Job-Hopper platform. This is a senior role for an experienced engineer who can design scalable systems, make sound technical decisions, and set the standard for how we build. You will guide and mentor our developers, including more junior members of the team, while staying hands-on with the architecture and core features that keep the platform running. You will collaborate across the team in a fully remote, fast-moving environment. It is a strong fit for someone with roughly 4 to 6 years of experience who is ready to take ownership and grow alongside an early-stage company.',
    responsibilities: [
      'Design and guide the architecture of the Job-Hopper platform across the front end, back end, and data layers.',
      'Make key technical decisions on frameworks, tools, and overall system design.',
      'Build and maintain core features and the more complex parts of the platform.',
      'Set and uphold engineering standards, code quality, and best practices.',
      'Mentor and support junior and mid-level developers through code reviews and technical guidance.',
      'Lead technical planning and translate product goals into scalable, reliable solutions.',
      "Help ensure the platform's performance, scalability, security, and reliability as it grows.",
    ],
    qualifications: [
      'Roughly 4 to 6 years of experience in software development, including time in an architecture, lead, or senior engineering capacity.',
      "Bachelor's degree in Computer Science, Software Engineering, or a related field is a plus, but not required.",
      'Strong command of front-end and back-end development, such as JavaScript or TypeScript, modern frameworks, and API design.',
      'Experience designing scalable system architecture and working with databases.',
      'Solid understanding of version control, testing, and deployment practices.',
      'Ability to make sound technical decisions and communicate them clearly to both technical and non-technical stakeholders.',
      'Experience mentoring or guiding other developers.',
      'Comfort working independently in a remote, fast-paced, early-stage environment.',
    ],
    niceToHave: [
      'Deep experience with modern frameworks such as React, Next.js, or similar.',
      'Familiarity with cloud platforms or managed database services such as Supabase.',
      'Experience building AI-powered or data-driven products.',
      ...sharedNiceToHave,
    ],
    applyUrl: 'https://linkedin.com/jobs/view/4476333471',
    pdf: '/careers/software-architect-job-description.pdf',
  },
  {
    title: 'Full Stack Developer',
    meta: 'Remote · Full-time · ~1-3 years experience',
    overview:
      'We are seeking a Full Stack Developer to join our engineering team and help build and improve the Job-Hopper platform. This is a junior-level role for a developer who is eager to learn and ready to contribute across both the front end and the back end. You will work alongside and support our more senior developers, taking on real features while growing your skills. You will collaborate across the team in a fully remote, fast-moving environment. It is a strong fit for someone with roughly 1 to 3 years of experience who is ready to take ownership and grow alongside an early-stage company.',
    responsibilities: [
      'Work alongside senior developers to build and maintain features across the front end and back end.',
      'Write, test, and debug clean, readable, and maintainable code.',
      'Assist with building and integrating APIs and database queries.',
      'Help implement responsive, user-facing interfaces.',
      'Participate in code reviews and apply feedback to grow as a developer.',
      'Troubleshoot issues and help maintain application performance and reliability.',
      'Support day-to-day development tasks and contribute to ongoing platform improvements.',
    ],
    qualifications: [
      'Roughly 1 to 3 years of experience in software development or a related area preferred.',
      "Bachelor's degree in Computer Science, Software Engineering, or a related field is a plus, but not required.",
      'Working knowledge of front-end and back-end fundamentals, such as JavaScript or TypeScript, HTML, and CSS.',
      'Familiarity with databases and with building or consuming APIs.',
      'Basic understanding of version control such as Git.',
      'Strong problem-solving skills and a willingness to learn from more senior developers.',
      'Comfort working independently in a remote, fast-paced, early-stage environment.',
    ],
    niceToHave: [
      'Experience with a modern framework such as React, Next.js, or similar.',
      'Familiarity with cloud platforms or managed database services such as Supabase.',
      'Exposure to AI-powered or data-driven product development.',
      ...sharedNiceToHave,
    ],
    applyUrl: 'https://linkedin.com/jobs/view/4476330450',
    pdf: '/careers/full-stack-developer-job-description.pdf',
  },
]
</script>

<template>
  <div class="min-h-screen bg-white py-20 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-brand-charcoal mb-4 text-center">
        Join our team
      </h1>
      <p class="text-neutral-body text-center mb-16">
        Here are our active openings.
      </p>

      <div class="space-y-6">
        <details
          v-for="job in jobs"
          :key="job.title"
          class="card p-8 group"
        >
          <summary class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 cursor-pointer list-none">
            <div>
              <h2 class="text-brand-charcoal mb-1">
                {{ job.title }}
              </h2>
              <p class="text-neutral-body">
                {{ job.meta }}
              </p>
            </div>
            <span class="text-sm font-medium text-brand-primary shrink-0 group-open:hidden">
              View details
            </span>
            <span class="text-sm font-medium text-brand-primary shrink-0 hidden group-open:inline">
              Hide details
            </span>
          </summary>

          <div class="prose prose-lg max-w-none text-neutral-body mt-6 pt-6 border-t border-gray-100">
            <h3 class="text-lg font-heading font-semibold text-brand-charcoal mb-2">
              Overview
            </h3>
            <p class="mb-4">
              {{ job.overview }}
            </p>

            <h3 class="text-lg font-heading font-semibold text-brand-charcoal mb-2">
              Work authorization &amp; sponsorship
            </h3>
            <p class="mb-4">
              {{ sponsorship }}
            </p>

            <h3 class="text-lg font-heading font-semibold text-brand-charcoal mb-2">
              Key responsibilities
            </h3>
            <ul class="list-disc pl-6 mb-4 space-y-2">
              <li
                v-for="item in job.responsibilities"
                :key="item"
              >
                {{ item }}
              </li>
            </ul>

            <h3 class="text-lg font-heading font-semibold text-brand-charcoal mb-2">
              Qualifications
            </h3>
            <ul class="list-disc pl-6 mb-4 space-y-2">
              <li
                v-for="item in job.qualifications"
                :key="item"
              >
                {{ item }}
              </li>
            </ul>

            <h3 class="text-lg font-heading font-semibold text-brand-charcoal mb-2">
              Nice to have
            </h3>
            <ul class="list-disc pl-6 mb-4 space-y-2">
              <li
                v-for="item in job.niceToHave"
                :key="item"
              >
                {{ item }}
              </li>
            </ul>
          </div>

          <div class="mt-8 flex flex-wrap items-center gap-4">
            <a
              :href="job.applyUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-primary inline-block"
            >
              Apply on LinkedIn
            </a>
            <a
              :href="job.pdf"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm font-medium text-brand-primary hover:underline"
            >
              Download job description (PDF)
            </a>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>
