/** @type {import('tailwindcss').Config} */
const { hairlineWidth } = require('nativewind/theme');

module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          soft: 'hsl(var(--brand-soft))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          soft: 'hsl(var(--success-soft))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          soft: 'hsl(var(--warning-soft))',
        },
        whatsapp: {
          DEFAULT: 'hsl(var(--whatsapp))',
          soft: 'hsl(var(--whatsapp-soft))',
        },
        status: {
          confirmed: 'hsl(var(--status-confirmed))',
          'confirmed-soft': 'hsl(var(--status-confirmed-soft))',
          pending: 'hsl(var(--status-pending))',
          'pending-soft': 'hsl(var(--status-pending-soft))',
          completed: 'hsl(var(--status-completed))',
          'completed-soft': 'hsl(var(--status-completed-soft))',
          cancelled: 'hsl(var(--status-cancelled))',
          'cancelled-soft': 'hsl(var(--status-cancelled-soft))',
        },
      },
      // SOFT.md type scale (SF / system font): size / line height.
      fontSize: {
        'large-title': ['34px', { lineHeight: '41px', letterSpacing: '0.4px' }],
        section: ['22px', { lineHeight: '28px' }],
        title: ['17px', { lineHeight: '22px' }],
        subtitle: ['15px', { lineHeight: '20px' }],
        meta: ['13px', { lineHeight: '18px' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [require('tailwindcss-animate')],
};
