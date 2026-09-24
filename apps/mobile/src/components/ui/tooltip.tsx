import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view';
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as TooltipPrimitive from '@rn-primitives/tooltip';
import * as React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const FullWindowOverlay =
  Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function TooltipContent({
  className,
  sideOffset = 4,
  portalHost,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  portalHost?: string;
}) {
  return (
    <TooltipPrimitive.Portal hostName={portalHost}>
      <FullWindowOverlay>
        <TooltipPrimitive.Overlay
          style={Platform.select({ native: StyleSheet.absoluteFill })}
          asChild={Platform.OS !== 'web'}
        >
          <NativeOnlyAnimatedView
            entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.reduceMotion(ReduceMotion.System)}
          >
            <TextClassContext.Provider value="text-xs text-popover-foreground">
              <TooltipPrimitive.Content
                sideOffset={sideOffset}
                className={cn(
                  'bg-popover border-border z-50 rounded-md border px-3 py-1.5 shadow-md shadow-black/5',
                  Platform.select({
                    web: 'animate-in fade-in-0 zoom-in-95 origin-(--radix-tooltip-content-transform-origin) w-fit',
                  }),
                  className,
                )}
                {...props}
              />
            </TextClassContext.Provider>
          </NativeOnlyAnimatedView>
        </TooltipPrimitive.Overlay>
      </FullWindowOverlay>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipTrigger };
