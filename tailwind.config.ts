import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        plexcrew: {
          /** Base background — warm near-black, exposed film stock. */
          ink: '#14110F',
          /** Card / surface background, slightly lifted from ink. */
          charcoal: '#211C18',
          /** Secondary accent (cool) — structure, links, focus rings. */
          teal: '#2F6E63',
          /** Primary accent (warm) — the marquee, primary CTAs. */
          amber: '#E2A33B',
          /** High-emphasis text — warm parchment-white, never pure white. */
          screen: '#EFE9DF',
          /** Low-emphasis text — warm taupe-gray. */
          ash: '#8C8378',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Impact', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [typography],
};
export default config;
