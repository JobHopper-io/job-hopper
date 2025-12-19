/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#007AFF',
          'primary-dark': '#0038D6',
          dark: '#031130',
          light: '#FAFBFF',
        },
        gray: {
          cloud: '#EDEFF7',
          smoke: '#D3D6E0',
          steel: '#BCBFCC',
          space: '#9DA2B3',
          graphite: '#6E7180',
          arsenic: '#40424D',
          phantom: '#1E1E24',
        }
      }
    },
  },
  plugins: [],
}
