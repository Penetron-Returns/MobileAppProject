import { useApprovalNotifications } from './notifications';

/** Renders nothing: wires the approval push (buttons and taps). Mount inside the companion host. */
export function ApprovalNotifications({ enabled }: { enabled: boolean }) {
  useApprovalNotifications(enabled);
  return null;
}
