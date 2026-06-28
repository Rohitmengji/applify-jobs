/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Confidence overlay palette (IMPLEMENTATION.md §17 / vision §5).
        conf: {
          high: '#16a34a', // green  95–100%
          med: '#ca8a04', // amber  70–94%
          low: '#dc2626', // red    <70%
        },
      },
    },
  },
  plugins: [],
};
