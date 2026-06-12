/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { base: '#0B0F14', panel: '#10161D', raised: '#161E29', border: '#1A2330' },
        ink: { primary: '#E6EDF3', secondary: '#7C8B9A', muted: '#3D4D5C' },
        accent: { amber: '#F4A300', amberDim: '#8A5C00', green: '#22D3A4', red: '#FF5C7A', blue: '#4DA3FF' },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(244,163,0,0.35), 0 0 24px rgba(244,163,0,0.08)',
        panel: 'inset 0 1px 0 rgba(255,255,255,0.02)',
      },
    },
  },
  plugins: [],
};
