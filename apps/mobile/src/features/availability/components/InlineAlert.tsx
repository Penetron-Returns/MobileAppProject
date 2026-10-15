import { Text, useDepth } from '@booking/ui';

/** A short error under a form group, announced when it appears. */
export function InlineAlert({ message }: { message: string }) {
  const depth = useDepth();
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ color: depth.colors.destructiveText }}
      className="mx-1 mt-2 text-subtitle"
    >
      {message}
    </Text>
  );
}
