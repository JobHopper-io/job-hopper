declare module 'zipcodes' {
  interface ZipResult {
    zip: string
    city: string
    state: string
    country: string
    latitude: number
    longitude: number
  }

  function lookup(zip: string | number): ZipResult | undefined
  function lookupByName(city: string, state: string): ZipResult[]
  function random(): ZipResult
  function distance(zip1: string | number, zip2: string | number): number
  function radius(zip: string | number, miles: number): string[]
}
