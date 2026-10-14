import * as DialogPrimitive from '@rn-primitives/dialog';
import * as React from 'react';
import {
  Platform,
  View,
  type GestureResponderEvent,
  type ViewProps,
} from 'react-native';
import {
  FadeIn,
  FadeOut,
  ReduceMotion,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

import { NativeOnlyAnimatedView } from '../primitives/NativeOnlyAnimatedView';
import { TextClassContext } from '../primitives/Text';
import { cn } from '../lib/cn';
import { MOTION } from '../tokens/motion';

/**
 * A bottom sheet built on the same dialog primitive as `ui/dialog`, styled to
 * slide up from the bottom edge with a grab handle (filter panels, quick
 * actions). RNR ships no dedicated "sheet" primitive, so this composes
 * `@rn-primitives/dialog` directly with bottom-anchored positioning instead
 * of the centered one `ui/dialog` uses.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const FullWindowOverlay =
  Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function SheetOverlay({
  className,
  children,
  onPress,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Overlay>, 'asChild'> & {
  children?: React.ReactNode;
}) {
  const { onOpenChange } = DialogPrimitive.useRootContext();

  function onOverlayPress(event: GestureResponderEvent) {
    onPress?.(event);
    if (event.target === event.currentTarget && !event.isDefaultPrevented()) {
      onOpenChange(false);
    }
  }

  return (
    <FullWindowOverlay>
      <DialogPrimitive.Overlay
        className={cn(
          'absolute bottom-0 left-0 right-0 top-0 flex justify-end bg-black/50',
          className,
        )}
        {...props}
        onPress={Platform.select({ web: onOverlayPress, native: onPress })}
        asChild={Platform.OS !== 'web'}
      >
        <NativeOnlyAnimatedView
          entering={FadeIn.duration(MOTION.base).reduceMotion(
            ReduceMotion.System,
          )}
          exiting={FadeOut.duration(MOTION.fast).reduceMotion(
            ReduceMotion.System,
          )}
          as="Pressable"
        >
          <NativeOnlyAnimatedView
            entering={SlideInDown.duration(MOTION.sheetIn).reduceMotion(
              ReduceMotion.System,
            )}
            exiting={SlideOutDown.duration(MOTION.sheetOut).reduceMotion(
              ReduceMotion.System,
            )}
          >
            <>{children}</>
          </NativeOnlyAnimatedView>
        </NativeOnlyAnimatedView>
      </DialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

function SheetContent({
  className,
  portalHost,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  portalHost?: string;
}) {
  return (
    <SheetPortal hostName={portalHost}>
      <SheetOverlay>
        <DialogPrimitive.Content
          className={cn(
            'bg-background border-border w-full gap-4 rounded-t-2xl border-t p-6 shadow-lg shadow-black/10',
            className,
          )}
          {...props}
        >
          <View className="bg-muted -mt-2 mb-1 h-1.5 w-10 self-center rounded-full" />
          <>{children}</>
        </DialogPrimitive.Content>
      </SheetOverlay>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: ViewProps) {
  return (
    <TextClassContext.Provider value="text-left">
      <View className={cn('gap-1.5', className)} {...props} />
    </TextClassContext.Provider>
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-foreground text-lg font-semibold', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
