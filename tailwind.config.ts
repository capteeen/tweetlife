import type { Config } from 'tailwindcss';

// Tailwind is used for UI chrome only. The world itself is Three.js.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0B0E14',
        x: '#1D9BF0',
        lantern: '#FFD089',
        stone: { 1: '#E8DCC8', 2: '#D4C3A5', 3: '#B8A382' },
        water: '#6FA8C7',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      fontSize: { body: ['15px', '22px'] },
    },
  },
  plugins: [],
};
export default config;
