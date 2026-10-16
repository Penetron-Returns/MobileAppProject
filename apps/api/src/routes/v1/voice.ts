/**
 * Cloud speech-to-text for the Clovie voice feature: POST /v1/voice/transcriptions (multipart `audio`, optional
 * `language`; wav, m4a, webm, mp3 or ogg), proxied to Nerova through the companion service. Owner and staff. Never logs audio or transcript text.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';

import type { EntitlementService } from '@booking/features/ports.ts';
import { withEntitlementCache } from '@booking/companion/connector/staticReadCache.ts';
import type { DeviceTokenDTO, TranscriptionDTO, VoiceTodayDTO } from '@booking/types';
import { getBookingRepository } from '@booking/features/bookings/index.ts';
import { listVoiceToday } from '@booking/features/bookings/services/voiceToday.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { parseJson } from '../../lib/validation.ts';
import type { AppEnv } from '../../types.ts';

export const voiceRoutes = new Hono<AppEnv>();

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
/** Multipart framing around the file (boundaries, headers, the language field). */
const MULTIPART_OVERHEAD_BYTES = 16 * 1024;

const AUDIO_TYPES = new Set([
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
  'audio/mp4', 'audio/m4a', 'audio/x-m4a',
  'audio/webm', 'video/webm',
  'audio/mpeg', 'audio/mp3',
  'audio/ogg', 'application/ogg',
]);
const AUDIO_EXTENSIONS = new Set(['wav', 'm4a', 'webm', 'mp3', 'ogg']);
/** Types a client sends when it does not know the format: decide by the file extension instead. */
const GENERIC_TYPES = new Set(['', 'application/octet-stream']);
const LANGUAGE_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

const voiceEnabled: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('container').env.VOICE_CLOUD_STT !== 'true') {
    throw new AppError('TRANSCRIPTION_UNAVAILABLE', 'Cloud transcription is not available');
  }
  await next();
};

/** Rejects an oversized upload from its Content-Length before the body is read. */
const limitContentLength: MiddlewareHandler<AppEnv> = async (c, next) => {
  const declared = Number(c.req.header('content-length'));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES + MULTIPART_OVERHEAD_BYTES) throw tooLarge();
  await next();
};

const tooLarge = () => new AppError('PAYLOAD_TOO_LARGE', 'The audio clip is larger than 4 MiB', { max_bytes: MAX_AUDIO_BYTES });

function isSupportedAudio(file: File): boolean {
  const type = file.type.split(';')[0]!.trim().toLowerCase();
  if (AUDIO_TYPES.has(type)) return true;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return GENERIC_TYPES.has(type) && AUDIO_EXTENSIONS.has(extension);
}

async function readUpload(c: Context<AppEnv>): Promise<{ file: File; language: string | undefined }> {
  if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Send multipart/form-data with an audio field');
  }
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Request body must be valid multipart/form-data');
  }
  const file = form.get('audio');
  if (!(file instanceof File) || file.size === 0) throw new AppError('VALIDATION_FAILED', 'An audio file is required in the "audio" field');
  if (file.size > MAX_AUDIO_BYTES) throw tooLarge();
  if (!isSupportedAudio(file)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Unsupported audio format (use wav, m4a, webm, mp3 or ogg)');
  const rawLanguage = form.get('language');
  const language = typeof rawLanguage === 'string' && rawLanguage.trim() !== '' ? rawLanguage.trim() : undefined;
  if (language !== undefined && !LANGUAGE_RE.test(language)) throw new AppError('VALIDATION_FAILED', 'Invalid language code', { field: 'language' });
  return { file, language };
}

/**
 * The plan check is cached for 60 s per isolate (the existing entitlement cache): a plan change reaches voice
 * within a minute, and a clip does not pay a database round trip for it.
 */
const entitlementCaches = new WeakMap<EntitlementService, EntitlementService>();
function voiceEntitlements(entitlements: EntitlementService): EntitlementService {
  let cached = entitlementCaches.get(entitlements);
  if (!cached) {
    cached = withEntitlementCache(entitlements);
    entitlementCaches.set(entitlements, cached);
  }
  return cached;
}

/**
 * The plan check and the body read are independent, so they run side by side. The plan error still wins when both
 * fail, so a Free-plan caller is told about the plan, not about the upload.
 */
async function readUploadForPlan(c: Context<AppEnv>): Promise<{ file: File; language: string | undefined }> {
  const { businessId } = c.get('auth');
  const [allowed, upload] = await Promise.allSettled([
    voiceEntitlements(c.get('container').entitlements).hasFeature(businessId, 'companion'),
    readUpload(c),
  ]);
  if (allowed.status === 'rejected') throw allowed.reason;
  if (!allowed.value) throw new AppError('FEATURE_NOT_IN_PLAN', 'This feature is not included in your plan', { feature: 'companion' });
  if (upload.status === 'rejected') throw upload.reason;
  return upload.value;
}

/** `nerova;dur=…, proxy;dur=…`: lets the phone subtract each hop from its own round trip. Timings only. */
export function serverTimingHeader(nerovaMs: number | null | undefined, proxyMs: number, authMs?: number | null): string {
  const entries = typeof nerovaMs === 'number' ? [`nerova;dur=${Math.round(nerovaMs)}`] : [];
  entries.push(`proxy;dur=${Math.round(proxyMs)}`);
  if (typeof authMs === 'number') entries.push(`auth;dur=${Math.round(authMs)}`);
  return entries.join(', ');
}

voiceRoutes.post('/voice/transcriptions', voiceEnabled, limitContentLength, async (c) => {
  const started = Date.now();
  const { file, language } = await readUploadForPlan(c);
  const result = await c.get('container').companion.transcribe(
    c.get('auth').businessId,
    { data: file, filename: file.name || 'clip', contentType: file.type || 'application/octet-stream' },
    { language },
  );
  // Sizes and timings only: never the audio or the transcript.
  const proxyMs = Date.now() - started;
  c.get('logger').info('voice_transcription', {
    size_bytes: file.size,
    text_length: result.text.length,
    duration_ms: proxyMs,
    nerova_ms: result.nerova_ms ?? null,
  });
  const data: TranscriptionDTO = { text: result.text, duration_ms: result.duration_ms, language: result.language };
  c.header('Server-Timing', serverTimingHeader(result.nerova_ms, proxyMs, c.get('authMs')));
  return c.json({ data });
});

/**
 * Cheap authenticated no-op the phone calls when the wake word fires, so DNS, TLS and the Edge Function (and its
 * device-token lookup) are already warm when the clip is uploaded a few seconds later. Touches nothing else.
 */
voiceRoutes.get('/voice/ping', (c) => {
  const authMs = c.get('authMs');
  if (typeof authMs === 'number') c.header('Server-Timing', `auth;dur=${Math.round(authMs)}`);
  return c.json({ data: { ok: true } });
});

const mintDeviceTokenSchema = z.object({ device_label: z.string().trim().min(1).max(80).optional() });

/**
 * Mints the caller's device voice token (Clerk session only: the device-token middleware refuses `cvt_` here).
 * Replaces the previous token of the same user and device. The token is returned once and never logged.
 */
voiceRoutes.post('/voice/device-token', async (c) => {
  const { device_label } = await parseJson(c, mintDeviceTokenSchema);
  const { businessId, userId } = c.get('auth');
  const token = await c.get('container').voiceTokens.mint({ businessId, userId, deviceLabel: device_label });
  c.get('logger').info('voice_device_token_minted');
  const data: DeviceTokenDTO = { token };
  return c.json({ data }, 201);
});

/** Revokes every device voice token of the caller (sign-out). */
voiceRoutes.delete('/voice/device-token', async (c) => {
  const { businessId, userId } = c.get('auth');
  await c.get('container').voiceTokens.revoke({ businessId, userId });
  c.get('logger').info('voice_device_token_revoked');
  return c.json({ data: { revoked: true } });
});

/** Today's appointments (business-local day) for the voice check-in. Minimal fields; reachable with a device token. */
voiceRoutes.get('/voice/today', async (c) => {
  const container = c.get('container');
  const data: VoiceTodayDTO = await listVoiceToday(getBookingRepository(container), c.get('auth').businessId, container.clock());
  return c.json({ data });
});
