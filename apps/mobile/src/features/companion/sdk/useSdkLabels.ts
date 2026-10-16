import type { CompanionProviderProps } from '@nerova/react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import enUS from '@/lib/i18n/locales/en-US.json';

type SdkLabels = Required<NonNullable<CompanionProviderProps['labels']>>;

const SDK_LABEL_KEYS = Object.keys(enUS.companion.sdk) as (keyof SdkLabels &
  keyof typeof enUS.companion.sdk)[];

// Compile-time guard: a label the SDK adds and we have not translated fails
// `tsc` here. The runtime twin is `useSdkLabels.test.ts`.
enUS.companion.sdk satisfies Record<keyof SdkLabels, string>;

/**
 * The SDK's `labels` prop, built from `companion.sdk.*` so every string the
 * sheet shows or announces goes through i18n. `{name}` and the other
 * single-brace placeholders are the SDK's own and stay in the text: i18next
 * only interpolates `{{double}}` braces.
 */
export function useSdkLabels(): SdkLabels {
  const { t } = useTranslation();
  return React.useMemo(
    () =>
      Object.fromEntries(
        SDK_LABEL_KEYS.map((key) => [key, t(`companion.sdk.${key}`)]),
      ) as SdkLabels,
    // `t` changes identity with the language, the only input.
    [t],
  );
}
