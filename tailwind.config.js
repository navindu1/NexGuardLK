/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './public/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        'primary': {
          DEFAULT: '#3B82F6', // Main blue color (blue-500)
          'hover': '#2563EB', // Darker blue for hover states (blue-600)
        },
        'accent': {
          DEFAULT: '#60A5FA', // Lighter blue for highlights & links (blue-400)
        },
        'card-bg': '#1F2937',   // Dark background for cards (gray-800)
        'body-bg': '#111827',   // Main background color for the body (gray-900)
      }
    },
  },
  plugins: [],
}