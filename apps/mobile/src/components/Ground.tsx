import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { useDepth } from '@/hooks/useDepth';

/** The vertical ground gradient behind a whole screen. */
export function Ground({ style, ...props }: ViewProps) {
  return <View style={[useDepth().ground, style]} {...props} />;
}
