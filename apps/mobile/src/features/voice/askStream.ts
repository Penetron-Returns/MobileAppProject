/**
 * Streamed voice ask: `POST /v1/voice/ask/stream` answers with server-sent events (`text-delta` {delta}, then `done`
 * with the whole reply, approvals and actions, or `error`). The text is handed on as it arrives so the service can speak
 * the first sentence while the rest is still being written. Pure apart from the injected `fetch`, so it is unit tested.
 * Never logs the text or the reply.
 */
import { fetch as expoFetch } from 'expo/fetch';

import { ApiError, parseEnvelope } from '@/lib/api';
import { reportBearerResult, resolveBearer } from '@/lib/auth-token';
import { env } from '@/lib/env';

import type { AskResult } from './ask';

export interface AskStreamHooks {
  /** The first bytes of the body arrived. */
  onFirstByte?: () => void;
  /** The next piece of the reply text. */
  onText?: (delta: string) => void;
  /** False once the command was cancelled or timed out: the stream is dropped. */
  isActive?: () => boolean;
}

interface SseFrame {
  event: string;
  data: string;
}

/** Feeds SSE text in any chunking and returns the frames each chunk completed (a frame ends at a blank line). */
export function createSseParser(): {
  push: (chunk: string) => SseFrame[];
  flush: () => SseFrame[];
} {
  let buffer = '';
  const take = (final: boolean): SseFrame[] => {
    const text = buffer.replace(/\r\n?/g, '\n');
    // A trailing CR may be half of a CRLF: keep it for the next chunk.
    const hold = !final && buffer.endsWith('\r');
    const body = hold ? text.slice(0, -1) : text;
    const boundary = body.lastIndexOf('\n\n');
    if (!final && boundary < 0) return [];
    const cut = final ? body.length : boundary + 2;
    buffer = body.slice(cut) + (hold ? '\r' : '');
    return toFrames(body.slice(0, cut));
  };
  return {
    push(chunk) {
      buffer += chunk;
      return take(false);
    },
    flush: () => take(true),
  };
}

function toFrames(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of text.split('\n\n')) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:'))
        data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length > 0) frames.push({ event, data: data.join('\n') });
  }
  return frames;
}

const abortError = () =>
  Object.assign(new Error('The request was cancelled.'), {
    name: 'AbortError',
  });

export interface ByteReader {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
  cancel: () => Promise<void> | void;
}

function parseJson(data: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Reads the stream to its `done`: calls `onText` for each delta and returns the whole reply. An `error` frame throws an
 * ApiError carrying our code (RATE_LIMITED, COMPANION_NOT_READY, ...); a stream that ends without `done` throws NETWORK_ERROR.
 */
export async function readAskStream(
  reader: ByteReader,
  hooks: AskStreamHooks = {},
): Promise<AskResult> {
  const decoder = new TextDecoder();
  const sse = createSseParser();
  let isFirst = true;
  try {
    for (;;) {
      if (hooks.isActive?.() === false) throw abortError();
      const chunk = await reader.read();
      if (isFirst) {
        isFirst = false;
        hooks.onFirstByte?.();
      }
      const frames = chunk.done
        ? sse.flush()
        : sse.push(decoder.decode(chunk.value, { stream: true }));
      for (const frame of frames) {
        const data = parseJson(frame.data);
        if (!data) continue;
        if (frame.event === 'text-delta' && typeof data.delta === 'string')
          hooks.onText?.(data.delta);
        else if (frame.event === 'done') return toResult(data);
        else if (frame.event === 'error') throw streamError(data);
      }
      if (chunk.done) break;
    }
  } finally {
    await Promise.resolve(reader.cancel()).catch(() => undefined);
  }
  throw new ApiError({
    code: 'NETWORK_ERROR',
    message: 'The reply was cut off.',
    status: 0,
  });
}

function toResult(data: Record<string, unknown>): AskResult {
  return {
    reply: typeof data.reply === 'string' ? data.reply : '',
    approvals: Array.isArray(data.approvals)
      ? (data.approvals as AskResult['approvals'])
      : [],
    ...(Array.isArray(data.actions)
      ? { actions: data.actions as NonNullable<AskResult['actions']> }
      : {}),
    ...(Array.isArray(data.suggestions)
      ? { suggestions: data.suggestions as string[] }
      : {}),
    ...(typeof data.awaitingReply === 'boolean'
      ? { awaitingReply: data.awaitingReply }
      : {}),
  };
}

function streamError(data: Record<string, unknown>): ApiError {
  const code =
    typeof data.code === 'string' && /^[A-Z_]{3,40}$/.test(data.code)
      ? data.code
      : 'UPSTREAM_COMPANION_ERROR';
  return new ApiError({
    code: code as ApiError['code'],
    message: 'The companion could not answer.',
    status: 200,
  });
}

export interface StreamAskOptions {
  fetchImpl?: typeof fetch;
  /** How often to check `isActive` while waiting for bytes (default 300 ms). */
  pollMs?: number;
}

/**
 * Sends the ask and reads the reply as it streams. Needs a streaming fetch (`expo/fetch`). Throws ApiError like the
 * whole-reply call does: 404 means the API has no stream route yet (the caller falls back to `api.voiceAsk`).
 */
export async function streamVoiceAsk(
  text: string,
  idempotencyKey: string,
  hooks: AskStreamHooks = {},
  options: StreamAskOptions = {},
): Promise<AskResult> {
  if (!env.apiUrl)
    throw new ApiError({
      code: 'NOT_CONFIGURED',
      message: 'EXPO_PUBLIC_API_URL is not set.',
      status: 0,
    });
  const credential = await resolveBearer({ allowDeviceToken: true });
  if (!credential)
    throw new ApiError({
      code: 'NOT_SIGNED_IN',
      message: 'No session token is available yet.',
      status: 401,
    });
  const controller = new AbortController();
  const poll = hooks.isActive
    ? setInterval(() => {
        if (hooks.isActive?.() === false) controller.abort();
      }, options.pollMs ?? 300)
    : undefined;
  try {
    let res: Response;
    try {
      res = await (options.fetchImpl ?? (expoFetch as unknown as typeof fetch))(
        `${env.apiUrl}/v1/voice/ask/stream`,
        {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${credential.token}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' || controller.signal.aborted)
        throw abortError();
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: 'Could not reach the server.',
        status: 0,
      });
    }
    reportBearerResult(credential, res.status);
    if (!res.ok || !res.body) return await parseEnvelope<AskResult>(res);
    try {
      return await readAskStream(
        res.body.getReader() as unknown as ByteReader,
        hooks,
      );
    } catch (error) {
      if (controller.signal.aborted) throw abortError();
      throw error;
    }
  } finally {
    if (poll) clearInterval(poll);
    controller.abort();
  }
}

/** The API has no stream route (yet): use the whole-reply call. */
export function isStreamUnavailable(error: unknown): boolean {
  const { status } = (error ?? {}) as { status?: unknown };
  return status === 404 || status === 405;
}

/**
 * Holds the "One sec" filler back while a streamed reply may start sooner: it speaks after `delayMs` unless `cancel` came
 * first (the first text arrived). With streaming off, `schedule` speaks at once.
 */
export function createFillerGate(
  speak: (text: string) => void,
  delayMs: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(text: string, isDelayed: boolean) {
      if (!isDelayed) return speak(text);
      timer = setTimeout(() => {
        timer = undefined;
        speak(text);
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
