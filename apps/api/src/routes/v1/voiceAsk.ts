/**
 * Spoken requests to the Nerova companion, for the Hey Clovie service with the app closed (Clerk or device voice token,
 * feature `companion`): POST /v1/voice/ask, POST /v1/voice/approvals/:id/approve and /decline. Thin: parse, delegate, respond.
 * Never logs the text, the reply or any name.
 */
import { Hono } from 'hono';
import { z } from 'zod';

import type { VoiceApprovalResultDTO, VoiceAskDTO } from '@booking/types';
import { AppError } from '@booking/features/lib/errors.ts';
import { parseJson } from '../../lib/validation.ts';
import { requireFeature } from '../../middleware/feature.ts';
import type { AppEnv } from '../../types.ts';

export const voiceAskRoutes = new Hono<AppEnv>();

const askSchema = z.object({ text: z.string().trim().min(1).max(4000) });
const APPROVAL_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

voiceAskRoutes.post('/voice/ask', requireFeature('companion'), async (c) => {
  const { text } = await parseJson(c, askSchema);
  const { businessId, userId } = c.get('auth');
  const started = Date.now();
  const data: VoiceAskDTO = await c.get('container').voiceAsk.ask({ businessId, userId }, text);
  // Sizes and timings only.
  c.get('logger').info('voice_ask', { reply_length: data.reply.length, approvals: data.approvals.length, duration_ms: Date.now() - started });
  return c.json({ data });
});

for (const decision of ['approve', 'decline'] as const) {
  voiceAskRoutes.post(`/voice/approvals/:id/${decision}`, requireFeature('companion'), async (c) => {
    const id = c.req.param('id');
    if (!APPROVAL_ID_RE.test(id)) throw new AppError('VALIDATION_FAILED', 'Invalid approval id', { field: 'id' });
    const { businessId, userId } = c.get('auth');
    // The idempotency middleware has already required the header.
    const key = c.req.header('idempotency-key') ?? `voice-${decision}-${id}`;
    const data: VoiceApprovalResultDTO = await c.get('container').voiceAsk.decide({ businessId, userId }, id, decision, key);
    c.get('logger').info('voice_approval_decided', { decision: data.decision });
    return c.json({ data });
  });
}
