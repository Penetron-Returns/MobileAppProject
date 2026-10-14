/** @type {import('tailwindcss').Config} */
const { hairlineWidth } = require('nativewind/theme');

module.exports = {
  darkMode: 'class',
  // The design system lives in packages/ui: its classes must be scanned too.
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  presets: [
    require('nativewind/preset'),
    require('../../packages/ui/tailwind-preset.cjs'),
  ],
  theme: {
    extend: {
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [require('tailwindcss-animate')],
};
