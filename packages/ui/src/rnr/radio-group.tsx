import { cn } from '../lib/cn';
import * as RadioGroupPrimitive from '@rn-primitives/radio-group';
import { Platform, View } from 'react-native';

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root className={cn('gap-3', className)} {...props} />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'border-input aspect-square size-4 shrink-0 rounded-full border shadow-sm shadow-black/5',
        Platform.select({
          web: 'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-default outline-none transition-shadow focus-visible:ring-[3px]',
        }),
        props.disabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="items-center justify-center">
        <View className="bg-primary aspect-square size-2.5 rounded-full" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
