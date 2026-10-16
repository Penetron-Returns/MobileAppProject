import { ApiError, newIdempotencyKey, parseEnvelope } from '@/lib/api';
import { getAuthToken } from '@/lib/auth-token';
import { env } from '@/lib/env';

/** `EXPO_PUBLIC_VOICE_CLOUD_STT=1` turns on own-capture + backend transcription. */
export const isCloudSttEnabled: boolean =
  process.env.EXPO_PUBLIC_VOICE_CLOUD_STT === '1';

export interface Transcription {
  text: string;
  duration_ms: number;
  language: string | null;
}

/**
 * Uploads a WAV clip (a `file://` path or absolute path) to
 * `POST /v1/voice/transcriptions` as multipart field `audio`. No language is
 * sent: the server detects it (English or Afrikaans). Throws `ApiError` on
 * network, 4xx (404 while the backend is not live) or 5xx failures.
 */
export async function transcribeClip(clipPath: string): Promise<Transcription> {
  if (!env.apiUrl) {
    throw new ApiError({
      code: 'NOT_CONFIGURED',
      message: 'EXPO_PUBLIC_API_URL is not set.',
      status: 0,
    });
  }
  const token = await getAuthToken();
  if (!token) {
    throw new ApiError({
      code: 'NOT_SIGNED_IN',
      message: 'No session token is available yet.',
      status: 401,
    });
  }
  const uri = clipPath.startsWith('/') ? `file://${clipPath}` : clipPath;
  const form = new FormData();
  // React Native's FormData reads a file part from this uri/name/type object.
  form.append('audio', { uri, name: 'clip.wav', type: 'audio/wav' } as never);
  let res: Response;
  try {
    // No Content-Type: fetch sets the multipart boundary itself.
    res = await fetch(`${env.apiUrl}/v1/voice/transcriptions`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
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
  return parseEnvelope<Transcription>(res);
}
