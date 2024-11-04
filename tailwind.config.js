/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            table: {
              overflow: 'hidden',
            },
            'td,th': {
              padding: '0.5rem',
              borderColor: 'rgb(229 231 235)',
            },
          },
        },
      },
    },
  },
  plugins: [],
  darkMode: "selector",
};
