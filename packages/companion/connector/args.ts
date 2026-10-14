/** zod argument schemas for the ten tools. Unknown arguments are ignored (v1 only adds). */
import { z } from 'zod';

import { isInstant } from '@booking/features/lib/time.ts';

const text = z.string().min(1).max(500);
const optionalText = z.string().max(2000).optional();
const instant = z.string().refine(isInstant, 'must be an ISO 8601 instant with an explicit offset (Z or +hh:mm)');

const origin = z
  .object({
    source: z.string().min(1).max(40),
    channel: z.string().max(40).optional(),
    conversationId: z.string().max(100).optional(),
  })
  .optional();

const account = { accountId: text };

export const STATUS_VALUES = ['Scheduled', 'Completed', 'Cancelled', 'NoShow'] as const;

export const argSchemas = {
  accounts_list: z.object({ limit: z.number().int().min(1).max(100).optional(), cursor: z.string().max(200).optional() }),
  accounts_get: z.object(account),
  services_list: z.object(account),
  staff_list: z.object(account),
  availability_search: z.object({
    ...account,
    serviceId: text,
    start: instant,
    end: instant,
    staffId: z.string().max(100).optional(),
  }),
  appointments_get: z.object({ ...account, appointmentId: text }),
  appointments_list: z.object({
    ...account,
    from: instant,
    to: instant,
    staffId: z.string().max(100).optional(),
    clientId: z.string().max(100).optional(),
    clientPhone: z.string().max(40).optional(),
    status: z.enum(STATUS_VALUES).optional(),
    cursor: z.string().max(300).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  appointments_create: z.object({
    ...account,
    idempotencyKey: z.string().min(1).max(200),
    externalServiceId: text,
    externalStaffId: text,
    startTime: instant,
    client: z.object({
      name: text,
      phone: z.string().max(40).optional(),
      email: z.string().max(254).optional(),
      externalClientId: z.string().max(100).optional(),
    }),
    externalLocationId: z.string().max(100).optional(),
    notes: optionalText,
    reason: optionalText,
    intakeResponses: z.record(z.string(), z.unknown()).optional(),
    subject: z.object({ externalSubjectId: z.string() }).optional(),
    origin,
  }),
  appointments_reschedule: z.object({
    ...account,
    appointmentId: text,
    newStartTime: instant,
    newExternalStaffId: z.string().max(100).optional(),
    origin,
  }),
  appointments_cancel: z.object({ ...account, appointmentId: text, reason: optionalText, origin }),
} as const;

export type ToolName = keyof typeof argSchemas;
export type ToolArgs<N extends ToolName> = z.infer<(typeof argSchemas)[N]>;
