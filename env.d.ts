/// <reference types="vite/client" />

declare module 'https://esm.sh/zipcodes@8.0.0' {
  interface ZipRecord {
    zip: string
    latitude: number
    longitude: number
    city: string
    state: string
  }
  export function lookup(zip: string): ZipRecord | undefined
  export function lookupByName(city: string, state: string): ZipRecord[]
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

