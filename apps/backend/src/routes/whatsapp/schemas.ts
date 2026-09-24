/** zod v4 request schemas for the WhatsApp /v1 routes. */
import { z } from 'zod';

const metaId = z.string().regex(/^\d{1,30}$/, 'must be a numeric Meta id');

export const embeddedSignupSchema = z.object({
  code: z.string().min(1).max(2000),
  waba_id: metaId,
  phone_number_id: metaId,
});

export const manualConnectSchema = z.object({
  waba_id: metaId,
  phone_number_id: metaId,
  access_token: z.string().trim().min(20).max(2000),
});

export const testMessageSchema = z.object({ to: z.string().min(5).max(32) });

export const staffMessageSchema = z.object({ text: z.string().trim().min(1).max(4096) });

export const resolveEscalationSchema = z.object({ note: z.string().trim().max(1000).nullable().optional() });
