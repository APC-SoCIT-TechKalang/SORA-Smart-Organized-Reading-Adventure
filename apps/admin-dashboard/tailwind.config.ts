import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
