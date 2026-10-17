import { useActionNotifications } from './actionNotifications';
import { useApprovalNotifications } from './notifications';

/** Renders nothing: wires the approval and act-then-undo pushes (buttons and taps). Mount inside the companion host. */
export function ApprovalNotifications({ enabled }: { enabled: boolean }) {
  useApprovalNotifications(enabled);
  useActionNotifications(enabled);
  return null;
}
