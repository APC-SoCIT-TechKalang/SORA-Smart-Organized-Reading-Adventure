export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        cream: '#fefefd',
        sand: '#f3d793',
        parch: '#efce8e',
        gold: '#c4800c',
        sun: '#f9d219',
        rust: '#953410',
        umber: '#543822',
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        body: ['Manrope', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        400: '400',
        500: '500',
        600: '600',
        700: '700',
        800: '800',
        900: '900',
      },
      boxShadow: {
        plate: '0 2px 0 0 #efce8e, 0 10px 24px -14px rgba(84,56,34,0.45)',
        relief: 'inset 0 0 0 1px rgba(254,254,253,0.75), 0 1px 0 0 rgba(84,56,34,0.08)',
      },
    },
  },
  plugins: [],
}
