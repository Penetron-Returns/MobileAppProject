/**
 * Performs the actions a transition returned, in order. Sends, escalations
 * and attempt bookkeeping are best effort (logged, never thrown). A booking
 * mutation is always the last action; its outcome is returned as a
 * `booking_result` input for a follow-up transition.
 */
import type { WaDeps } from '../deps.ts';
import { escalate, sendOutbound, type OutboundTarget } from '../outbound.ts';
import type { Action, EngineInput } from './types.ts';

export type BookingResultInput = Extract<EngineInput, { kind: 'booking_result' }>;

export async function executeActions(deps: WaDeps, target: OutboundTarget, actions: Action[]): Promise<BookingResultInput | null> {
  const { repo, logger } = deps;
  const at = () => deps.now().toISOString();
  const customer = { type: 'customer' as const, id: target.clientId };

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'send':
          await sendOutbound(deps, target, action.message, {
            dedupeKey: action.dedupeKey,
            critical: action.critical,
            confirmation: action.confirmation,
          });
          break;
        case 'escalate':
          await escalate(deps, { businessId: target.businessId, conversationId: target.conversationId, clientId: target.clientId, reason: action.reason });
          break;
        case 'attempt_start':
          await repo.startAttempt({
            id: action.attemptId,
            businessId: target.businessId,
            clientId: target.clientId,
            conversationId: target.conversationId,
            at: at(),
          });
          break;
        case 'attempt_step':
          await repo.appendAttemptStep(action.attemptId, action.step, action.at);
          break;
        case 'attempt_finish':
          await repo.finishAttempt(action.attemptId, action.outcome, {
            appointmentId: action.appointmentId,
            errorCode: action.errorCode,
            at: at(),
          });
          break;
        case 'create_booking':
          return await bookingCall('create', () =>
            deps.booking.createAppointment({
              businessId: target.businessId,
              clientId: target.clientId,
              serviceId: action.serviceId,
              staffId: action.staffId,
              startsAt: action.startsAt,
              source: 'whatsapp',
              idempotencyKey: action.idempotencyKey,
              actor: customer,
              notifyCustomer: false,
              now: deps.now(),
            }),
          );
        case 'reschedule_booking':
          return await bookingCall('reschedule', () =>
            deps.booking.rescheduleAppointment({
              businessId: target.businessId,
              appointmentId: action.appointmentId,
              startsAt: action.startsAt,
              staffId: action.staffId,
              actor: customer,
              notifyCustomer: false,
              now: deps.now(),
            }),
          );
        case 'cancel_booking':
          return await bookingCall('cancel', () =>
            deps.booking.cancelAppointment({
              businessId: target.businessId,
              appointmentId: action.appointmentId,
              actor: customer,
              reason: 'Cancelled by customer on WhatsApp',
              notifyCustomer: false,
              now: deps.now(),
            }),
          );
      }
    } catch (err) {
      logger.error('wa_action_failed', { action: action.type, conversation_id: target.conversationId, error: err });
    }
  }
  return null;

  async function bookingCall(
    op: BookingResultInput['op'],
    call: () => Promise<import('../../../../shared/api.ts').AppointmentDTO>,
  ): Promise<BookingResultInput> {
    try {
      return { kind: 'booking_result', op, ok: true, appointment: await call() };
    } catch (err) {
      const mapped = mapBookingError(err);
      if (mapped.code === 'ERROR') logger.warn('wa_booking_failed', { op, detail: mapped.detail, conversation_id: target.conversationId });
      return { kind: 'booking_result', op, ok: false, ...mapped };
    }
  }
}

export function mapBookingError(err: unknown): { code: 'SLOT_UNAVAILABLE' | 'CANCELLATION_WINDOW' | 'ERROR'; detail: string } {
  const e = err as { code?: unknown; details?: { rule?: unknown } } | null;
  const code = typeof e?.code === 'string' ? e.code : undefined;
  const rule = typeof e?.details?.rule === 'string' ? e.details.rule : undefined;
  if (code === 'SLOT_UNAVAILABLE') return { code: 'SLOT_UNAVAILABLE', detail: code };
  if (code === 'RULE_VIOLATION' && rule === 'CANCELLATION_WINDOW') return { code: 'CANCELLATION_WINDOW', detail: rule };
  return { code: 'ERROR', detail: rule ?? code ?? 'INTERNAL' };
}
