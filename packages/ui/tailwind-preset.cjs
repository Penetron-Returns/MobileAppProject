/**
 * Tailwind preset for the design system: colour roles (backed by the CSS
 * variables in the app's global.css), the type scale, radii and animations.
 * Apps add it next to `nativewind/preset` and include
 * `packages/ui/src/**` in `content` (docs/design-system.md).
 */
const role = (name) => `hsl(var(--${name}))`;
const pair = (name, extra = 'foreground') => ({
  DEFAULT: role(name),
  [extra]: role(`${name}-${extra}`),
});

/** @type {Partial<import('tailwindcss').Config>} */
module.exports = {
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        border: role('border'),
        input: role('input'),
        ring: role('ring'),
        background: role('background'),
        foreground: role('foreground'),
        primary: pair('primary'),
        secondary: pair('secondary'),
        destructive: pair('destructive'),
        muted: pair('muted'),
        accent: pair('accent'),
        popover: pair('popover'),
        card: pair('card'),
        brand: pair('brand', 'soft'),
        success: pair('success', 'soft'),
        warning: pair('warning', 'soft'),
        whatsapp: pair('whatsapp', 'soft'),
        status: {
          confirmed: role('status-confirmed'),
          'confirmed-soft': role('status-confirmed-soft'),
          pending: role('status-pending'),
          'pending-soft': role('status-pending-soft'),
          completed: role('status-completed'),
          'completed-soft': role('status-completed-soft'),
          cancelled: role('status-cancelled'),
          'cancelled-soft': role('status-cancelled-soft'),
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
};
