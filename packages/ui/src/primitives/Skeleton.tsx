import { cn } from '../lib/cn';
import { View } from 'react-native';

import { useReduceMotion } from '../theme/useReduceMotion';

function Skeleton({
  className,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  const reduceMotion = useReduceMotion();
  return (
    <View
      className={cn(
        'bg-accent rounded-md',
        !reduceMotion && 'animate-pulse',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
