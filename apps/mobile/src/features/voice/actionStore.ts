/**
 * The executed actions of the last few companion turns, by id. The headless task that runs a spoken command shares a
 * JS runtime with the in-app drawer while the app is open, so the drawer can look up the lines of the booking the
 * service just read back (the native outcome carries only the id and the window). Holds a handful, never persisted.
 */
import type { ExecutedAction } from './undo';

const MAX_ACTIONS = 5;
const actions = new Map<string, ExecutedAction>();

export function rememberAction(action: ExecutedAction): void {
  actions.delete(action.id);
  actions.set(action.id, action);
  while (actions.size > MAX_ACTIONS) {
    const oldest = actions.keys().next();
    if (oldest.done) break;
    actions.delete(oldest.value);
  }
}

export function recallAction(id: string): ExecutedAction | undefined {
  return actions.get(id);
}

export function clearActions(): void {
  actions.clear();
}
