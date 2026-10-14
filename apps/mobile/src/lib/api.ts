import * as Crypto from 'expo-crypto';

import type {
  ApiErrorBody,
  ApiErrorCode,
  AppointmentDTO,
  AvailableDaysResponse,
  AvailableSlotsResponse,
  AvailabilityRuleInput,
  BusinessDTO,
  CancelAppointmentRequest,
  ClientDTO,
  ClientNoteDTO,
  CreateAppointmentRequest,
  CreateClientNoteRequest,
  CreateClientRequest,
  CreateOverrideRequest,
  CreateServiceRequest,
  CreateStaffRequest,
  ManualConnectRequest,
  MeDTO,
  OnboardingRequest,
  PublicBookingRequest,
  PublicBookingResponse,
  PublicBusinessResponse,
  RegisterDeviceRequest,
  ReplaceBusinessHoursRequest,
  RescheduleAppointmentRequest,
  ResolveEscalationRequest,
  SendStaffMessageRequest,
  ServiceDTO,
  SetAppointmentStatusRequest,
  StaffDTO,
  StartAttemptResponse,
  TestMessageRequest,
  UpdateAppointmentRequest,
  UpdateBusinessRequest,
  UpdateClientRequest,
  UpdateServiceRequest,
  UpdateStaffRequest,
  WhatsAppChannelDTO,
} from '@shared/api';

import { getAuthToken } from './auth-token';
import { env } from './env';

/** Client-side codes for failures that never reached the API. */
export type ClientErrorCode =
  'NETWORK_ERROR' | 'BAD_RESPONSE' | 'NOT_CONFIGURED';

export class ApiError extends Error {
  readonly code: ApiErrorCode | ClientErrorCode;
  readonly status: number;
  readonly requestId: string | null;
  readonly details?: Record<string, unknown>;

  constructor(opts: {
    code: ApiErrorCode | ClientErrorCode;
    message: string;
    status: number;
    requestId?: string | null;
    details?: Record<string, unknown>;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.code = opts.code;
    this.status = opts.status;
    this.requestId = opts.requestId ?? null;
    this.details = opts.details;
  }

  /** Worth retrying with the SAME idempotency key (the server may not have seen it). */
  get isRetryable() {
    return (
      this.code === 'NETWORK_ERROR' ||
      this.code === 'RATE_LIMITED' ||
      this.status >= 500
    );
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** Required for every mutating call; generate once per user action. */
  idempotencyKey?: string;
  /** Attach the Clerk bearer token (default true; false for /public/**). */
  auth?: boolean;
  signal?: AbortSignal;
}

export function buildUrl(base: string, path: string, query?: Query) {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        )
        .join('&')
    : '';
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}

/** Parses the `{ data }` / `{ error }` envelope into data or an ApiError. */
export async function parseEnvelope<T>(res: Response): Promise<T> {
  const headerRequestId = res.headers?.get?.('x-request-id') ?? null;
  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (res.ok) {
    if (json && typeof json === 'object' && 'data' in json) {
      return (json as { data: T }).data;
    }
    if (res.status === 204 || !text) return undefined as T;
    throw new ApiError({
      code: 'BAD_RESPONSE',
      message: 'The server returned an unexpected response.',
      status: res.status,
      requestId: headerRequestId,
    });
  }

  const body = json as Partial<ApiErrorBody> | null;
  if (body && body.error && typeof body.error.code === 'string') {
    throw new ApiError({
      code: body.error.code,
      message: body.error.message || 'Request failed',
      status: res.status,
      requestId: body.error.request_id ?? headerRequestId,
      details: body.error.details,
    });
  }
  throw new ApiError({
    code: res.status >= 500 ? 'INTERNAL' : 'BAD_RESPONSE',
    message: `Request failed (${res.status})`,
    status: res.status,
    requestId: headerRequestId,
  });
}

export async function apiRequest<T>(
  method: Method,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  if (!env.apiUrl) {
    throw new ApiError({
      code: 'NOT_CONFIGURED',
      message: 'EXPO_PUBLIC_API_URL is not set.',
      status: 0,
    });
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    if (!opts.idempotencyKey) {
      // Programming error: every mutation needs a key minted per user action.
      throw new Error(`Missing Idempotency-Key for ${method} ${path}`);
    }
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }
  if (opts.auth !== false) {
    const token = await getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(env.apiUrl, path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection.',
      status: 0,
    });
  }
  return parseEnvelope<T>(res);
}

const get = <T>(path: string, query?: Query, auth = true) =>
  apiRequest<T>('GET', path, { query, auth });
const send =
  <B, T>(method: Exclude<Method, 'GET'>, path: string, auth = true) =>
  (body: B, idempotencyKey: string) =>
    apiRequest<T>(method, path, {
      body: body === undefined ? undefined : body,
      idempotencyKey,
      auth,
    });

const enc = encodeURIComponent;

/** Typed endpoint map (docs/BUILD_PLAN.md §4). */
export const api = {
  me: () => get<MeDTO>('/v1/me'),

  // onboarding: needs only an org-owner session, no business yet
  onboard: (b: OnboardingRequest, key: string) =>
    send<OnboardingRequest, MeDTO>('POST', '/v1/onboarding')(b, key),

  // business
  updateBusiness: (b: UpdateBusinessRequest, key: string) =>
    send<UpdateBusinessRequest, BusinessDTO>('PATCH', '/v1/business')(b, key),
  replaceHours: (b: ReplaceBusinessHoursRequest, key: string) =>
    send<ReplaceBusinessHoursRequest, unknown>('PUT', '/v1/business/hours')(
      b,
      key,
    ),

  // services
  createService: (b: CreateServiceRequest, key: string) =>
    send<CreateServiceRequest, ServiceDTO>('POST', '/v1/services')(b, key),
  updateService: (id: string, b: UpdateServiceRequest, key: string) =>
    send<UpdateServiceRequest, ServiceDTO>('PATCH', `/v1/services/${enc(id)}`)(
      b,
      key,
    ),
  deleteService: (id: string, key: string) =>
    send<undefined, unknown>('DELETE', `/v1/services/${enc(id)}`)(
      undefined,
      key,
    ),

  // staff
  createStaff: (b: CreateStaffRequest, key: string) =>
    send<CreateStaffRequest, StaffDTO>('POST', '/v1/staff')(b, key),
  updateStaff: (id: string, b: UpdateStaffRequest, key: string) =>
    send<UpdateStaffRequest, StaffDTO>('PATCH', `/v1/staff/${enc(id)}`)(b, key),
  deleteStaff: (id: string, key: string) =>
    send<undefined, unknown>('DELETE', `/v1/staff/${enc(id)}`)(undefined, key),
  replaceStaffServices: (id: string, service_ids: string[], key: string) =>
    send<{ service_ids: string[] }, unknown>(
      'PUT',
      `/v1/staff/${enc(id)}/services`,
    )({ service_ids }, key),
  replaceStaffAvailability: (
    id: string,
    rules: AvailabilityRuleInput[],
    key: string,
  ) =>
    send<{ rules: AvailabilityRuleInput[] }, unknown>(
      'PUT',
      `/v1/staff/${enc(id)}/availability`,
    )({ rules }, key),
  createOverride: (b: CreateOverrideRequest, key: string) =>
    send<CreateOverrideRequest, unknown>('POST', '/v1/overrides')(b, key),
  deleteOverride: (id: string, key: string) =>
    send<undefined, unknown>('DELETE', `/v1/overrides/${enc(id)}`)(
      undefined,
      key,
    ),

  // clients
  createClient: (b: CreateClientRequest, key: string) =>
    send<CreateClientRequest, ClientDTO>('POST', '/v1/clients')(b, key),
  updateClient: (id: string, b: UpdateClientRequest, key: string) =>
    send<UpdateClientRequest, ClientDTO>('PATCH', `/v1/clients/${enc(id)}`)(
      b,
      key,
    ),
  addClientNote: (id: string, b: CreateClientNoteRequest, key: string) =>
    send<CreateClientNoteRequest, ClientNoteDTO>(
      'POST',
      `/v1/clients/${enc(id)}/notes`,
    )(b, key),
  deleteClientNote: (id: string, noteId: string, key: string) =>
    send<undefined, unknown>(
      'DELETE',
      `/v1/clients/${enc(id)}/notes/${enc(noteId)}`,
    )(undefined, key),

  // availability (always live, never cached for long)
  availableDays: (q: {
    service_id: string;
    from: string;
    to: string;
    staff_id?: string | null;
  }) => get<AvailableDaysResponse>('/v1/availability/days', q),
  availableSlots: (q: {
    service_id: string;
    date: string;
    staff_id?: string | null;
  }) => get<AvailableSlotsResponse>('/v1/availability/slots', q),

  // appointments
  createAppointment: (b: CreateAppointmentRequest, key: string) =>
    send<CreateAppointmentRequest, AppointmentDTO>('POST', '/v1/appointments')(
      b,
      key,
    ),
  rescheduleAppointment: (
    id: string,
    b: RescheduleAppointmentRequest,
    key: string,
  ) =>
    send<RescheduleAppointmentRequest, AppointmentDTO>(
      'POST',
      `/v1/appointments/${enc(id)}/reschedule`,
    )(b, key),
  cancelAppointment: (id: string, b: CancelAppointmentRequest, key: string) =>
    send<CancelAppointmentRequest, AppointmentDTO>(
      'POST',
      `/v1/appointments/${enc(id)}/cancel`,
    )(b, key),
  setAppointmentStatus: (
    id: string,
    b: SetAppointmentStatusRequest,
    key: string,
  ) =>
    send<SetAppointmentStatusRequest, AppointmentDTO>(
      'POST',
      `/v1/appointments/${enc(id)}/status`,
    )(b, key),
  checkInAppointment: (id: string, key: string) =>
    send<Record<string, never>, AppointmentDTO>(
      'POST',
      `/v1/appointments/${enc(id)}/check-in`,
    )({}, key),
  updateAppointment: (id: string, b: UpdateAppointmentRequest, key: string) =>
    send<UpdateAppointmentRequest, AppointmentDTO>(
      'PATCH',
      `/v1/appointments/${enc(id)}`,
    )(b, key),

  // devices
  registerDevice: (b: RegisterDeviceRequest, key: string) =>
    send<RegisterDeviceRequest, unknown>('POST', '/v1/devices')(b, key),

  // WhatsApp channel
  whatsapp: () => get<WhatsAppChannelDTO>('/v1/whatsapp'),
  whatsappConnect: (b: ManualConnectRequest, key: string) =>
    send<ManualConnectRequest, WhatsAppChannelDTO>(
      'POST',
      '/v1/whatsapp/connect',
    )(b, key),
  whatsappAction: (
    action: 'sync' | 'pause' | 'resume' | 'disconnect',
    key: string,
  ) =>
    send<Record<string, never>, unknown>('POST', `/v1/whatsapp/${action}`)(
      {},
      key,
    ),
  whatsappTestMessage: (b: TestMessageRequest, key: string) =>
    send<TestMessageRequest, unknown>('POST', '/v1/whatsapp/test-message')(
      b,
      key,
    ),

  // inbox
  sendStaffMessage: (
    conversationId: string,
    b: SendStaffMessageRequest,
    key: string,
  ) =>
    send<SendStaffMessageRequest, unknown>(
      'POST',
      `/v1/conversations/${enc(conversationId)}/messages`,
    )(b, key),
  releaseConversation: (conversationId: string, key: string) =>
    send<Record<string, never>, unknown>(
      'POST',
      `/v1/conversations/${enc(conversationId)}/release`,
    )({}, key),
  resolveEscalation: (id: string, b: ResolveEscalationRequest, key: string) =>
    send<ResolveEscalationRequest, unknown>(
      'POST',
      `/v1/escalations/${enc(id)}/resolve`,
    )(b, key),
};

/** Public web-booking comparator (no auth). */
export const publicApi = {
  business: (slug: string) =>
    get<PublicBusinessResponse>(`/public/b/${enc(slug)}`, undefined, false),
  days: (
    slug: string,
    q: {
      service_id: string;
      from: string;
      to: string;
      staff_id?: string | null;
    },
  ) =>
    get<AvailableDaysResponse>(
      `/public/b/${enc(slug)}/availability/days`,
      q,
      false,
    ),
  slots: (
    slug: string,
    q: { service_id: string; date: string; staff_id?: string | null },
  ) =>
    get<AvailableSlotsResponse>(
      `/public/b/${enc(slug)}/availability/slots`,
      q,
      false,
    ),
  startAttempt: (slug: string, key: string) =>
    send<Record<string, never>, StartAttemptResponse>(
      'POST',
      `/public/b/${enc(slug)}/attempts`,
      false,
    )({}, key),
  recordStep: (attemptId: string, step: string, key: string) =>
    send<{ step: string }, unknown>(
      'POST',
      `/public/attempts/${enc(attemptId)}/steps`,
      false,
    )({ step }, key),
  book: (slug: string, b: PublicBookingRequest, key: string) =>
    send<PublicBookingRequest, PublicBookingResponse>(
      'POST',
      `/public/b/${enc(slug)}/bookings`,
      false,
    )(b, key),
};
