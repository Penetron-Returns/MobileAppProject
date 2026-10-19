/**
 * Spoken requests to the Nerova companion, for the Hey Clovie service with the app closed (Clerk or device voice token,
 * feature `companion`): POST /v1/voice/ask, POST /v1/voice/approvals/:id/approve and /decline. Thin: parse, delegate, respond.
 * Never logs the text, the reply or any name.
 */
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

import type { VoiceActionDTO, VoiceApprovalResultDTO, VoiceAskDTO, VoiceAskStreamDoneDTO, VoiceAskTimingDTO } from '@booking/types';
import { AppError } from '@booking/features/lib/errors.ts';
import { parseJson } from '../../lib/validation.ts';
import { requireFeature } from '../../middleware/feature.ts';
import type { AppEnv } from '../../types.ts';

export const voiceAskRoutes = new Hono<AppEnv>();

const askSchema = z.object({ text: z.string().trim().min(1).max(4000) });
const APPROVAL_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const ACTION_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

voiceAskRoutes.post('/voice/ask', requireFeature('companion'), async (c) => {
  const { text } = await parseJson(c, askSchema);
  const { businessId, userId } = c.get('auth');
  const started = Date.now();
  const data: VoiceAskDTO = await c.get('container').voiceAsk.ask({ businessId, userId }, text);
  // Sizes and timings only.
  c.get('logger').info('voice_ask', { reply_length: data.reply.length, approvals: data.approvals.length, actions: data.actions?.length ?? 0, duration_ms: Date.now() - started });
  return c.json({ data });
});

/**
 * Streamed variant of /voice/ask for the Hey Clovie service: server-sent events, so the phone can speak the first
 * sentence while the rest is still being written. Events: `text-delta` {delta}; `done` = VoiceAskStreamDoneDTO (the
 * whole-reply data plus timing); `error` {code, retryable}. Failures before the first byte are the usual JSON error.
 * The client disconnecting aborts the upstream Nerova request. Never logs the text or the reply.
 */
voiceAskRoutes.post('/voice/ask/stream', requireFeature('companion'), async (c) => {
  const { text } = await parseJson(c, askSchema);
  const { businessId, userId } = c.get('auth');
  const started = Date.now();
  const abort = new AbortController();
  c.req.raw.signal.addEventListener('abort', () => abort.abort(), { once: true });
  const { events, nerovaPreMs } = await c.get('container').voiceAsk.askStream({ businessId, userId }, text, abort.signal);
  const proxyPreMs = Date.now() - started;
  const authMs = c.get('authMs');
  c.header('Server-Timing', [...(typeof authMs === 'number' ? [`auth;dur=${Math.round(authMs)}`] : []), `proxy-pre;dur=${proxyPreMs}`, ...(nerovaPreMs === null ? [] : [`nerova-pre;dur=${nerovaPreMs}`])].join(', '));
  const log = c.get('logger');
  return streamSSE(c, async (stream) => {
    stream.onAbort(() => abort.abort());
    let firstTextMs: number | undefined;
    let outcome = 'closed';
    try {
      for await (const item of events) {
        if (item.type === 'text-delta') {
          firstTextMs ??= Date.now() - started;
          await stream.writeSSE({ event: 'text-delta', data: JSON.stringify({ delta: item.delta }) });
        } else if (item.type === 'done') {
          const timing: VoiceAskTimingDTO = {
            ...item.timing && Object.fromEntries(Object.entries(item.timing).filter(([, v]) => v !== null)),
            ...(nerovaPreMs === null ? {} : { nerovaPreMs }),
            proxyPreMs,
            ...(firstTextMs === undefined ? {} : { proxyFirstTextMs: firstTextMs }),
            proxyTotalMs: Date.now() - started,
          };
          const data: VoiceAskStreamDoneDTO = { ...item.data, timing };
          await stream.writeSSE({ event: 'done', data: JSON.stringify(data) });
          // Sizes and timings only.
          log.info('voice_ask_stream', { reply_length: data.reply.length, approvals: data.approvals.length, actions: data.actions?.length ?? 0, ...timing });
          outcome = 'done';
        } else {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ code: item.code, retryable: item.retryable }) });
          log.warn('voice_ask_stream_error', { code: item.code, duration_ms: Date.now() - started });
          outcome = 'error';
        }
      }
    } finally {
      abort.abort();
      if (outcome === 'closed') log.info('voice_ask_stream_closed', { duration_ms: Date.now() - started });
    }
  });
});

const ACTION_STATUS = z.enum(['executed', 'undone']).default('executed');

// Act-then-undo: undo exactly this executed action while its window is open.
voiceAskRoutes.post('/voice/actions/:id/undo', requireFeature('companion'), async (c) => {
  const id = c.req.param('id');
  if (!ACTION_ID_RE.test(id)) throw new AppError('VALIDATION_FAILED', 'Invalid action id', { field: 'id' });
  const { businessId, userId } = c.get('auth');
  const key = c.req.header('idempotency-key') ?? `voice-undo-${id}`;
  const data: VoiceActionDTO = await c.get('container').voiceAsk.undo({ businessId, userId }, id, key);
  c.get('logger').info('voice_action_undone', { status: data.status });
  return c.json({ data });
});

voiceAskRoutes.get('/voice/actions', requireFeature('companion'), async (c) => {
  const parsed = ACTION_STATUS.safeParse(c.req.query('status'));
  if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'status must be executed or undone', { field: 'status' });
  const { businessId, userId } = c.get('auth');
  const data = await c.get('container').voiceAsk.listActions({ businessId, userId }, parsed.data);
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
