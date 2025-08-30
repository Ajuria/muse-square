/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,js,ts,tsx}', './content/**/*.{md,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1A1A1A',
        secondary: '#333333',
        background: '#FFFFFF',
        muted: '#F5F5F5',
        border: '#D9D9D9',
        ring: '#1A1A1A',
        text: '#333333'
      },
      fontFamily: {
        heading: ['Avenir Next','Inter','system-ui','Segoe UI','Helvetica Neue','Arial','sans-serif'],
        body: ['Garamond','EB Garamond','Georgia','serif']
      },
      spacing: {
        '25': '100px',
        '15': '60px',
        '10': '40px'
      },
      maxWidth: {
        msq: '1140px'
      },
      letterSpacing: {
        button: '0.5px'
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
};
