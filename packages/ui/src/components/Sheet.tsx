import * as DialogPrimitive from '@rn-primitives/dialog';
import * as React from 'react';
import {
  PanResponder,
  Platform,
  Pressable as RNPressable,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type ViewProps,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  SlideInDown,
  SlideOutDown,
  useSharedValue,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

import { NativeOnlyAnimatedView } from '../primitives/NativeOnlyAnimatedView';
import { TextClassContext } from '../primitives/Text';
import { cn } from '../lib/cn';
import { haptics } from '../lib/haptics';
import { useDsText } from '../lib/strings';
import {
  clampSheetHeight,
  detentHeight,
  settleDetent,
  type Detent,
} from '../lib/sheetDetents';
import { useDepth } from '../theme/useDepth';
import { MOTION, SPRING, springConfig } from '../tokens/motion';

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
          accessible={false}
        >
          <NativeOnlyAnimatedView
            entering={SlideInDown.springify()
              .duration(SPRING.smooth.duration)
              .dampingRatio(SPRING.smooth.dampingRatio)
              .reduceMotion(ReduceMotion.System)}
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
  detent,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  portalHost?: string;
  /**
   * SwiftUI presentationDetents: open at this detent
   * and let the grabber drag (or tap) between medium and large, or pull down
   * to close. Without it the sheet is fitted to its content.
   */
  detent?: Detent;
}) {
  const content = (grabber: React.ReactNode) => (
    <DialogPrimitive.Content
      className={cn(
        'bg-background border-border w-full gap-4 rounded-t-2xl border-t p-6',
        detent && 'flex-1',
        className,
      )}
      {...props}
    >
      {grabber}
      <>{children}</>
    </DialogPrimitive.Content>
  );
  return (
    <SheetPortal hostName={portalHost}>
      <SheetOverlay>
        {detent ? (
          <DetentFrame initial={detent}>{content}</DetentFrame>
        ) : (
          content(
            <View className="bg-muted -mt-2 mb-1 h-1.5 w-10 self-center rounded-full" />,
          )
        )}
      </SheetOverlay>
    </SheetPortal>
  );
}

/** The sheet stops 8pt under the status bar when large, like the form sheet. */
const TOP_GAP = 8;

/**
 * Gives a sheet its height and the drag between detents. The height is a
 * shared value, so dragging and the settling spring run on the UI thread.
 */
function DetentFrame({
  initial,
  children,
}: {
  initial: Detent;
  children: (grabber: React.ReactNode) => React.ReactNode;
}) {
  const { onOpenChange } = DialogPrimitive.useRootContext();
  const t = useDsText();
  const depth = useDepth();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const usable = screenHeight - insets.top - TOP_GAP;
  const usableRef = React.useRef(usable);
  usableRef.current = usable;
  const detentRef = React.useRef<Detent>(initial);
  const [detent, setDetent] = React.useState<Detent>(initial);
  const height = useSharedValue(detentHeight(initial, usable));
  const dragStart = React.useRef(0);

  const goTo = React.useCallback(
    (next: Detent) => {
      detentRef.current = next;
      setDetent(next);
      height.value = withSpring(
        detentHeight(next, usableRef.current),
        springConfig('smooth'),
      );
    },
    [height],
  );

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          dragStart.current = height.value;
        },
        onPanResponderMove: (_, g) => {
          height.value = clampSheetHeight(
            dragStart.current - g.dy,
            usableRef.current,
          );
        },
        onPanResponderRelease: (_, g) => {
          const from = detentRef.current;
          const outcome = settleDetent({
            from,
            offset: g.dy,
            velocity: g.vy * 1000,
            height: usableRef.current,
          });
          if (outcome === 'close') {
            haptics.light();
            onOpenChange(false);
            return;
          }
          if (outcome !== from) haptics.selection();
          goTo(outcome);
        },
      }),
    [goTo, height, onOpenChange],
  );

  const frame = useAnimatedStyle(() => ({ height: height.value }));
  const grabber = (
    <View {...pan.panHandlers} className="-mx-6 -mt-6">
      <RNPressable
        onPress={() => {
          haptics.selection();
          goTo(detent === 'large' ? 'medium' : 'large');
        }}
        accessibilityRole="button"
        accessibilityLabel={
          detent === 'large' ? t('sheet.collapse') : t('sheet.expand')
        }
        accessibilityState={{ expanded: detent === 'large' }}
        className="h-8 items-center justify-center"
      >
        <View
          style={{ backgroundColor: depth.grabber }}
          className="h-[5px] w-9 rounded-[3px]"
        />
      </RNPressable>
    </View>
  );
  return (
    <Animated.View style={[{ width: '100%' }, frame]}>
      {children(grabber)}
    </Animated.View>
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
