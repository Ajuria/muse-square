/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,md,mdx,ts,tsx}', './content/**/*.{md,mdx}'],
  theme: { extend: {} },
  plugins: [require('@tailwindcss/typography')],
};
