/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        volt: '#CCFF00',
        carbon: '#000000',
        steel: '#1A1A1A',
        ash: '#2A2A2A',
        smoke: '#666666',
      },
      fontFamily: {
        display: ['"Anton"', 'sans-serif'],
        body: ['"Barlow Condensed"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
