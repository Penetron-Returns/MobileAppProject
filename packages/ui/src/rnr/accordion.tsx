import { Icon } from '../primitives/Icon';
import { TextClassContext } from '../primitives/Text';
import { cn } from '../lib/cn';
import * as AccordionPrimitive from '@rn-primitives/accordion';
import { ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { Platform, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOutUp,
  LayoutAnimationConfig,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

function Accordion({
  children,
  className,
  ...props
}: AccordionPrimitive.RootProps &
  React.RefAttributes<AccordionPrimitive.RootRef>) {
  return (
    <LayoutAnimationConfig skipEntering>
      <AccordionPrimitive.Root
        className={cn(Platform.select({ web: 'w-full' }), className)}
        {...props}
      >
        {children}
      </AccordionPrimitive.Root>
    </LayoutAnimationConfig>
  );
}

function AccordionItem({
  className,
  value,
  ...props
}: AccordionPrimitive.ItemProps &
  React.RefAttributes<AccordionPrimitive.ItemRef>) {
  return (
    <Animated.View
      className="overflow-hidden"
      entering={FadeIn}
      exiting={FadeOutUp}
    >
      <AccordionPrimitive.Item
        className={cn('border-border border-b', className)}
        value={value}
        {...props}
      />
    </Animated.View>
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.TriggerProps &
  React.RefAttributes<AccordionPrimitive.TriggerRef>) {
  const { isExpanded } = AccordionPrimitive.useItemContext();
  const progress = useSharedValue(isExpanded ? 1 : 0);

  React.useEffect(() => {
    progress.value = withTiming(isExpanded ? 1 : 0, { duration: 200 });
  }, [isExpanded, progress]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(progress.value, [0, 1], [0, 180], Extrapolation.CLAMP)}deg`,
      },
    ],
  }));

  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          'flex flex-row flex-1 items-center justify-between gap-4 rounded-md py-4',
          Platform.select({
            web: 'group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all outline-none',
          }),
          className,
        )}
        {...props}
      >
        <TextClassContext.Provider value="text-sm native:text-base font-medium web:group-hover:underline">
          {children as React.ReactNode}
        </TextClassContext.Provider>
        <Animated.View style={chevronStyle}>
          <Icon
            as={ChevronDown}
            size={16}
            className="text-muted-foreground shrink-0"
          />
        </Animated.View>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.ContentProps &
  React.RefAttributes<AccordionPrimitive.ContentRef>) {
  return (
    <TextClassContext.Provider value="text-sm">
      <AccordionPrimitive.Content
        className={cn(
          Platform.select({
            web: 'overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down',
          }),
          className,
        )}
        {...props}
      >
        <View className={cn('pb-4', Platform.select({ web: 'pt-0' }))}>
          {children}
        </View>
      </AccordionPrimitive.Content>
    </TextClassContext.Provider>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
