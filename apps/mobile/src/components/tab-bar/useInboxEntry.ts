export interface InboxEntry {
  /** Whether the floating Inbox dome is shown above the tab bar. */
  isVisible: boolean;
  /** Conversations that need a reply; the badge is hidden at 0. */
  unreadCount: number;
}

/**
 * Placeholder for the Inbox entry point. Plan gating is built on another
 * branch, so this defaults to the Free-plan layout (dome shown, no count).
 * It is the only place the dome's visibility and badge are decided: wire the
 * entitlement and the open-conversation count here, nowhere else.
 */
export function useInboxEntry(): InboxEntry {
  return { isVisible: true, unreadCount: 0 };
}
