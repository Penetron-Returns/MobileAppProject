import { Icon } from '../primitives/Icon';
import { NativeOnlyAnimatedView } from '../primitives/NativeOnlyAnimatedView';
import { TextClassContext } from '../primitives/Text';
import { cn } from '../lib/cn';
import * as MenubarPrimitive from '@rn-primitives/menubar';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
} from 'lucide-react-native';
import * as React from 'react';
import { Platform, Text, View } from 'react-native';
import { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

const Menubar = MenubarPrimitive.Root;

const MenubarMenu = MenubarPrimitive.Menu;

const MenubarTrigger = MenubarPrimitive.Trigger;

const MenubarGroup = MenubarPrimitive.Group;

const MenubarPortal = MenubarPrimitive.Portal;

const MenubarSub = MenubarPrimitive.Sub;

const MenubarRadioGroup = MenubarPrimitive.RadioGroup;

function MenubarSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubTrigger> & {
  children?: React.ReactNode;
  inset?: boolean;
}) {
  const { open } = MenubarPrimitive.useSubContext();
  const icon =
    Platform.OS === 'web' ? ChevronRight : open ? ChevronUp : ChevronDown;
  return (
    <TextClassContext.Provider
      value={cn(
        'text-sm select-none group-active:text-accent-foreground',
        open && 'text-accent-foreground',
      )}
    >
      <MenubarPrimitive.SubTrigger
        className={cn(
          'active:bg-accent group flex flex-row items-center rounded-sm px-2 py-2 sm:py-1.5',
          Platform.select({
            web: 'focus:bg-accent focus:text-accent-foreground cursor-default outline-none [&_svg]:pointer-events-none',
          }),
          className,
          open && 'bg-accent',
          inset && 'pl-8',
        )}
        {...props}
      >
        <>{children}</>
        <Icon as={icon} className="text-foreground ml-auto size-4 shrink-0" />
      </MenubarPrimitive.SubTrigger>
    </TextClassContext.Provider>
  );
}

function MenubarSubContent({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubContent>) {
  return (
    <NativeOnlyAnimatedView entering={FadeIn.reduceMotion(ReduceMotion.System)}>
      <MenubarPrimitive.SubContent
        className={cn(
          'bg-popover border-border overflow-hidden rounded-md border p-1 shadow-lg shadow-black/5',
          Platform.select({
            web: 'animate-in fade-in-0 zoom-in-95 z-50 min-w-[8rem]',
          }),
          className,
        )}
        {...props}
      />
    </NativeOnlyAnimatedView>
  );
}

const FullWindowOverlay =
  Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function MenubarContent({
  className,
  portalHost,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Content> & {
  portalHost?: string;
}) {
  return (
    <MenubarPrimitive.Portal hostName={portalHost}>
      <FullWindowOverlay>
        <MenubarPrimitive.Overlay
          style={{ flex: 1 }}
          asChild={Platform.OS !== 'web'}
        >
          <NativeOnlyAnimatedView
            entering={FadeIn.reduceMotion(ReduceMotion.System)}
            as="Pressable"
          >
            <TextClassContext.Provider value="text-popover-foreground">
              <MenubarPrimitive.Content
                className={cn(
                  'bg-popover border-border min-w-[12rem] overflow-hidden rounded-md border p-1 shadow-lg shadow-black/5',
                  Platform.select({
                    web: 'animate-in fade-in-0 zoom-in-95 z-50 cursor-default',
                  }),
                  className,
                )}
                {...props}
              />
            </TextClassContext.Provider>
          </NativeOnlyAnimatedView>
        </MenubarPrimitive.Overlay>
      </FullWindowOverlay>
    </MenubarPrimitive.Portal>
  );
}

function MenubarItem({
  className,
  inset,
  variant,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Item> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <TextClassContext.Provider
      value={cn(
        'select-none text-sm text-popover-foreground group-active:text-popover-foreground',
        variant === 'destructive' &&
          'text-destructive group-active:text-destructive',
      )}
    >
      <MenubarPrimitive.Item
        className={cn(
          'active:bg-accent group relative flex flex-row items-center gap-2 rounded-sm px-2 py-2 sm:py-1.5',
          Platform.select({
            web: cn(
              'focus:bg-accent focus:text-accent-foreground cursor-default outline-none data-[disabled]:pointer-events-none',
              variant === 'destructive' &&
                'focus:bg-destructive/10 dark:focus:bg-destructive/20',
            ),
          }),
          variant === 'destructive' &&
            'active:bg-destructive/10 dark:active:bg-destructive/20',
          props.disabled && 'opacity-50',
          inset && 'pl-8',
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function MenubarCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.CheckboxItem> & {
  children?: React.ReactNode;
}) {
  return (
    <TextClassContext.Provider value="text-sm text-popover-foreground select-none group-active:text-accent-foreground">
      <MenubarPrimitive.CheckboxItem
        className={cn(
          'active:bg-accent group relative flex flex-row items-center gap-2 rounded-sm py-2 pl-8 pr-2 sm:py-1.5',
          Platform.select({
            web: 'focus:bg-accent focus:text-accent-foreground cursor-default outline-none data-[disabled]:pointer-events-none',
          }),
          props.disabled && 'opacity-50',
          className,
        )}
        {...props}
      >
        <View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <MenubarPrimitive.ItemIndicator>
            <Icon as={Check} className="text-foreground size-4" />
          </MenubarPrimitive.ItemIndicator>
        </View>
        <>{children}</>
      </MenubarPrimitive.CheckboxItem>
    </TextClassContext.Provider>
  );
}

function MenubarRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioItem> & {
  children?: React.ReactNode;
}) {
  return (
    <TextClassContext.Provider value="text-sm text-popover-foreground select-none group-active:text-accent-foreground">
      <MenubarPrimitive.RadioItem
        className={cn(
          'active:bg-accent group relative flex flex-row items-center gap-2 rounded-sm py-2 pl-8 pr-2 sm:py-1.5',
          Platform.select({
            web: 'focus:bg-accent focus:text-accent-foreground cursor-default outline-none data-[disabled]:pointer-events-none',
          }),
          props.disabled && 'opacity-50',
          className,
        )}
        {...props}
      >
        <View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <MenubarPrimitive.ItemIndicator>
            <View className="bg-foreground h-2 w-2 rounded-full" />
          </MenubarPrimitive.ItemIndicator>
        </View>
        <>{children}</>
      </MenubarPrimitive.RadioItem>
    </TextClassContext.Provider>
  );
}

function MenubarLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <MenubarPrimitive.Label
      className={cn(
        'text-foreground px-2 py-2 text-sm font-medium sm:py-1.5',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}

function MenubarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
  return (
    <MenubarPrimitive.Separator
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

function MenubarShortcut({
  className,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={cn(
        'text-muted-foreground ml-auto text-xs tracking-widest',
        className,
      )}
      {...props}
    />
  );
}

export {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
};
