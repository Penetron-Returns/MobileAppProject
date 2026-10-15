import * as React from 'react';
import { View } from 'react-native';

interface Props {
  children?: React.ReactNode;
  renderRightActions?: (
    progress: { value: number },
    translation: { value: number },
    methods: object,
  ) => React.ReactNode;
}

/** Stand-in for gesture-handler's ReanimatedSwipeable: the row, then its actions. */
const Swipeable = React.forwardRef<unknown, Props>(function Swipeable(
  { children, renderRightActions },
  _ref,
) {
  const shared = { value: 0 };
  return (
    <View>
      {children}
      {renderRightActions?.(shared, shared, {})}
    </View>
  );
});

export default Swipeable;
