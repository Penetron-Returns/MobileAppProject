/**
 * WhatsApp Flows data_exchange endpoint (decrypted side).
 *
 * The endpoint is stateless: every screen's data carries the selections made
 * so far and the footer sends them back. Every step is re-validated against
 * live availability through BookingService.
 *
 * Booking:    SERVICE → DATETIME → SUMMARY (`complete`; the engine books on the nfm_reply), see bookingFlow.ts
 * Reschedule: DATETIME → SUMMARY (`complete`; the engine moves the appointment on the nfm_reply), see rescheduleFlow.ts
 */
import { hasFeatureOrNone } from '../../plans/entitlements.ts';
import type { WaDeps } from '../deps.ts';
import { escalate } from '../outbound.ts';
import { bookingFlow } from './bookingFlow.ts';
import { rescheduleFlow } from './rescheduleFlow.ts';
import { FLOW_DATA_VERSION, type FlowRequest, type FlowResult, type Session } from './session.ts';
import { verifyFlowToken } from './token.ts';

export { FLOW_COPY } from './session.ts';
export type { FlowRequest, FlowResult } from './session.ts';

export async function handleFlowRequest(deps: WaDeps, req: FlowRequest): Promise<FlowResult> {
  if (req.action === 'ping') return { status: 200, body: { version: FLOW_DATA_VERSION, data: { status: 'active' } } };

  const now = deps.now();
  const secret = deps.env.FLOW_TOKEN_SECRET;
  const check = secret ? verifyFlowToken(secret, req.flow_token, now) : null;

  // Client-side error notification: acknowledge, and flag it for staff.
  if (req.data && 'error' in req.data) {
    if (check?.ok) {
      const conv = await deps.repo.getConversation(check.claims.conversationId);
      if (conv) {
        await escalate(deps, { businessId: conv.business_id, conversationId: conv.id, clientId: conv.client_id, reason: 'flow_error' }).catch(() => undefined);
      }
    }
    deps.logger.warn('wa_flow_client_error', { error_code: String((req.data as { error?: unknown }).error ?? '') });
    return { status: 200, body: { version: FLOW_DATA_VERSION, data: { acknowledged: true } } };
  }

  if (!check?.ok) return { status: 427 };
  const conv = await deps.repo.getConversation(check.claims.conversationId);
  if (!conv) return { status: 427 };
  // Plan gate: a business without the whatsapp_menu feature has no live flows; close any stale one.
  if (!(await hasFeatureOrNone(deps.entitlements, conv.business_id, 'whatsapp_menu'))) return { status: 427 };
  const client = await deps.repo.getClient(conv.business_id, conv.client_id);
  if (!client) return { status: 427 };
  const business = await deps.booking.getBusiness(conv.business_id);
  const s: Session = { deps, token: req.flow_token!, claims: check.claims, conv, client, business, now };

  const result = check.claims.kind === 'booking' ? await bookingFlow(s, req) : await rescheduleFlow(s, req);
  if (result.status === 200 && check.claims.attemptId && typeof result.body.screen === 'string') {
    await deps.repo.appendAttemptStep(check.claims.attemptId, `flow:${result.body.screen}`, now.toISOString()).catch(() => undefined);
  }
  return result;
}
