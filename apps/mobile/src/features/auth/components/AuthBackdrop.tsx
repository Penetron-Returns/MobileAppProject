import { Ground, useDepth, withAlpha } from '@booking/ui';
import * as React from 'react';
import { View } from 'react-native';

import { BRAND } from '@/features/brand/brandColors';

/** Ground plus a soft top-down blue wash on the sign-in board: Mist in light, Clovie Blue at low alpha in dark. */
export function AuthBackdrop({ children }: { children: React.ReactNode }) {
  const depth = useDepth();
  const isDark = depth.scheme === 'dark';
  const wash = isDark ? withAlpha(BRAND.blue, 0.24) : BRAND.mist;
  const fade = isDark ? withAlpha(BRAND.blue, 0) : withAlpha(BRAND.mist, 0);

  return (
    <Ground className="flex-1">
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 520,
          experimental_backgroundImage: `radial-gradient(ellipse 90% 100% at 50% 0%, ${wash}, ${fade} 100%)`,
        }}
      />
      {children}
    </Ground>
  );
}
