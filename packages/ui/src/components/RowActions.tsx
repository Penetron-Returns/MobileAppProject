import * as React from 'react';
import type { AccessibilityActionEvent } from 'react-native';

/**
 * One action a row offers, whichever gesture reveals it: a swipe action or a
 * context-menu entry. `name` is the stable id screen readers receive.
 */
export interface RowAction {
  name: string;
  label: string;
  onPress: () => void;
}

interface RowActionsValue {
  actions: RowAction[];
  /** Set by a `ContextMenu`: opens the menu (the row's long press). */
  openMenu?: () => void;
}

/** True inside the lifted copy of a row (context menu preview): no gestures there. */
const PreviewContext = React.createContext(false);

/** Whether this subtree is only a visual copy of a row. */
export function useIsRowPreview(): boolean {
  return React.useContext(PreviewContext);
}

const RowActionsContext = React.createContext<RowActionsValue | null>(null);

/**
 * Hands a row's actions to the row itself. A swipe or long press is a gesture
 * VoiceOver and TalkBack users never perform, so the row exposes the same
 * actions as accessibility actions (the rotor / actions menu). Merges with an
 * outer provider, so a swipeable row inside a context menu offers both sets.
 */
export function RowActionsProvider({
  actions,
  openMenu,
  children,
}: {
  actions: RowAction[];
  openMenu?: () => void;
  children: React.ReactNode;
}) {
  const parent = React.useContext(RowActionsContext);
  const value = React.useMemo<RowActionsValue>(() => {
    const own = new Set(actions.map((a) => a.name));
    return {
      actions: [
        ...actions,
        ...(parent?.actions ?? []).filter((a) => !own.has(a.name)),
      ],
      openMenu: openMenu ?? parent?.openMenu,
    };
  }, [actions, openMenu, parent]);
  return (
    <RowActionsContext.Provider value={value}>
      {children}
    </RowActionsContext.Provider>
  );
}

/** Marks a subtree as the lifted preview of a row: no actions, no swiping. */
export function RowActionsReset({ children }: { children: React.ReactNode }) {
  return (
    <PreviewContext.Provider value>
      <RowActionsContext.Provider value={null}>
        {children}
      </RowActionsContext.Provider>
    </PreviewContext.Provider>
  );
}

export interface RowActionProps {
  accessibilityActions?: { name: string; label: string }[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  onLongPress?: () => void;
  delayLongPress?: number;
}

/**
 * Props for the row's pressable: accessibility actions for its swipe / menu
 * actions and the long press that opens its context menu. Spread them onto the
 * element that carries the row's `onPress` (`GroupRow` does).
 */
export function useRowActionProps(): RowActionProps {
  const value = React.useContext(RowActionsContext);
  return React.useMemo(() => {
    if (!value) return {};
    const { actions, openMenu } = value;
    return {
      accessibilityActions: actions.length
        ? actions.map(({ name, label }) => ({ name, label }))
        : undefined,
      onAccessibilityAction: actions.length
        ? (event: AccessibilityActionEvent) =>
            actions
              .find((a) => a.name === event.nativeEvent.actionName)
              ?.onPress()
        : undefined,
      onLongPress: openMenu,
      delayLongPress: openMenu ? 350 : undefined,
    };
  }, [value]);
}
