import { cn } from '@/lib/utils';
import * as SwitchPrimitives from '@rn-primitives/switch';
import { Platform } from 'react-native';

// Ported from react-native-reusables; enlarged to match the mockups'
// pill toggles and to give a comfortable touch target.
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitives.Root>) {
  return (
    <SwitchPrimitives.Root
      hitSlop={10}
      className={cn(
        'flex h-7 w-12 shrink-0 flex-row items-center rounded-full border border-transparent px-0.5 shadow-sm shadow-black/5',
        Platform.select({
          web: 'focus-visible:border-ring focus-visible:ring-ring/50 peer inline-flex outline-none transition-all focus-visible:ring-[3px] disabled:cursor-not-allowed',
        }),
        props.checked ? 'bg-primary' : 'bg-input dark:bg-input/80',
        props.disabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          'size-6 rounded-full bg-white shadow-sm shadow-black/20 transition-transform',
          Platform.select({
            web: 'pointer-events-none block ring-0',
          }),
          props.checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </SwitchPrimitives.Root>
  );
}

export { Switch };
