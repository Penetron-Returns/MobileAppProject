import type {
  AvailableDaysResponse,
  AvailableSlotsResponse,
  PublicBookingRequest,
  PublicBookingResponse,
  PublicBusinessResponse,
  StartAttemptResponse,
} from '@shared/api';

import { enc, get, send } from './client';

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
