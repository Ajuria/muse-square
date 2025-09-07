/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{astro,html,js,ts,jsx,tsx}',
    './content/**/*.{md,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1A1A1A',
        secondary: '#333333',
        background: '#FFFFFF',
        muted: '#F5F5F5',
        border: '#D9D9D9',
        ring: '#1A1A1A',
        text: '#333333',
      },

      // Map Tailwind utilities to your self-hosted font families
      fontFamily: {
        heading: [
          'Avenir Next LT Pro', // exact name from fonts.css
          'Avenir Next',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        body: [
          'Garamond Premier Pro', // exact name from fonts.css
          'Garamond',
          'Times New Roman',
          'serif',
        ],
      },

      spacing: {
        '25': '100px',
        '15': '60px',
        '10': '40px',
      },
      maxWidth: {
        msq: '1140px',
      },
      letterSpacing: {
        button: '0.5px',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
