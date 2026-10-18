import * as React from 'react';

/**
 * Component state that belongs to one signed-in user: it reads back as
 * `initial` as soon as `userId` changes (sign-out, or another account signing
 * in), so a flag set by one person never leaks into the next session.
 */
export function useUserScopedState<T>(
  userId: string | null | undefined,
  initial: T,
): [T, (value: T) => void] {
  const owner = userId ?? null;
  const [state, setState] = React.useState<{ owner: string | null; value: T }>({
    owner,
    value: initial,
  });
  const value = state.owner === owner ? state.value : initial;
  const set = React.useCallback(
    (next: T) => setState({ owner, value: next }),
    [owner],
  );
  return [value, set];
}
