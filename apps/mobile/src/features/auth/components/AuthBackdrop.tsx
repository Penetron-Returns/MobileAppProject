import { Ground, useDepth, withAlpha } from '@booking/ui';
import * as React from 'react';
import { View } from 'react-native';

/** Ground gradient plus the soft accent glow at the top of the sign-in board. */
export function AuthBackdrop({ children }: { children: React.ReactNode }) {
  const depth = useDepth();
  const isDark = depth.scheme === 'dark';
  const fade = isDark ? 'rgba(11,12,16,0)' : 'rgba(247,247,250,0)';
  const glow = withAlpha(depth.colors.tint, isDark ? 0.28 : 0.2);

  return (
    <Ground className="flex-1">
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 460,
          experimental_backgroundImage: `radial-gradient(circle at 50% 0%, ${glow}, ${fade} 70%)`,
        }}
      />
      {children}
    </Ground>
  );
}
