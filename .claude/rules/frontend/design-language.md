---
paths: apps/mobile/src/**/*.tsx,packages/ui/**
description: Build every screen to the SwiftUI-fidelity + Depth design language (Apple luxury)
---

# Design Language

The app must look and behave like a first-party SwiftUI app, with our Depth layer on top. It is built in React Native on iOS and Android. The full spec, with SwiftUI equivalents, motion and haptics tables and the quality bar, is in [docs/design-language.md](/docs/design-language.md).

## Implementation

1. Take **behaviour from SwiftUI**: navigation, sheets, controls, gestures, motion and haptics. Take **geometry and colour from the design boards**, and use the SwiftUI default where a board is silent. Depth decorates and never changes a control's size or behaviour.
2. Use only the SwiftUI text styles from the type scale (`largeTitle` … `caption2`), with Dynamic Type scaling. Never use ad-hoc sizes or fixed heights on text, and use tabular figures for times and prices.
3. Pick the SwiftUI-equivalent component for each job (the table in the doc). Examples: `Switch` for `Toggle`, `SegmentedControl` for `Picker(.segmented)`, swipe actions for row actions, a context menu for long-press, sheets with detents, `ConfirmDialog` only for critical decisions.
4. Animate with the spring tokens in `tokens/motion.ts`: `.smooth` for layout, `.snappy` for selection, `.bouncy` for celebrations only, and 120ms for presses. Every animation honours reduced motion and never delays input.
5. Fire the matching haptic for each moment (selection, light impact, success, warning, error), with at most one per user action.
6. Apply Depth only through tokens (raised, inset, engraved, dome, tint gradient, pressed), with one raised level per region and no hand-rolled shadows or hex.
7. Before calling a screen done, pass the quality bar in the doc: native in the hand, calm, immediate, consistent with its board, and inclusive (Dynamic Type at maximum size, screen readers, reduced motion, both themes).
8. When you add a SwiftUI behaviour that was missing, update the "Implementation status" table in `docs/design-language.md` in the same change.

## Examples

```tsx
// ✅ DO: a SwiftUI-style row action with the tokenised spring and haptic
<SwipeableRow trailing={[{ label: t('common.delete'), role: 'destructive', onPress: confirmDelete }]}>
  <GroupRow title={service.name} subtitle={summary} onPress={open} />
</SwipeableRow>
// selection change
Haptics.selectionAsync();
pill.value = withSpring(x, SPRING.snappy);

// ❌ DON'T: invent sizes, hand-roll shadows, or animate with arbitrary timings
<Text style={{ fontSize: 18 }}>…</Text>
<View style={{ shadowColor: '#000', shadowOpacity: 0.3 }} />
pill.value = withTiming(x, { duration: 637 });
```
