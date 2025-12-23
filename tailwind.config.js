/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Platform-specific colors from GameDrive workflow analysis
        steam: '#1b2838',
        playstation: '#0070d1', 
        nintendo: '#e60012',
        xbox: '#107c10',
        epic: '#000000',
        // Game Drive brand colors
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        // Status colors for sales workflow
        status: {
          draft: '#6b7280',
          submitted: '#f59e0b',
          confirmed: '#10b981',
          live: '#06b6d4',
          ended: '#8b5cf6',
          conflict: '#ef4444',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}