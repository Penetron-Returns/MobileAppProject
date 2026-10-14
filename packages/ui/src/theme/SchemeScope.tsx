import { vars } from 'nativewind';
import * as React from 'react';
import { View } from 'react-native';

import {
  COLOR_ROLES,
  cssVariable,
  type ColorRole,
  type ColorScheme,
} from '../tokens/colors';

/** Colour scheme forced on a subtree; `null` follows the app. */
export const SchemeContext = React.createContext<ColorScheme | null>(null);

function variablesFor(scheme: ColorScheme) {
  const entries = Object.entries(COLOR_ROLES[scheme]) as [ColorRole, string][];
  return vars(
    Object.fromEntries(
      entries.map(([role, value]) => [cssVariable(role), value]),
    ),
  );
}

/**
 * Renders a subtree in a fixed colour scheme whatever the app uses: the CSS
 * variables behind the classes and the depth tokens both follow it. For the
 * gallery and previews (light and dark side by side), not for screens.
 */
export function SchemeScope({
  scheme,
  children,
}: {
  scheme: ColorScheme;
  children: React.ReactNode;
}) {
  const style = React.useMemo(() => variablesFor(scheme), [scheme]);
  const background = scheme === 'dark' ? '#0B0C10' : '#F7F7FA';
  return (
    <SchemeContext.Provider value={scheme}>
      <View style={[style, { backgroundColor: background }]}>{children}</View>
    </SchemeContext.Provider>
  );
}
