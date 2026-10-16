import { ApiError, newIdempotencyKey, parseEnvelope } from '@/lib/api';
import { reportBearerResult, resolveBearer } from '@/lib/auth-token';
import { env } from '@/lib/env';

/** `EXPO_PUBLIC_VOICE_CLOUD_STT=1` turns on own-capture + backend transcription. */
export const isCloudSttEnabled: boolean =
  process.env.EXPO_PUBLIC_VOICE_CLOUD_STT === '1';

export interface Transcription {
  text: string;
  duration_ms: number;
  language: string | null;
}

/** The name and content type to upload a clip under: the service writes m4a (AAC) and falls back to WAV. */
export function clipUploadMeta(clipPath: string): {
  name: string;
  type: string;
} {
  return clipPath.toLowerCase().endsWith('.m4a')
    ? { name: 'clip.m4a', type: 'audio/mp4' }
    : { name: 'clip.wav', type: 'audio/wav' };
}

/**
 * Uploads a clip (m4a or WAV) (a `file://` path or absolute path) to
 * `POST /v1/voice/transcriptions` as multipart field `audio`. No language is
 * sent: the server detects it (English or Afrikaans). Throws `ApiError` on
 * network, 4xx (404 while the backend is not live) or 5xx failures. Authenticated with the Clerk
 * session, or the device voice token when there is none.
 */
export async function transcribeClip(clipPath: string): Promise<Transcription> {
  if (!env.apiUrl) {
    throw new ApiError({
      code: 'NOT_CONFIGURED',
      message: 'EXPO_PUBLIC_API_URL is not set.',
      status: 0,
    });
  }
  // No Clerk session while the app is backgrounded or killed: the scoped device voice token stands in.
  const credential = await resolveBearer({ allowDeviceToken: true });
  if (!credential) {
    throw new ApiError({
      code: 'NOT_SIGNED_IN',
      message: 'No session token is available yet.',
      status: 401,
    });
  }
  const uri = clipPath.startsWith('/') ? `file://${clipPath}` : clipPath;
  const form = new FormData();
  // React Native's FormData reads a file part from this uri/name/type object.
  form.append('audio', { uri, ...clipUploadMeta(clipPath) } as never);
  let res: Response;
  try {
    // No Content-Type: fetch sets the multipart boundary itself.
    res = await fetch(`${env.apiUrl}/v1/voice/transcriptions`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${credential.token}`,
        'Idempotency-Key': newIdempotencyKey(),
      },
      body: form,
    });
  } catch {
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server.',
      status: 0,
    });
  }
  reportBearerResult(credential, res.status);
  return parseEnvelope<Transcription>(res);
}
