import { supabase } from '@/lib/supabase'

export interface PublicTeaserLookupBody {
  company_name: string
  job_title: string
  job_url?: string
  job_description?: string
}

export interface PublicTeaserQuota {
  used: number
  limit: number
}

export interface PublicTeaserLookupRow {
  status: string
  full_name?: string | null
  title?: string | null
  email?: string | null
  linkedin_url?: string | null
  error_message?: string | null
}

export interface PublicTeaserLookupResponse {
  row?: PublicTeaserLookupRow | null
  cached?: boolean
  reveal_contact_details?: boolean
  company_name?: string
  quota?: PublicTeaserQuota
  error?: string
}

export async function publicFindHiringContact(body: PublicTeaserLookupBody) {
  return supabase.functions.invoke<PublicTeaserLookupResponse>('public-find-hiring-contact', {
    body: {
      external: {
        company_name: body.company_name,
        job_title: body.job_title,
        job_url: body.job_url,
        job_description: body.job_description,
      },
    },
  })
}
