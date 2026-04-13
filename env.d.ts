/// <reference types="vite/client" />

declare module 'https://esm.sh/zipcodes@8.0.0' {
  interface ZipRecord {
    zip: string
    latitude: number
    longitude: number
    city: string
    state: string
  }
  const zipcodes: {
    lookup(zip: string): ZipRecord | undefined
    lookupByName(city: string, state: string): ZipRecord[]
  }
  export default zipcodes
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
