import { NativeOnlyAnimatedView } from '../primitives/NativeOnlyAnimatedView';
import { cn } from '../lib/cn';
import * as HoverCardPrimitive from '@rn-primitives/hover-card';
import * as React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

const FullWindowOverlay =
  Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function HoverCardContent({
  className,
  align = 'center',
  sideOffset = 4,
  portalHost,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content> & {
  portalHost?: string;
}) {
  return (
    <HoverCardPrimitive.Portal hostName={portalHost}>
      <FullWindowOverlay>
        <HoverCardPrimitive.Overlay
          style={Platform.select({ native: StyleSheet.absoluteFill })}
          asChild={Platform.OS !== 'web'}
        >
          <NativeOnlyAnimatedView
            entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.reduceMotion(ReduceMotion.System)}
          >
            <HoverCardPrimitive.Content
              align={align}
              sideOffset={sideOffset}
              className={cn(
                'bg-popover border-border z-50 w-64 rounded-md border p-4',
                Platform.select({
                  web: 'animate-in fade-in-0 zoom-in-95 origin-(--radix-hover-card-content-transform-origin) outline-none',
                }),
                className,
              )}
              {...props}
            />
          </NativeOnlyAnimatedView>
        </HoverCardPrimitive.Overlay>
      </FullWindowOverlay>
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
