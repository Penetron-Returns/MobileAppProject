// eslint.config.js
import { baseConfig } from '@booking/config/eslint';

/**
 * The design system lives in packages/ui and is imported from the package
 * entry point only. These paths held the old scattered components: they are
 * gone, and deep imports of package internals are blocked so the barrel stays
 * the one public surface (docs/design-system.md).
 */
const OLD_COMPONENT_PATHS = [
  '@/components/ui',
  '@/components/ui/*',
  '@/components/flow/*',
  '@/components/states/*',
  '@/components/tab-bar/*',
  '@/components/{Surface,Ground,Page,Screen,Group,Chips,Capsule,InitialsDome,InsetInput,SearchInput,SegmentedControl,OptionSheet,Sheet,ConfirmDialog,FormField,StatusBadge,StatCard,ListItem,PersonAvatar,RetryCard,OfflineBanner,States,Header,StackHeader,TabHeader,Toaster}',
  '@/lib/depth',
  '@/lib/utils',
  '@/hooks/useDepth',
  '@/hooks/useAppColorScheme',
];

export const appImportRestrictions = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['@booking/ui/*', '**/packages/ui/*', '**/packages/ui'],
          message:
            'Import from "@booking/ui" only. Package internals are private.',
        },
        {
          group: OLD_COMPONENT_PATHS,
          message:
            'This component moved into the design system. Import it from "@booking/ui".',
        },
      ],
    },
  ],
};

export default [
  ...baseConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: appImportRestrictions,
  },
  {
    files: ['types.ts'],
    rules: {},
  },
];
