/** Static Meta definitions shipped with the WhatsApp app (see ./assets/). */
import bookingFlow from './assets/flows/booking.json' with { type: 'json' };
import rescheduleFlow from './assets/flows/reschedule.json' with { type: 'json' };
import templates from './assets/templates.json' with { type: 'json' };

export type TemplateName = 'booking_confirmation' | 'booking_reminder' | 'booking_rescheduled' | 'booking_cancelled';

export interface TemplateDefinition {
  name: TemplateName;
  language: string;
  category: string;
  components: Record<string, unknown>[];
}

export const TEMPLATE_DEFINITIONS = templates.templates as TemplateDefinition[];

export const FLOW_DEFINITIONS = {
  booking: { name: 'booking_v2', categories: ['APPOINTMENT_BOOKING'], json: bookingFlow },
  reschedule: { name: 'reschedule_v2', categories: ['APPOINTMENT_BOOKING'], json: rescheduleFlow },
} as const;

export type FlowKind = keyof typeof FLOW_DEFINITIONS;
