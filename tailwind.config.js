/** @type {import('tailwindcss').Config} */


module.exports = {
  content: ["./public/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        'custom-black': '#000000',
        'custom-gray': {
          DEFAULT: '#a2a2a2',
          light: '#c4c4c4',
          dark: '#808080',
        },
        'accent': '#a2a2a2', // You can change this to a different accent color if you like
      },
    },
  },
  plugins: [],
}