import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        heading: ['Poppins', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#2F6ECC',
          'rabbit-start': '#FFD75A',
          'rabbit-end': '#FF8A34',
          charcoal: '#111827',
          success: '#16A34A',
        },
        neutral: {
          bg: '#F9FAFB',
          card: '#FFFFFF',
          border: '#E5E7EB',
          body: '#374151',
        }
      },
      borderRadius: {
        'brand': '12px',
      }
    },
  },
  plugins: [typography],
}
